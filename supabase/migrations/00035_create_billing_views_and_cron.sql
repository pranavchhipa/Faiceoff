-- ═══════════════════════════════════════════════════════════════════════════
-- Billing views + auto-reject function (called by Vercel Cron).
-- pg_cron schedule registered conditionally if extension available.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. v_creator_dashboard ──────────────────────────────────────────────────
-- 4-pot view: available, holding, pending, lifetime_earned (paise).
DROP VIEW IF EXISTS public.v_creator_dashboard;
CREATE VIEW public.v_creator_dashboard AS
SELECT
  c.id AS creator_id,
  COALESCE(SUM(
    CASE
      WHEN e.payout_id IS NULL
       AND e.holding_until IS NOT NULL
       AND e.holding_until <= now()
       AND e.type = 'release_per_image'
      THEN e.amount_paise
      ELSE 0
    END
  ), 0)::bigint AS available_paise,
  COALESCE(SUM(
    CASE
      WHEN e.payout_id IS NULL
       AND e.holding_until IS NOT NULL
       AND e.holding_until > now()
       AND e.type = 'release_per_image'
      THEN e.amount_paise
      ELSE 0
    END
  ), 0)::bigint AS holding_paise,
  COALESCE((
    SELECT COUNT(*)
      FROM public.approvals a
      JOIN public.generations g ON g.id = a.generation_id
     WHERE g.creator_id = c.id
       AND a.status = 'pending'
  ), 0)::bigint AS pending_count,
  COALESCE(SUM(
    CASE
      WHEN e.type = 'release_per_image' THEN e.amount_paise
      ELSE 0
    END
  ), 0)::bigint AS lifetime_earned_paise
FROM public.creators c
LEFT JOIN public.escrow_ledger e ON e.creator_id = c.id
GROUP BY c.id;

COMMENT ON VIEW public.v_creator_dashboard IS
  'Creator earnings rollup: available (withdrawable), holding (within 7-day window), pending (gens awaiting approval), lifetime_earned. All paise.';

-- ── 2. v_brand_billing ──────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_brand_billing;
CREATE VIEW public.v_brand_billing AS
SELECT
  b.id AS brand_id,
  b.credits_remaining,
  b.credits_lifetime_purchased,
  b.wallet_balance_paise,
  b.wallet_reserved_paise,
  (b.wallet_balance_paise - b.wallet_reserved_paise) AS wallet_available_paise,
  b.lifetime_topup_paise
FROM public.brands b;

COMMENT ON VIEW public.v_brand_billing IS
  'Brand billing snapshot: credits + wallet balance + reserved + lifetime stats.';

-- ── 3. Extend approvals.status to include auto_rejected ─────────────────────
ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_status_check;
ALTER TABLE public.approvals
  ADD CONSTRAINT approvals_status_check
  CHECK (status IN ('pending','approved','rejected','expired','revision_requested','auto_rejected'));

-- ── 4. auto_reject_expired_approvals (called by Vercel Cron every 15 min) ───
CREATE OR REPLACE FUNCTION public.auto_reject_expired_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rejected_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.approvals
       SET status = 'auto_rejected',
           feedback = COALESCE(feedback, 'Auto-rejected: creator did not respond within 48 hours'),
           decided_at = now()
     WHERE status = 'pending'
       AND created_at < now() - interval '48 hours'
    RETURNING generation_id
  )
  UPDATE public.generations g
     SET status = 'rejected',
         updated_at = now()
   WHERE g.id IN (SELECT generation_id FROM expired);

  GET DIAGNOSTICS rejected_count = ROW_COUNT;
  RETURN rejected_count;
END;
$$;

COMMENT ON FUNCTION public.auto_reject_expired_approvals() IS
  'Marks 48h+ pending approvals as auto_rejected and updates linked generations. Refund + escrow handled by Vercel Cron worker /api/cron/process-rejections.';

-- ── 5. pg_cron registration (conditional) ───────────────────────────────────
-- Skipped if pg_cron not installed; Vercel Cron is the primary scheduler.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto-reject-expired-approvals')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-reject-expired-approvals');
    PERFORM cron.schedule(
      'auto-reject-expired-approvals',
      '*/15 * * * *',
      'SELECT public.auto_reject_expired_approvals();'
    );
  END IF;
END$$;
