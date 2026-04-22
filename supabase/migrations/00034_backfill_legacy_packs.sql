-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill legacy pack rows in credit_top_ups, then tighten enum.
-- Run once after 00032 + 00033.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Map legacy pack rows to new equivalents ──────────────────────────────
UPDATE public.credit_top_ups
   SET pack = 'flow', credits_granted = 50, bonus_credits = 10
 WHERE pack = 'small';

UPDATE public.credit_top_ups
   SET pack = 'pro', credits_granted = 200, bonus_credits = 50
 WHERE pack = 'medium';

UPDATE public.credit_top_ups
   SET pack = 'studio', credits_granted = 600, bonus_credits = 200
 WHERE pack = 'large';

-- Backfill credits_granted for any rows still showing 0 (free_signup or future)
UPDATE public.credit_top_ups
   SET credits_granted = COALESCE(credits, 0)
 WHERE credits_granted = 0
   AND credits IS NOT NULL;

-- ── 2. Tighten enum to drop legacy names ────────────────────────────────────
ALTER TABLE public.credit_top_ups DROP CONSTRAINT IF EXISTS credit_top_ups_pack_check;
ALTER TABLE public.credit_top_ups
  ADD CONSTRAINT credit_top_ups_pack_check
  CHECK (pack IN ('free_signup','spark','flow','pro','studio','enterprise'));
