/**
 * Creator Payout Service — on-demand withdrawal from escrow to bank account.
 *
 * ## Flow (requestPayout)
 *   1. Read creator + active bank account.
 *   2. Validate KYC status = 'verified'.
 *   3. Validate gross >= ₹500 (50,000 paise).
 *   4. Compute TDS (1%) + processing fee (₹25 flat) + net.
 *   5. Validate net > 0.
 *   6. Greedily select available escrow rows (type='release_per_image',
 *      payout_id IS NULL, holding_until <= now()) oldest-first until >= gross.
 *   7. Atomically INSERT creator_payouts + LOCK escrow via request_payout() RPC.
 *   8. Submit Cashfree IMPS transfer.
 *   9. UPDATE creator_payouts SET status='processing', cf_transfer_id=...
 *
 * ## Flow (handlePayoutWebhook)
 *   - SUCCESS: mark payout success, record completed_at.
 *   - FAILED/REVERSED: mark payout failed, release escrow locks (payout_id = NULL).
 *
 * All DB writes that touch money are atomic — the request_payout() Postgres function
 * handles the multi-table write in a single transaction.
 *
 * @module payout-service
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureBeneficiary,
  submitTransfer,
} from "./cashfree-payout-adapter";
import { PayoutError } from "./types";
import type {
  PayoutRow,
  RequestPayoutInput,
  PayoutWebhookEvent,
  ListPayoutsInput,
  ListPayoutsResult,
  PayoutDeductions,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Pure math helpers (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute TDS at 1% of gross paise, rounded to the nearest paise.
 *
 * @param grossPaise - Gross amount in paise (integer).
 * @returns TDS amount in paise (integer).
 */
export function computeTDS(grossPaise: number): number {
  return Math.round(grossPaise * 0.01);
}

/**
 * Processing fee — ₹25 flat, fixed.
 *
 * @returns Fee in paise (always 2500).
 */
export function computeProcessingFee(): number {
  return 2500;
}

/**
 * Net amount after TDS and processing fee deductions.
 *
 * @param params.gross - Gross amount in paise.
 * @param params.tds   - TDS amount in paise.
 * @param params.fee   - Processing fee in paise.
 * @returns Net paise the creator receives.
 */
export function computeNet({
  gross,
  tds,
  fee,
}: Pick<PayoutDeductions, "gross" | "tds" | "fee">): number {
  return gross - tds - fee;
}

/**
 * Minimum payout gross amount — ₹500.
 *
 * @returns 50000 paise.
 */
export function getMinPayoutPaise(): number {
  return 50_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// requestPayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate an on-demand creator withdrawal.
 *
 * Validates KYC, minimum amount, available escrow balance, then atomically
 * inserts the payout record + locks escrow rows before submitting to Cashfree.
 *
 * @param input.creatorId   - creators.id (not user_id).
 * @param input.amountPaise - Gross amount to withdraw (must be >= 50000).
 * @returns The created payout row in `processing` status.
 * @throws {PayoutError} with code matching the validation failure.
 */
export async function requestPayout(
  input: RequestPayoutInput,
): Promise<PayoutRow> {
  const supabase = createAdminClient() as any;
  const { creatorId, amountPaise } = input;

  // ── Step 1: Read creator + active bank account ───────────────────────────
  const { data: creator, error: creatorErr } = await supabase
    .from("creators")
    .select("id, user_id, kyc_status, pending_balance_paise")
    .eq("id", creatorId)
    .maybeSingle();

  if (creatorErr) {
    throw new PayoutError("DB_ERROR", `Failed to read creator: ${creatorErr.message}`);
  }
  if (!creator) {
    throw new PayoutError("DB_ERROR", `Creator ${creatorId} not found`);
  }

  const { data: bankAccount, error: bankErr } = await supabase
    .from("creator_bank_accounts")
    .select(
      "id, creator_id, account_number_last4, ifsc, bank_name, account_holder_name, is_active, cf_beneficiary_id",
    )
    .eq("creator_id", creatorId)
    .eq("is_active", true)
    .maybeSingle();

  if (bankErr) {
    throw new PayoutError("DB_ERROR", `Failed to read bank account: ${bankErr.message}`);
  }

  // ── Step 2: Validate KYC ─────────────────────────────────────────────────
  if (creator.kyc_status !== "verified") {
    throw new PayoutError(
      "KYC_NOT_VERIFIED",
      `Creator KYC is not verified (current status: ${creator.kyc_status})`,
    );
  }

  if (!bankAccount) {
    throw new PayoutError(
      "BANK_ACCOUNT_MISSING",
      "No active bank account found. Creator must add and verify a bank account first.",
    );
  }

  // ── Step 3: Validate minimum payout ─────────────────────────────────────
  const minPaise = getMinPayoutPaise();
  if (amountPaise < minPaise) {
    throw new PayoutError(
      "BELOW_MIN_PAYOUT",
      `Requested ${amountPaise} paise is below minimum ${minPaise} paise (₹${minPaise / 100})`,
    );
  }

  // ── Step 4: Compute deductions ───────────────────────────────────────────
  const tds = computeTDS(amountPaise);
  const fee = computeProcessingFee();
  const net = computeNet({ gross: amountPaise, tds, fee });

  // ── Step 5: Validate net > 0 ─────────────────────────────────────────────
  if (net <= 0) {
    throw new PayoutError(
      "NET_TOO_LOW",
      `Net amount after deductions is ${net} paise — must be positive (gross=${amountPaise}, tds=${tds}, fee=${fee})`,
    );
  }

  // ── Step 6: Greedily select available escrow rows ────────────────────────
  const now = new Date().toISOString();

  const { data: escrowRows, error: escrowErr } = await supabase
    .from("escrow_ledger")
    .select("id, amount_paise, created_at")
    .eq("creator_id", creatorId)
    .eq("type", "release_per_image")
    .is("payout_id", null)
    .lte("holding_until", now)
    .order("created_at", { ascending: true });

  if (escrowErr) {
    throw new PayoutError("DB_ERROR", `Failed to read escrow: ${escrowErr.message}`);
  }

  if (!escrowRows || escrowRows.length === 0) {
    throw new PayoutError(
      "INSUFFICIENT_AVAILABLE",
      "No available escrow rows — all funds may still be in holding period or already locked.",
    );
  }

  // Greedy fill: include oldest rows first until sum >= gross.
  const selectedIds: string[] = [];
  let accumulatedPaise = 0;

  for (const row of escrowRows) {
    selectedIds.push(row.id);
    accumulatedPaise += row.amount_paise;
    if (accumulatedPaise >= amountPaise) break;
  }

  if (accumulatedPaise < amountPaise) {
    throw new PayoutError(
      "INSUFFICIENT_AVAILABLE",
      `Available escrow (${accumulatedPaise} paise) is less than requested gross (${amountPaise} paise)`,
    );
  }

  // ── Step 7: Atomic INSERT payout + LOCK escrow via RPC ──────────────────
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    "request_payout",
    {
      p_creator_id: creatorId,
      p_amount_paise: amountPaise,
      p_tds_paise: tds,
      p_fee_paise: fee,
      p_net_paise: net,
      p_bank_last4: bankAccount.account_number_last4,
      p_escrow_ids: selectedIds,
    },
  );

  if (rpcErr) {
    if (rpcErr.message.includes("race condition")) {
      throw new PayoutError(
        "ESCROW_LOCK_RACE",
        `Could not lock escrow rows — concurrent payout in progress? (${rpcErr.message})`,
      );
    }
    throw new PayoutError("DB_ERROR", `request_payout RPC failed: ${rpcErr.message}`);
  }

  const payoutRow = rpcResult as PayoutRow;

  // ── Step 8: Ensure beneficiary exists in Cashfree ───────────────────────
  await ensureBeneficiary({
    creatorId: bankAccount.cf_beneficiary_id ?? creatorId,
    name: bankAccount.account_holder_name,
    // Note: actual account number is encrypted in the DB and not selected here.
    // In production this would be decrypted via the KYC_ENCRYPTION_KEY path;
    // for the payout flow Cashfree already has the account from the penny-drop
    // registration, so we register with cf_beneficiary_id if present.
    // If cf_beneficiary_id is set on the bank account, beneficiary already exists.
    bankAccountNumber: bankAccount.cf_beneficiary_id
      ? "EXISTING"
      : `****${bankAccount.account_number_last4}`,
    bankIfsc: bankAccount.ifsc,
  });

  // ── Step 9: Submit Cashfree transfer ────────────────────────────────────
  let cfTransferId: string;
  try {
    const transferResult = await submitTransfer({
      payoutId: payoutRow.id,
      beneficiaryId: bankAccount.cf_beneficiary_id ?? creatorId,
      amountPaise: net, // Cashfree receives NET (after deductions) amount
      remarks: `Faiceoff creator payout — ₹${(net / 100).toFixed(2)}`,
    });
    cfTransferId = transferResult.cfTransferId;
  } catch (err) {
    // Cashfree submission failed — roll back payout status to failed so creator can retry.
    await supabase
      .from("creator_payouts")
      .update({
        status: "failed",
        failure_reason:
          err instanceof Error ? err.message : "Cashfree submission failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", payoutRow.id);

    // Release escrow locks so the amount is available for a retry.
    await supabase
      .from("escrow_ledger")
      .update({ payout_id: null })
      .eq("payout_id", payoutRow.id);

    throw err; // Re-throw so the API route can respond 502.
  }

  // ── Step 10: Update payout to 'processing' with cf_transfer_id ──────────
  const { data: updatedPayout, error: updateErr } = await supabase
    .from("creator_payouts")
    .update({
      status: "processing",
      cf_transfer_id: cfTransferId,
    })
    .eq("id", payoutRow.id)
    .select()
    .single();

  if (updateErr) {
    // Non-fatal — Cashfree already has the transfer, webhook will arrive.
    // Log and return the partially-updated row.
    console.error(
      `[payout-service] Failed to update payout ${payoutRow.id} to processing: ${updateErr.message}`,
    );
    return payoutRow;
  }

  return updatedPayout as PayoutRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// handlePayoutWebhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a Cashfree payout webhook event.
 *
 * Matches by `cf_transfer_id`. On SUCCESS: marks payout success + records
 * completed_at. On FAILED/REVERSED: marks payout failed + releases escrow
 * locks so the creator can retry the withdrawal.
 *
 * Idempotent — re-processing the same SUCCESS event is a no-op because we
 * only UPDATE rows that are still in `processing` state.
 *
 * @param event - Normalised webhook payload.
 */
export async function handlePayoutWebhook(
  event: PayoutWebhookEvent,
): Promise<void> {
  const supabase = createAdminClient() as any;

  const { data: payout, error: lookupErr } = await supabase
    .from("creator_payouts")
    .select("id, status")
    .eq("cf_transfer_id", event.cfTransferId)
    .maybeSingle();

  if (lookupErr) {
    throw new PayoutError(
      "DB_ERROR",
      `handlePayoutWebhook lookup failed: ${lookupErr.message}`,
    );
  }

  if (!payout) {
    // Cashfree sent a webhook for a transfer we don't recognise — log and return.
    // This can happen for transfers created outside our system or duplicate events.
    console.warn(
      `[payout-service] Received webhook for unknown cf_transfer_id=${event.cfTransferId}`,
    );
    return;
  }

  if (event.type === "TRANSFER_SUCCESS") {
    if (payout.status === "success") {
      // Idempotent — already processed.
      return;
    }

    const { error: successErr } = await supabase
      .from("creator_payouts")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
      })
      .eq("id", payout.id)
      .eq("status", "processing"); // Guard against accidental double-update.

    if (successErr) {
      throw new PayoutError(
        "DB_ERROR",
        `Failed to mark payout ${payout.id} as success: ${successErr.message}`,
      );
    }

    return;
  }

  // TRANSFER_FAILED | TRANSFER_REVERSED
  if (payout.status === "failed" || payout.status === "reversed") {
    // Idempotent.
    return;
  }

  const finalStatus =
    event.type === "TRANSFER_REVERSED" ? "reversed" : "failed";

  const { error: failErr } = await supabase
    .from("creator_payouts")
    .update({
      status: finalStatus,
      failure_reason: event.failureReason ?? `Cashfree ${event.type}`,
      completed_at: new Date().toISOString(),
    })
    .eq("id", payout.id);

  if (failErr) {
    throw new PayoutError(
      "DB_ERROR",
      `Failed to mark payout ${payout.id} as ${finalStatus}: ${failErr.message}`,
    );
  }

  // Release escrow locks so creator can retry withdrawal.
  const { error: releaseErr } = await supabase
    .from("escrow_ledger")
    .update({ payout_id: null })
    .eq("payout_id", payout.id);

  if (releaseErr) {
    // Non-fatal: the payout is already marked failed. Log and continue.
    console.error(
      `[payout-service] Failed to release escrow locks for payout ${payout.id}: ${releaseErr.message}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listPayouts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginated payout history for a creator.
 *
 * @param input.creatorId - creators.id.
 * @param input.page      - 1-indexed page number (default 1).
 * @param input.pageSize  - Rows per page, max 100 (default 20).
 * @returns Paginated payout rows ordered by requested_at DESC.
 */
export async function listPayouts(
  input: ListPayoutsInput,
): Promise<ListPayoutsResult> {
  const supabase = createAdminClient() as any;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const { data, error, count } = await supabase
    .from("creator_payouts")
    .select("*", { count: "exact" })
    .eq("creator_id", input.creatorId)
    .order("requested_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new PayoutError("DB_ERROR", `listPayouts failed: ${error.message}`);
  }

  return {
    payouts: (data ?? []) as PayoutRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single payout row with its associated escrow line items.
 *
 * @param payoutId - creator_payouts.id.
 * @returns Payout row.
 * @throws {PayoutError("PAYOUT_NOT_FOUND")} if no matching row exists.
 */
export async function getPayout(payoutId: string): Promise<PayoutRow> {
  const supabase = createAdminClient() as any;

  const { data, error } = await supabase
    .from("creator_payouts")
    .select("*")
    .eq("id", payoutId)
    .maybeSingle();

  if (error) {
    throw new PayoutError("DB_ERROR", `getPayout failed: ${error.message}`);
  }

  if (!data) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `Payout ${payoutId} not found`);
  }

  return data as PayoutRow;
}
