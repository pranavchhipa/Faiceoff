-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00053
--   1. Revert free signup credits 10 → 5 (matches /pricing copy)
--   2. Add `wallet_bonus_tiers` config table + helper that resolves the bonus
--      paise applied to a given top-up amount.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Revert free signup credits 10 → 5 ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_free_signup_credits(
  p_brand_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_topup_id uuid;
  v_new_bal           integer;
  v_topup_id          uuid;
BEGIN
  SELECT id INTO v_existing_topup_id
    FROM public.credit_top_ups
   WHERE brand_id = p_brand_id
     AND pack = 'free_signup'
   LIMIT 1;

  IF v_existing_topup_id IS NOT NULL THEN
    SELECT credits_remaining INTO v_new_bal
      FROM public.brands
     WHERE id = p_brand_id;

    RETURN jsonb_build_object(
      'credits_added', 0,
      'new_balance',   v_new_bal,
      'idempotent',    true
    );
  END IF;

  INSERT INTO public.credit_top_ups
    (brand_id, pack, amount_paise, credits_purchased, bonus_credits, status)
  VALUES
    (p_brand_id, 'free_signup', 0, 5, 0, 'success')
  RETURNING id INTO v_topup_id;

  UPDATE public.brands
     SET credits_remaining          = credits_remaining + 5,
         credits_lifetime_purchased = credits_lifetime_purchased + 5
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_bal;

  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', 5, v_new_bal, 'credit_top_up', v_topup_id,
     'Welcome — 5 free credits on signup');

  RETURN jsonb_build_object(
    'credits_added', 5,
    'new_balance',   v_new_bal,
    'idempotent',    false
  );
END;
$$;

COMMENT ON FUNCTION public.add_free_signup_credits(uuid) IS
  'One-time grant of 5 free signup credits. Idempotent via credit_top_ups.pack=free_signup.';

-- ── 2. Wallet bonus tiers ───────────────────────────────────────────────────
-- Reference: /pricing page (Spec: "Add more wallet balance. Get more value.")
-- Tiers (inclusive lower, exclusive upper):
--   ₹500    – ₹999    : 0%
--   ₹1,000  – ₹4,999  : 5%
--   ₹5,000  – ₹9,999  : 10%
--   ₹10,000 – ₹49,999 : 15%
--   ₹50,000 +         : 20%
-- All in paise. Editable post-deploy via SQL.
CREATE TABLE IF NOT EXISTS public.wallet_bonus_tiers (
  id              integer PRIMARY KEY,
  min_paise       integer NOT NULL,
  max_paise       integer,                       -- nullable = open-ended top tier
  bonus_bps       integer NOT NULL CHECK (bonus_bps >= 0 AND bonus_bps <= 10000),
  label           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_bonus_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_bonus_tiers public read" ON public.wallet_bonus_tiers;
CREATE POLICY "wallet_bonus_tiers public read" ON public.wallet_bonus_tiers
  FOR SELECT USING (active = true);

INSERT INTO public.wallet_bonus_tiers (id, min_paise, max_paise, bonus_bps, label) VALUES
  (1,    50000,    100000,    0, '₹500–₹999'),
  (2,   100000,    500000,  500, '₹1,000–₹4,999'),
  (3,   500000,   1000000, 1000, '₹5,000–₹9,999'),
  (4,  1000000,   5000000, 1500, '₹10,000–₹49,999'),
  (5,  5000000,      NULL, 2000, '₹50,000+')
ON CONFLICT (id) DO UPDATE SET
  min_paise  = EXCLUDED.min_paise,
  max_paise  = EXCLUDED.max_paise,
  bonus_bps  = EXCLUDED.bonus_bps,
  label      = EXCLUDED.label,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.compute_wallet_bonus_paise(
  p_amount_paise integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus_bps integer := 0;
  v_label     text    := '';
  v_bonus     integer;
BEGIN
  IF p_amount_paise IS NULL OR p_amount_paise < 0 THEN
    RETURN jsonb_build_object(
      'amount_paise', 0,
      'bonus_paise',  0,
      'bonus_bps',    0,
      'tier',         null
    );
  END IF;

  SELECT bonus_bps, label INTO v_bonus_bps, v_label
    FROM public.wallet_bonus_tiers
   WHERE active = true
     AND p_amount_paise >= min_paise
     AND (max_paise IS NULL OR p_amount_paise < max_paise)
   ORDER BY min_paise DESC
   LIMIT 1;

  v_bonus := COALESCE(round((p_amount_paise * COALESCE(v_bonus_bps, 0)) / 10000.0)::integer, 0);

  RETURN jsonb_build_object(
    'amount_paise', p_amount_paise,
    'bonus_paise',  v_bonus,
    'bonus_bps',    COALESCE(v_bonus_bps, 0),
    'tier',         v_label
  );
END;
$$;

COMMENT ON FUNCTION public.compute_wallet_bonus_paise(integer) IS
  'Resolves the wallet bonus paise for a given top-up amount. Returns {amount_paise, bonus_paise, bonus_bps, tier}.';
