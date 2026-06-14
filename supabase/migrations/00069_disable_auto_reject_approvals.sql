-- ═══════════════════════════════════════════════════════════════════════════
-- Disable the AUTO-REJECT path for expired approvals.
--
-- POLICY CONFLICT (resolved here):
--   Two systems acted on the SAME 48h-expired pending approvals with OPPOSITE
--   outcomes:
--     (a) /api/cron/auto-approve            → silence = CONSENT → approve + credit creator
--     (b) auto_reject_expired_approvals() pg fn (migration 00035) + the
--         'auto-reject-expired-approvals' pg_cron job + /api/cron/process-rejections
--                                          → silence = REJECTION + refund
--
--   The CANONICAL policy (per CLAUDE.md and the creator-facing UI, which says
--   "Missing the window is fine — the brand can resend" / 48h auto-approve) is
--   AUTO-APPROVE. The auto-reject path contradicts it and double-acts on the
--   same rows, so it is disabled.
--
-- This migration:
--   1. Unschedules the 'auto-reject-expired-approvals' pg_cron job (if present).
--   2. Neutralises auto_reject_expired_approvals() so it can NEVER flip a
--      'pending' approval to 'auto_rejected' again. It is rewritten as a safe
--      no-op that returns 0 (kept rather than DROPped so the pg_cron schedule
--      statement in 00035 — and any stray manual caller — does not error, and
--      so re-enabling is a simple, reversible function swap).
--
-- The companion Vercel cron route /api/cron/process-rejections is turned into a
-- no-op in application code, and removed from vercel.json's crons array.
--
-- Do NOT touch /api/cron/auto-approve — that is the surviving canonical path.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Unschedule the pg_cron job (conditional — pg_cron may not be installed) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto-reject-expired-approvals')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'auto-reject-expired-approvals'
      );
  END IF;
END$$;

-- ── 2. Neutralise the function: safe no-op, never auto-rejects pending rows ────
CREATE OR REPLACE FUNCTION public.auto_reject_expired_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DISABLED: auto-reject contradicts the canonical 48h auto-APPROVE policy.
  -- Silence on an approval = creator consent → handled by /api/cron/auto-approve.
  -- This function intentionally does nothing and is retained only so the
  -- pg_cron schedule from migration 00035 and any stray callers do not error.
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.auto_reject_expired_approvals() IS
  'DISABLED no-op (migration 00069). Auto-reject contradicts the canonical 48h auto-approve policy; expired approvals are approved by /api/cron/auto-approve. Returns 0, never mutates rows.';
