// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/process-rejections  —  DISABLED (no-op)
//
// ⚠️ POLICY: This auto-REJECT path is intentionally disabled.
//
// Two systems used to act on the SAME 48h-expired pending approvals with
// OPPOSITE outcomes:
//   • /api/cron/auto-approve            → silence = CONSENT → approve + credit creator
//   • this route + auto_reject_expired_approvals() pg fn → silence = REJECT + refund
//
// The CANONICAL policy (per CLAUDE.md and the creator-facing UI: "Missing the
// window is fine — the brand can resend" / 48h auto-approve) is AUTO-APPROVE.
// Auto-reject contradicts it and double-acts on the same rows, so it is
// neutralised here.
//
// This route is kept as a 200-returning no-op (rather than deleted) so it stays
// reversible and any still-registered Vercel cron hitting it does nothing
// harmful. The companion pg function `auto_reject_expired_approvals()` and its
// pg_cron job are dropped in migration 00069_disable_auto_reject_approvals.sql.
//
// To re-enable (NOT recommended without resolving the policy conflict): restore
// from git history and re-add the function + pg_cron job. The auth + refund
// logic lived in the pre-disable revision.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  // Intentional no-op. Auto-reject is disabled in favour of auto-approve.
  return NextResponse.json({
    ok: true,
    disabled: true,
    reason:
      "Auto-reject is disabled; 48h-expired approvals are handled by /api/cron/auto-approve (silence = consent).",
    processed: 0,
  });
}
