// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payouts/request — initiate a creator payout withdrawal
// Validates balance, resolves bank, calls requestPayout service.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayout, getMinPayoutPaise, PayoutError } from "@/lib/payouts";

const RequestPayoutSchema = z.object({
  amount_paise: z.number().int().positive(),
  bank_account_id: z.string().uuid().optional(),
});

interface DashboardRow {
  creator_id: string;
  available_paise: number;
}

// Map PayoutError codes to HTTP status codes and user-facing messages.
function payoutErrorToResponse(err: PayoutError): NextResponse {
  switch (err.code) {
    case "INSUFFICIENT_AVAILABLE":
      return NextResponse.json(
        { error: "insufficient_available", message: err.message },
        { status: 402 },
      );
    case "BELOW_MIN_PAYOUT":
      return NextResponse.json(
        {
          error: "below_min_payout",
          message: `Minimum payout is ₹${getMinPayoutPaise() / 100}. Please request at least ${getMinPayoutPaise()} paise.`,
          min_payout_paise: getMinPayoutPaise(),
        },
        { status: 400 },
      );
    case "BANK_ACCOUNT_MISSING":
      return NextResponse.json(
        {
          error: "no_bank_account",
          message: "No active bank account found. Add and verify a bank account first.",
        },
        { status: 400 },
      );
    case "KYC_NOT_VERIFIED":
      return NextResponse.json(
        {
          error: "kyc_pending",
          message: "Complete KYC verification before requesting a payout.",
        },
        { status: 400 },
      );
    case "NET_TOO_LOW":
      return NextResponse.json(
        { error: "net_too_low", message: err.message },
        { status: 400 },
      );
    case "CASHFREE_ERROR":
      return NextResponse.json(
        { error: "cashfree_error", message: "Payout gateway error. Please try again." },
        { status: 502 },
      );
    default:
      return NextResponse.json(
        { error: "payout_failed", message: err.message },
        { status: 500 },
      );
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestPayoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { amount_paise, bank_account_id } = parsed.data;

  const admin = createAdminClient() as any;

  // ── Resolve creator ────────────────────────────────────────────────────────
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[payouts/request] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json({ error: "not_a_creator" }, { status: 403 });
  }

  // ── Validate min payout ────────────────────────────────────────────────────
  const minPaise = getMinPayoutPaise();
  if (amount_paise < minPaise) {
    return NextResponse.json(
      {
        error: "below_min_payout",
        message: `Minimum payout is ₹${minPaise / 100}. Please request at least ${minPaise} paise.`,
        min_payout_paise: minPaise,
      },
      { status: 400 },
    );
  }

  // ── Validate available balance from dashboard view ─────────────────────────
  const { data: dashRow, error: dashErr } = await admin
    .from("v_creator_dashboard")
    .select("creator_id, available_paise")
    .eq("creator_id", creator.id)
    .maybeSingle();

  if (dashErr) {
    console.error("[payouts/request] dashboard view lookup failed", dashErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const availablePaise = (dashRow as DashboardRow | null)?.available_paise ?? 0;

  if (amount_paise > availablePaise) {
    return NextResponse.json(
      {
        error: "insufficient_available",
        message: `Requested ${amount_paise} paise exceeds available ${availablePaise} paise.`,
        available_paise: availablePaise,
        requested_paise: amount_paise,
      },
      { status: 402 },
    );
  }

  // ── Resolve bank account if not provided ───────────────────────────────────
  let resolvedBankAccountId = bank_account_id;

  if (!resolvedBankAccountId) {
    const { data: primaryBank, error: bankErr } = await admin
      .from("creator_bank_accounts")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (bankErr) {
      console.error("[payouts/request] bank lookup failed", bankErr);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!primaryBank) {
      return NextResponse.json(
        {
          error: "no_bank_account",
          message: "No primary bank account found. Add and verify a bank account first.",
        },
        { status: 400 },
      );
    }

    resolvedBankAccountId = (primaryBank as { id: string }).id;
  }

  // ── Call payout service ────────────────────────────────────────────────────
  try {
    const payoutRow = await requestPayout({
      creatorId: creator.id,
      amountPaise: amount_paise,
    });

    const tds = payoutRow.tds_amount_paise;
    const fee = payoutRow.processing_fee_paise;
    const net = payoutRow.net_amount_paise;

    return NextResponse.json(
      {
        payout_id: payoutRow.id,
        status: payoutRow.status,
        breakdown: {
          gross: amount_paise,
          tds,
          fee,
          net,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof PayoutError) {
      return payoutErrorToResponse(err);
    }
    console.error("[payouts/request] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
