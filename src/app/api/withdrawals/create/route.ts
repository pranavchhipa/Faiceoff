// ─────────────────────────────────────────────────────────────────────────────
// POST /api/withdrawals/create — initiate a creator withdrawal
// Ref plan Task 28 / spec §4.4 CREATOR PAYOUT (Step-by-step)
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow (locking + idempotent-able):
//   1. Auth gate (401).
//   2. Zod validate: min ₹500, max ₹10,00,000; optional bank_account_id uuid.
//   3. Creator lookup + KYC verified gate (403/409).
//   4. Resolve the target bank row — either the passed bank_account_id if
//      it belongs to this creator and is_active, or the creator's currently
//      active bank (uniq_active_bank_per_creator). 409 if none.
//   5. Pending-balance guard: creators.pending_balance_paise >= gross.
//      This is an early-exit; the PL/pgSQL success procedure also validates
//      but we want to avoid creating a wasteful row + Cashfree call.
//   6. Insert withdrawal_requests with gross, zero deductions (placeholders),
//      net=gross, bank snapshot (last4, ifsc, bank_name), status='requested'.
//   7. commitWithdrawalDeductions(id) → procedure computes TCS/TDS/GST,
//      transitions to 'deductions_applied', updates net_paise. On failure
//      return 500 (row kept for admin inspection).
//   8. Re-read row to get net_paise.
//   9. createTransfer(transferId=wr.id, beneficiaryId, amountPaise=net_paise).
//      - On throw: commitWithdrawalFailure(wr.id, reason) → status='failed',
//        tax reversals. Return 502.
//      - On success: update withdrawal_requests → status='processing',
//        cf_transfer_id, cf_mode, processing_at=now.
//   10. Return 202 { withdrawal_id, status:'processing' }.
//
// The final success happens ASYNC via Cashfree's TRANSFER_SUCCESS webhook
// (handler in /api/webhooks/cashfree — out of scope here) which will call
// commit_withdrawal_success(id, utr).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTransfer,
  mapTransferStatus,
} from "@/lib/payments/cashfree/payouts";
import {
  commitWithdrawalDeductions,
  commitWithdrawalFailure,
  LedgerError,
} from "@/lib/ledger/commit";
import { CreateWithdrawalSchema } from "@/domains/withdrawal/types";

interface WithdrawAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        eq?(col: string, val: boolean | string): {
          order(col: string, opts: { ascending: boolean }): {
            limit(n: number): {
              maybeSingle(): Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
          maybeSingle(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert(row: Record<string, unknown>): {
      select(): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Parse + Zod ─────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateWithdrawalSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { amount_paise, bank_account_id } = parsed.data;

  const admin = createAdminClient() as unknown as WithdrawAdmin;

  // ── 3. Creator + KYC gate ──────────────────────────────────────────────────
  const { data: creatorRow } = await (admin
    .from("creators")
    .select("id, user_id, kyc_status, pending_balance_paise")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_withdraw" },
      { status: 403 },
    );
  }
  const creator = creatorRow as {
    id: string;
    kyc_status?: string | null;
    pending_balance_paise?: number | null;
  };
  if (creator.kyc_status !== "verified") {
    return NextResponse.json(
      { error: "kyc_incomplete", reason: "complete_kyc_before_withdraw" },
      { status: 409 },
    );
  }

  // ── 4. Resolve target bank row ─────────────────────────────────────────────
  // When a specific bank_account_id is passed we fetch by id+creator_id; otherwise
  // we use the creator's currently active bank.
  let bankRow: Record<string, unknown> | null = null;
  if (bank_account_id) {
    const { data } = await (admin
      .from("creator_bank_accounts")
      .select(
        "id, account_number_last4, ifsc, bank_name, cf_beneficiary_id, is_active, penny_drop_verified_at",
      )
      .eq("id", bank_account_id)
      .eq?.("creator_id", creator.id)
      ?.maybeSingle() ?? Promise.resolve({ data: null, error: null }));
    bankRow = data;
  } else {
    const chain = admin
      .from("creator_bank_accounts")
      .select(
        "id, account_number_last4, ifsc, bank_name, cf_beneficiary_id, is_active, penny_drop_verified_at",
      )
      .eq("creator_id", creator.id);
    const activeChain = chain.eq?.("is_active", true);
    if (activeChain) {
      const { data } = await activeChain
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      bankRow = data;
    }
  }
  if (!bankRow) {
    return NextResponse.json(
      { error: "no_active_bank", reason: "add_a_bank_account_first" },
      { status: 409 },
    );
  }
  const bank = bankRow as {
    id: string;
    account_number_last4: string;
    ifsc: string;
    bank_name: string;
    cf_beneficiary_id: string | null;
    is_active: boolean;
    penny_drop_verified_at: string | null;
  };
  if (!bank.is_active || !bank.penny_drop_verified_at) {
    return NextResponse.json(
      { error: "bank_not_verified", reason: "penny_drop_not_complete" },
      { status: 409 },
    );
  }

  // ── 5. creator_kyc snapshot (for beneficiary fallback) ─────────────────────
  const { data: kycRow } = await (admin
    .from("creator_kyc")
    .select(
      "creator_id, pan_verification_status, aadhaar_verified_at, is_gstin_registered, cf_beneficiary_id, status",
    )
    .eq("creator_id", creator.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  const beneficiaryId =
    bank.cf_beneficiary_id ??
    (kycRow as { cf_beneficiary_id?: string | null } | null)
      ?.cf_beneficiary_id ??
    user.id;

  // ── 6. Balance guard ───────────────────────────────────────────────────────
  if ((creator.pending_balance_paise ?? 0) < amount_paise) {
    return NextResponse.json(
      {
        error: "insufficient_balance",
        pending_balance_paise: creator.pending_balance_paise ?? 0,
        requested_paise: amount_paise,
      },
      { status: 409 },
    );
  }

  // ── 7. Insert withdrawal_requests ──────────────────────────────────────────
  const insertRow: Record<string, unknown> = {
    creator_id: creator.id,
    gross_paise: amount_paise,
    tcs_paise: 0,
    tds_paise: 0,
    gst_output_paise: 0,
    net_paise: amount_paise, // placeholder; overwritten by commit_withdrawal_deductions
    status: "requested",
    bank_account_number_masked: bank.account_number_last4,
    bank_ifsc: bank.ifsc,
    bank_name: bank.bank_name,
  };
  const { data: insertedRaw, error: insertError } = await admin
    .from("withdrawal_requests")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (insertError || !insertedRaw) {
    console.error("[withdrawals/create] insert failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const inserted = insertedRaw as {
    id: string;
    gross_paise: number;
    net_paise: number;
  };
  const withdrawalId = inserted.id;

  // ── 8. Commit deductions (atomic via PL/pgSQL) ─────────────────────────────
  let netPaise = inserted.net_paise;
  try {
    await commitWithdrawalDeductions(withdrawalId);
  } catch (err) {
    const message =
      err instanceof LedgerError
        ? err.message
        : err instanceof Error
          ? err.message
          : "deductions_failed";
    console.error("[withdrawals/create] commit deductions failed", message);
    // Leave row in 'requested' state so admin can inspect / retry.
    return NextResponse.json(
      { error: "deductions_failed", message, withdrawal_id: withdrawalId },
      { status: 500 },
    );
  }

  // Re-read to pick up the net_paise the procedure wrote.
  const { data: afterDeductionsRaw } = await (admin
    .from("withdrawal_requests")
    .select("id, gross_paise, tcs_paise, tds_paise, gst_output_paise, net_paise, status")
    .eq("id", withdrawalId)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (afterDeductionsRaw) {
    netPaise = (afterDeductionsRaw as { net_paise: number }).net_paise;
  }

  // ── 9. Call Cashfree transfer ──────────────────────────────────────────────
  let cfTransferIdToSave: string | null = null;
  let cfMode: string | null = null;
  try {
    const transfer = await createTransfer({
      transferId: withdrawalId,
      beneficiaryId,
      amountPaise: netPaise,
      mode: "IMPS",
      remarks: `Faiceoff withdrawal ${withdrawalId}`,
    });
    cfTransferIdToSave =
      (transfer as { cf_transfer_id?: string; transfer_id?: string })
        .cf_transfer_id ??
      (transfer as { transfer_id?: string }).transfer_id ??
      null;
    cfMode =
      (transfer as { transfer_mode?: string }).transfer_mode ?? "IMPS";
    // Normalise for sanity — not required for the write.
    mapTransferStatus(
      (transfer as { status?: string }).status ?? "PROCESSING",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "cashfree_error";
    console.error("[withdrawals/create] createTransfer failed", message);
    try {
      await commitWithdrawalFailure({
        withdrawalRequestId: withdrawalId,
        reason: `cashfree_createTransfer: ${message}`,
      });
    } catch (reverseErr) {
      console.error(
        "[withdrawals/create] reversal failed",
        reverseErr instanceof Error ? reverseErr.message : reverseErr,
      );
    }
    return NextResponse.json(
      { error: "cashfree_unavailable", message, withdrawal_id: withdrawalId },
      { status: 502 },
    );
  }

  // ── 10. Mark processing ────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  await admin
    .from("withdrawal_requests")
    .update({
      status: "processing",
      cf_transfer_id: cfTransferIdToSave,
      cf_mode: cfMode,
      processing_at: nowIso,
    })
    .eq("id", withdrawalId);

  // ── 11. Response ───────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      withdrawal_id: withdrawalId,
      status: "processing",
      gross_paise: amount_paise,
      net_paise: netPaise,
      cf_transfer_id: cfTransferIdToSave,
    },
    { status: 202 },
  );
}
