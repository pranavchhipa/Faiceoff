-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00050: bump free signup credits grant 5 → 10
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Idempotency: already received signup credits?
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

  -- Insert the sentinel top-up row (pack = 'free_signup', status = 'success').
  INSERT INTO public.credit_top_ups
    (brand_id, pack, amount_paise, credits_purchased, bonus_credits, status)
  VALUES
    (p_brand_id, 'free_signup', 0, 10, 0, 'success')
  RETURNING id INTO v_topup_id;

  -- Credit the brand's balance (+10 credits).
  UPDATE public.brands
     SET credits_remaining          = credits_remaining + 10,
         credits_lifetime_purchased = credits_lifetime_purchased + 10
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_bal;

  -- Ledger entry.
  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', 10, v_new_bal, 'credit_top_up', v_topup_id,
     'Welcome — 10 free credits on signup');

  RETURN jsonb_build_object(
    'credits_added', 10,
    'new_balance',   v_new_bal,
    'idempotent',    false
  );
END;
$$;

COMMENT ON FUNCTION public.add_free_signup_credits(uuid) IS
  'One-time grant of 10 free signup credits. Idempotent via credit_top_ups.pack=free_signup check.';
