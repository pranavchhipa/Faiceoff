-- ─────────────────────────────────────────────────────────────────────────────
-- 00074: Atomic credit grant for collab payments.
--
-- confirm-payment used to read brands.credits_remaining, add the package
-- credits in JS, and write the ABSOLUTE value back — a lost-update race
-- against any concurrent transaction touching the same brand's balance
-- (top-up webhook, generation deduct). This RPC does the increment atomically
-- and is idempotent per collab session via the ledger reference check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_collab_credits(
  p_brand_id    uuid,
  p_session_id  uuid,
  p_credits     integer,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fo74$
DECLARE
  v_new_bal integer;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'grant_collab_credits: p_credits must be > 0, got %', p_credits;
  END IF;

  -- Idempotency: one grant per collab session, ever.
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
     WHERE reference_type = 'collab_session'
       AND reference_id   = p_session_id
       AND type           = 'topup'
  ) THEN
    SELECT credits_remaining INTO v_new_bal FROM public.brands WHERE id = p_brand_id;
    RETURN jsonb_build_object('credits_added', 0, 'new_balance', v_new_bal, 'idempotent', true);
  END IF;

  -- Atomic increment (implicit row lock on UPDATE).
  UPDATE public.brands
     SET credits_remaining          = credits_remaining + p_credits,
         credits_lifetime_purchased = credits_lifetime_purchased + p_credits
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_bal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_collab_credits: brands row % not found', p_brand_id;
  END IF;

  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', p_credits, v_new_bal, 'collab_session', p_session_id, p_description);

  RETURN jsonb_build_object('credits_added', p_credits, 'new_balance', v_new_bal, 'idempotent', false);
END;
$fo74$;

COMMENT ON FUNCTION public.grant_collab_credits(uuid, uuid, integer, text) IS
  'Atomically grants package credits on collab payment. Idempotent per session via credit_transactions reference check.';
