-- ═══════════════════════════════════════════════════════════════════════════
-- Seed test funds for a brand (skips Cashfree top-up flow).
--
-- WHAT IT DOES:
--   • Adds 1000 credits (each credit = 1 AI generation slot)
--   • Adds ₹10,00,000 (10 lakh) wallet balance
--   • Inserts matching ledger rows so the billing UI shows clean history
--
-- WHO TO RUN AS:
--   Supabase SQL Editor (uses service-role internally, bypasses RLS).
--
-- HOW TO USE:
--   1. Replace 'marketing@rectangled.io' below with the brand's login email
--      if different.
--   2. Paste the whole file into Supabase → SQL Editor → New query.
--   3. Run.
--   4. Reload /brand/credits and /brand/wallet — balances should be live.
--
-- HOW TO REVERSE (if needed):
--   See bottom of this file for a rollback block.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_email          text   := 'marketing@rectangled.io';
  v_credits_grant  int    := 1000;
  v_wallet_grant   bigint := 100000000;       -- 10 lakh INR in paise (10,00,000 × 100)
  v_user_id        uuid;
  v_brand_id       uuid;
  v_new_credits    int;
  v_new_wallet     bigint;
BEGIN
  -- 1. Resolve user → brand
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row for email %. Aborting.', v_email;
  END IF;

  SELECT id INTO v_brand_id FROM public.brands WHERE user_id = v_user_id;
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'No brands row for user_id %. Brand profile missing — finish brand-setup first.', v_user_id;
  END IF;

  -- 2. Update brand denormalized balances
  UPDATE public.brands
     SET credits_remaining          = credits_remaining          + v_credits_grant,
         credits_lifetime_purchased = credits_lifetime_purchased + v_credits_grant,
         wallet_balance_paise       = wallet_balance_paise       + v_wallet_grant,
         lifetime_topup_paise       = lifetime_topup_paise       + v_wallet_grant
   WHERE id = v_brand_id
   RETURNING credits_remaining, wallet_balance_paise
        INTO v_new_credits, v_new_wallet;

  -- 3. Append matching ledger rows (audit trail)
  INSERT INTO public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, description
  ) VALUES (
    v_brand_id, 'adjustment', v_credits_grant, v_new_credits,
    'manual_seed', 'Manual seed: +' || v_credits_grant || ' credits (test funds, no Cashfree)'
  );

  INSERT INTO public.wallet_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, description
  ) VALUES (
    v_brand_id, 'adjustment', v_wallet_grant, v_new_wallet,
    'manual_seed', 'Manual seed: +₹' || (v_wallet_grant / 100) || ' wallet (test funds, no Cashfree)'
  );

  RAISE NOTICE '═══ SEED COMPLETE ═══';
  RAISE NOTICE 'brand_id        : %', v_brand_id;
  RAISE NOTICE 'credits granted : +%', v_credits_grant;
  RAISE NOTICE 'wallet granted  : +₹% (% paise)', (v_wallet_grant / 100), v_wallet_grant;
  RAISE NOTICE 'new credits     : %', v_new_credits;
  RAISE NOTICE 'new wallet ₹    : %', (v_new_wallet / 100);
END $$;

-- 4. Verify (run this after the DO block to sanity-check)
SELECT
  b.id,
  u.email,
  b.credits_remaining,
  b.credits_lifetime_purchased,
  b.wallet_balance_paise,
  (b.wallet_balance_paise / 100)::int     AS wallet_balance_inr,
  (b.wallet_balance_paise - b.wallet_reserved_paise) AS wallet_available_paise,
  b.lifetime_topup_paise,
  (b.lifetime_topup_paise / 100)::int     AS lifetime_topup_inr
FROM public.brands b
JOIN auth.users    u ON u.id = b.user_id
WHERE u.email = 'marketing@rectangled.io';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (uncomment if you want to revert this exact seed)
--
-- DO $$
-- DECLARE
--   v_email         text   := 'marketing@rectangled.io';
--   v_credits_undo  int    := 1000;
--   v_wallet_undo   bigint := 100000000;
--   v_brand_id      uuid;
-- BEGIN
--   SELECT b.id INTO v_brand_id
--     FROM public.brands b
--     JOIN auth.users u ON u.id = b.user_id
--    WHERE u.email = v_email;
--
--   UPDATE public.brands
--      SET credits_remaining          = GREATEST(0, credits_remaining          - v_credits_undo),
--          credits_lifetime_purchased = GREATEST(0, credits_lifetime_purchased - v_credits_undo),
--          wallet_balance_paise       = GREATEST(0, wallet_balance_paise       - v_wallet_undo),
--          lifetime_topup_paise       = GREATEST(0, lifetime_topup_paise       - v_wallet_undo)
--    WHERE id = v_brand_id;
-- END $$;
-- ═══════════════════════════════════════════════════════════════════════════
