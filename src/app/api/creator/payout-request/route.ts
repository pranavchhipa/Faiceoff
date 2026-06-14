// Creator payout requests — SIMPLE manual model.
//
// Creators do NOT withdraw themselves. They add bank details, then "Request
// payout" for their full available balance. That creates a `creator_payouts`
// row (status 'requested') and locks the available escrow rows against it (so
// the balance drops immediately and can't be double-requested). An operator
// then pays the creator manually via RazorpayX from the Control Centre and
// marks it paid. No deductions are computed here (kept simple — TDS is handled
// at payout time by the operator).

import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMinPayoutPaise } from "@/lib/payouts/payout-service";
import { emitNotification } from "@/lib/notifications/emit";
import { accountLast4 } from "@/lib/kyc/bank-crypto";

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

  const min = getMinPayoutPaise();
  const available = await availablePaise(admin, creator.id);
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

  // Create the payout record (no deductions — operator settles TDS at payout).
  const { data: payout, error: insErr } = await admin
    .from("creator_payouts")
    .insert({
      creator_id: creator.id,
      gross_amount_paise: available,
      tds_amount_paise: 0,
      processing_fee_paise: 0,
      net_amount_paise: available,
      status: "requested",
      bank_account_last4: last4 || null,
    })
    .select("id")
    .single();

  if (insErr || !payout) {
    // 23505 = the uniq_open_payout_per_creator partial index fired — a
    // concurrent request already created the open payout (TOCTOU race). Treat
    // it as "already pending" rather than a 500.
    if ((insErr as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { error: "request_pending", message: "You already have a payout being processed." },
        { status: 409 },
      );
    }
    console.error("[payout-request] insert failed", insErr);
    return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });
  }

  // Lock the available escrow rows against this payout so the balance drops
  // immediately and can't be requested twice. (Released rows past their hold.)
  const { error: lockErr } = await admin
    .from("escrow_ledger")
    .update({ payout_id: payout.id })
    .eq("creator_id", creator.id)
    .is("payout_id", null)
    .lte("holding_until", new Date().toISOString())
    .eq("type", "release_per_image");

  if (lockErr) {
    // Roll the payout back so we don't leave a request with no locked funds.
    await admin.from("creator_payouts").delete().eq("id", payout.id);
    console.error("[payout-request] escrow lock failed", lockErr);
    return NextResponse.json({ error: "Failed to reserve funds" }, { status: 500 });
  }

  after(async () => {
    await emitNotification(admin, {
      userId: creator.user_id,
      type: "system",
      title: "Payout requested",
      body: `We'll transfer ₹${(available / 100).toLocaleString("en-IN")} to your bank shortly.`,
      href: "/creator/earnings",
    });
  });

  return NextResponse.json({ ok: true, payout_id: payout.id, amount_paise: available });
}
