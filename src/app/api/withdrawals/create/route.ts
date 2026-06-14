// ─────────────────────────────────────────────────────────────────────────────
// POST /api/withdrawals/create — DEPRECATED (HTTP 410 Gone)
// ─────────────────────────────────────────────────────────────────────────────
//
// Creators no longer self-withdraw. The /creator/withdraw UI redirects to
// /creator/earnings, where the creator adds a bank account and uses the
// "Request payout" flow instead. This endpoint is retired and returns 410
// immediately, before any auth/DB work.
//
// The previous implementation (KYC gate → bank resolution → withdrawal_requests
// insert → ledger deductions → Cashfree transfer) lives in git history.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "Self-withdrawal is removed. Add your bank in Earnings and use Request payout.",
    },
    { status: 410 },
  );
}
