-- 00066_remove_wallet_topup_bonus.sql
-- Wallet top-up BONUSES removed (2026-06): credited wallet amount must equal the
-- amount paid. The /api/wallet/top-up route now persists wallet_top_ups.bonus_paise
-- = 0 for every new top-up, so add_wallet_for_topup (00037) already credits exactly
-- what the brand paid. This migration is defense-in-depth: it neutralises any
-- in-flight bonus, defaults the column to 0, and zeroes the DB tier table so no
-- future code path can grant a top-up bonus.

-- 1. Zero any in-flight top-ups that still carry a bonus, so confirming them later
--    cannot credit extra balance. (Completed/success rows are left untouched —
--    historical ledger is immutable.)
UPDATE public.wallet_top_ups
   SET bonus_paise = 0
 WHERE bonus_paise <> 0
   AND status IN ('initiated', 'processing');

-- 2. Default the column to 0 going forward (belt-and-suspenders).
ALTER TABLE public.wallet_top_ups
  ALTER COLUMN bonus_paise SET DEFAULT 0;

-- 3. Zero the server-authoritative bonus tier table if it exists (added in 00053)
--    so compute_wallet_bonus_paise() returns 0 for every amount.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'wallet_bonus_tiers'
  ) THEN
    UPDATE public.wallet_bonus_tiers SET bonus_bps = 0;
  END IF;
END $$;
