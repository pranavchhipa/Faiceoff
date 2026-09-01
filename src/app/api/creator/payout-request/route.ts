// Creator payout requests — SIMPLE manual model.
//
// Creators do NOT withdraw themselves. They add bank details, then "Request
// payout" for their full available balance. We read the available escrow rows,
// compute the amount from that exact row set, and claim it atomically via the
// `request_payout` RPC (INSERT creator_payouts + lock those escrow rows in one
// transaction — it raises if any row was claimed concurrently, so the recorded
// amount always matches the locked rows). An operator then pays the creator
// manually via RazorpayX from the Control Centre and marks it paid. No
// deductions are computed here (kept simple — TDS is handled at payout time by
// the operator).

import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMinPayoutPaise } from "@/lib/payouts/payout-service";
import { emitNotification } from "@/lib/notifications/emit";
import { accountLast4 } from "@/lib/kyc/bank-crypto";
import { sendCreatorWithdrawalRequested } from "@/lib/email/transactional";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function resolveCreator(admin: Admin, userId: string) {
  const { data } = await admin
    .from("creators")
    .select(
      "id, user_id, bank_account_holder_name, bank_account_number_encrypted, bank_ifsc, bank_added_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function availablePaise(admin: Admin, creatorId: string): Promise<number> {
  const { data } = await admin
    .from("v_creator_dashboard")
    .select("available_paise")
    .eq("creator_id", creatorId)
    .maybeSingle();
  return Number(data?.available_paise ?? 0);
}

async function openRequest(admin: Admin, creatorId: string) {
  const { data } = await admin
    .from("creator_payouts")
    .select("id, net_amount_paise, status, requested_at")
    .eq("creator_id", creatorId)
    .in("status", ["requested", "processing"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// GET — payout state for the Earnings page.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await resolveCreator(admin, user.id);
  if (!creator) return NextResponse.json({ error: "Not a creator" }, { status: 403 });

  const min = getMinPayoutPaise();
  const [available, open] = await Promise.all([
    availablePaise(admin, creator.id),
    openRequest(admin, creator.id),
  ]);
  const hasBank = !!creator.bank_added_at && !!creator.bank_account_number_encrypted;

  return NextResponse.json({
    available_paise: available,
    min_payout_paise: min,
    has_bank: hasBank,
    open_request: open
      ? {
          id: open.id,
          amount_paise: open.net_amount_paise,
          status: open.status,
          requested_at: open.requested_at,
        }
      : null,
    can_request: hasBank && !open && available >= min,
  });
}

// POST — request a payout for the full available balance.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await resolveCreator(admin, user.id);
  if (!creator) return NextResponse.json({ error: "Not a creator" }, { status: 403 });

  if (!creator.bank_added_at || !creator.bank_account_number_encrypted) {
    return NextResponse.json(
      { error: "add_bank_first", message: "Add your bank account before requesting a payout." },
      { status: 400 },
    );
  }

  // One open request at a time.
  const existing = await openRequest(admin, creator.id);
  if (existing) {
    return NextResponse.json(
      { error: "request_pending", message: "You already have a payout being processed." },
      { status: 409 },
    );
  }

  // Read the available escrow rows themselves (not the rollup view) so the
  // payout amount is computed from the exact rows we're about to claim.
  const { data: escrowRows, error: escrowErr } = await admin
    .from("escrow_ledger")
    .select("id, amount_paise")
    .eq("creator_id", creator.id)
    .is("payout_id", null)
    .lte("holding_until", new Date().toISOString())
    .eq("type", "release_per_image");

  if (escrowErr) {
    console.error("[payout-request] escrow read failed", escrowErr);
    return NextResponse.json({ error: "Failed to read balance" }, { status: 500 });
  }

  const rows = (escrowRows ?? []) as { id: string; amount_paise: number }[];
  const escrowIds = rows.map((r) => r.id);
  const available = rows.reduce((sum, r) => sum + Number(r.amount_paise), 0);

  const min = getMinPayoutPaise();
  if (available < min) {
    return NextResponse.json(
      {
        error: "below_minimum",
        message: `You need at least ₹${(min / 100).toLocaleString("en-IN")} available to request a payout.`,
        available_paise: available,
        min_payout_paise: min,
      },
      { status: 402 },
    );
  }

  const last4 = accountLast4(creator.bank_account_number_encrypted);

  // Create the payout record + lock exactly the escrow rows we summed, in one
  // transaction (no deductions — operator settles TDS at payout). The RPC
  // raises if any of the rows were claimed concurrently, so the recorded
  // amount can never drift from the locked set.
  const { data: payout, error: rpcErr } = await admin.rpc("request_payout", {
    p_creator_id: creator.id,
    p_amount_paise: available,
    p_tds_paise: 0,
    p_fee_paise: 0,
    p_net_paise: available,
    p_bank_last4: last4 || null,
    p_escrow_ids: escrowIds,
  });

  if (rpcErr || !payout) {
    const msg = rpcErr?.message ?? "";
    // uniq_open_payout_per_creator fired inside the RPC — a concurrent request
    // already created the open payout. "race condition" = some of our escrow
    // rows were claimed between the read above and the lock. Both mean a
    // parallel request won; treat as "already pending" rather than a 500.
    if (msg.includes("uniq_open_payout_per_creator") || msg.includes("race condition")) {
      return NextResponse.json(
        { error: "request_pending", message: "You already have a payout being processed." },
        { status: 409 },
      );
    }
    console.error("[payout-request] request_payout RPC failed", rpcErr);
    return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });
  }

  after(async () => {
    await emitNotification(admin, {
      userId: creator.user_id,
      type: "system",
      title: "Payout requested",
      body: `We'll transfer ₹${(available / 100).toLocaleString("en-IN")} to your bank shortly.`,
      href: "/creator/earnings",
    });

    try {
      const { data: userRow } = await admin
        .from("users")
        .select("email, display_name")
        .eq("id", creator.user_id)
        .maybeSingle();
      if (userRow?.email) {
        await sendCreatorWithdrawalRequested({
          to: userRow.email,
          creatorName: userRow.display_name ?? "Creator",
          amountPaise: available,
          netPaise: available,
          bankLast4: last4 || null,
          payoutId: payout.id,
        });
      }
    } catch (err) {
      console.warn("[payout-request] withdrawal-requested email failed", err);
    }
  });

  return NextResponse.json({ ok: true, payout_id: payout.id, amount_paise: available });
}
