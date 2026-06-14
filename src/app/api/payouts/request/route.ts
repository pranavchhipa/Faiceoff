// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payouts/request — DEPRECATED (HTTP 410 Gone)
// ─────────────────────────────────────────────────────────────────────────────
//
// Creators no longer self-request payouts through this endpoint. The
// /creator/withdraw UI redirects to /creator/earnings, where the creator adds a
// bank account and requests a payout via the supported flow. This endpoint is
// retired and returns 410 immediately, before any auth/DB work.
//
// The previous implementation (balance validation → bank resolution →
// requestPayout service) lives in git history.
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
