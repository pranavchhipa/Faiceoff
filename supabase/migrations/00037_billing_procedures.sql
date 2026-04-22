-- ═══════════════════════════════════════════════════════════════════════════
-- Chunk E: Billing procedures for two-layer credits + wallet system
-- Called from src/lib/billing/credits-service.ts and wallet-service.ts
-- ═══════════════════════════════════════════════════════════════════════════
--
-- All functions are security definer so they bypass RLS and run as the
-- service role. Only ever called from the server-side admin client.
--
-- Idempotency pattern: each mutating function checks if the transition was
-- already applied and returns the current state if so (safe for retries).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- add_credits_for_topup
-- Called by the Cashfree webhook after marking credit_top_ups.status='success'.
-- Reads pack from credit_top_ups, increments brands.credits_remaining by
-- (credits_granted + bonus_credits), increments credits_lifetime_purchased by
-- credits_granted only. Idempotent via credit_top_ups.credits_granted uniqueness
-- check — if already in 'success' state with balance credited, no-op.
-- Returns: credits_added (int), bonus_added (int), new_balance (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_credits_for_topup(
  p_brand_id    uuid,
  p_top_up_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_up    record;
  v_brand     record;
  v_credits   integer;
  v_bonus     integer;
  v_new_bal   integer;
BEGIN
  -- Lock the top-up row to prevent concurrent double-credit.
  SELECT * INTO v_top_up
    FROM public.credit_top_ups
   WHERE id = p_top_up_id
     AND brand_id = p_brand_id
   FOR UPDATE;

  IF v_top_up IS NULL THEN
    RAISE EXCEPTION 'credit_top_up % not found for brand %', p_top_up_id, p_brand_id;
  END IF;

  -- Require status='success' before granting credits.
  IF v_top_up.status <> 'success' THEN
    RAISE EXCEPTION 'add_credits_for_topup: top-up % status is %, expected success',
      p_top_up_id, v_top_up.status;
  END IF;

  -- Idempotency: if already credited (credits_granted > 0 and row is 'success',
  -- check brand balance was already bumped). We use a sentinel approach:
  -- store the credited state in a separate check. Since there's no dedicated
  -- "credits_credited" flag on credit_top_ups, we check for the existence of a
  -- credit_transactions row for this top-up as the idempotency guard.
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
     WHERE reference_type = 'credit_top_up'
       AND reference_id = v_top_up.id
       AND type = 'topup'
  ) THEN
    -- Already credited; return current balance.
    SELECT credits_remaining INTO v_new_bal FROM public.brands WHERE id = p_brand_id;
    RETURN jsonb_build_object(
      'credits_added', 0,
      'bonus_added',   0,
      'new_balance',   v_new_bal,
      'idempotent',    true
    );
  END IF;

  v_credits := COALESCE(v_top_up.credits_granted, v_top_up.credits, 0);
  v_bonus   := COALESCE(v_top_up.bonus_credits, 0);

  -- Atomically increment brand credits.
  UPDATE public.brands
     SET credits_remaining          = credits_remaining + v_credits + v_bonus,
         credits_lifetime_purchased = credits_lifetime_purchased + v_credits
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_bal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'brands row % not found', p_brand_id;
  END IF;

  -- Append to credit_transactions ledger (base credits).
  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', v_credits, v_new_bal - v_bonus,
     'credit_top_up', v_top_up.id,
     'Credit pack: ' || v_top_up.pack);

  -- Separate row for bonus credits (if any).
  IF v_bonus > 0 THEN
    INSERT INTO public.credit_transactions
      (brand_id, type, credits, balance_after, reference_type, reference_id, description)
    VALUES
      (p_brand_id, 'bonus', v_bonus, v_new_bal,
       'credit_top_up', v_top_up.id,
       'Bonus credits for pack: ' || v_top_up.pack);
  END IF;

  RETURN jsonb_build_object(
    'credits_added', v_credits,
    'bonus_added',   v_bonus,
    'new_balance',   v_new_bal,
    'idempotent',    false
  );
END;
$$;

COMMENT ON FUNCTION public.add_credits_for_topup(uuid, uuid) IS
  'Atomically grants credits from a completed top-up. Idempotent. Returns JSON with credits_added, bonus_added, new_balance.';


-- ─────────────────────────────────────────────────────────────────────────────
-- deduct_credit
-- Decrements brands.credits_remaining by 1. Atomic CTE ensures no race.
-- Raises exception if insufficient credits (returns 0 rows from CTE).
-- Returns: new_balance (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_credit(
  p_brand_id      uuid,
  p_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bal integer;
BEGIN
  -- Atomic single-UPDATE with conditional: only deduct if balance >= 1.
  WITH deducted AS (
    UPDATE public.brands
       SET credits_remaining = credits_remaining - 1
     WHERE id = p_brand_id
       AND credits_remaining >= 1
     RETURNING credits_remaining
  )
  SELECT credits_remaining INTO v_new_bal FROM deducted;

  IF v_new_bal IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: brand % has no credits remaining', p_brand_id;
  END IF;

  -- Audit in credit_transactions.
  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'spend', -1, v_new_bal,
     'generation', p_generation_id,
     'Generation slot consumed');

  RETURN jsonb_build_object('new_balance', v_new_bal);
END;
$$;

COMMENT ON FUNCTION public.deduct_credit(uuid, uuid) IS
  'Atomically deduct 1 credit from brand. Raises INSUFFICIENT_CREDITS if balance < 1.';


-- ─────────────────────────────────────────────────────────────────────────────
-- add_wallet_for_topup
-- Idempotent: checks wallet_transactions for existing topup row.
-- Increments wallet_balance_paise + lifetime_topup_paise (base only).
-- Inserts wallet_transactions rows (topup + optional bonus).
-- Returns: added (int), new_balance (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_wallet_for_topup(
  p_brand_id  uuid,
  p_top_up_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_up    record;
  v_new_bal   integer;
  v_amount    integer;
  v_bonus     integer;
BEGIN
  SELECT * INTO v_top_up
    FROM public.wallet_top_ups
   WHERE id = p_top_up_id
     AND brand_id = p_brand_id
   FOR UPDATE;

  IF v_top_up IS NULL THEN
    RAISE EXCEPTION 'wallet_top_up % not found for brand %', p_top_up_id, p_brand_id;
  END IF;

  IF v_top_up.status <> 'success' THEN
    RAISE EXCEPTION 'add_wallet_for_topup: top-up % status is %, expected success',
      p_top_up_id, v_top_up.status;
  END IF;

  -- Idempotency: check if wallet_transactions row already exists.
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
     WHERE reference_type = 'wallet_top_up'
       AND reference_id = v_top_up.id
       AND type = 'topup'
  ) THEN
    SELECT wallet_balance_paise INTO v_new_bal FROM public.brands WHERE id = p_brand_id;
    RETURN jsonb_build_object(
      'added',       0,
      'new_balance', v_new_bal,
      'idempotent',  true
    );
  END IF;

  v_amount := v_top_up.amount_paise;
  v_bonus  := COALESCE(v_top_up.bonus_paise, 0);

  UPDATE public.brands
     SET wallet_balance_paise  = wallet_balance_paise + v_amount + v_bonus,
         lifetime_topup_paise  = lifetime_topup_paise + v_amount
   WHERE id = p_brand_id
   RETURNING wallet_balance_paise INTO v_new_bal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'brands row % not found', p_brand_id;
  END IF;

  -- Insert base topup transaction.
  INSERT INTO public.wallet_transactions
    (brand_id, type, amount_paise, balance_after_paise,
     reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', v_amount, v_new_bal - v_bonus,
     'wallet_top_up', v_top_up.id,
     'Wallet top-up');

  -- Bonus row if any.
  IF v_bonus > 0 THEN
    INSERT INTO public.wallet_transactions
      (brand_id, type, amount_paise, balance_after_paise,
       reference_type, reference_id, description)
    VALUES
      (p_brand_id, 'bonus', v_bonus, v_new_bal,
       'wallet_top_up', v_top_up.id,
       'Wallet top-up bonus');
  END IF;

  RETURN jsonb_build_object(
    'added',       v_amount + v_bonus,
    'new_balance', v_new_bal,
    'idempotent',  false
  );
END;
$$;

COMMENT ON FUNCTION public.add_wallet_for_topup(uuid, uuid) IS
  'Atomically credits wallet from a completed wallet top-up. Idempotent.';


-- ─────────────────────────────────────────────────────────────────────────────
-- reserve_wallet
-- Increments wallet_reserved_paise by p_amount_paise.
-- Fails with INSUFFICIENT_WALLET if (balance - reserved) < amount.
-- Inserts wallet_transactions row (type='reserve', amount=-p_amount_paise).
-- Returns: new_reserved (int), available (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_wallet(
  p_brand_id      uuid,
  p_amount_paise  integer,
  p_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand      record;
  v_available  integer;
  v_new_res    integer;
  v_new_avail  integer;
BEGIN
  -- Lock brand row for update.
  SELECT * INTO v_brand
    FROM public.brands
   WHERE id = p_brand_id
   FOR UPDATE;

  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brands row % not found', p_brand_id;
  END IF;

  v_available := v_brand.wallet_balance_paise - v_brand.wallet_reserved_paise;

  IF v_available < p_amount_paise THEN
    RAISE EXCEPTION 'INSUFFICIENT_WALLET: brand % available=% < required=%',
      p_brand_id, v_available, p_amount_paise;
  END IF;

  UPDATE public.brands
     SET wallet_reserved_paise = wallet_reserved_paise + p_amount_paise
   WHERE id = p_brand_id
   RETURNING wallet_reserved_paise INTO v_new_res;

  v_new_avail := v_brand.wallet_balance_paise - v_new_res;

  INSERT INTO public.wallet_transactions
    (brand_id, type, amount_paise, balance_after_paise,
     reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'reserve', -p_amount_paise,
     v_new_avail,
     'generation', p_generation_id,
     'Creator fee reserved for generation');

  RETURN jsonb_build_object(
    'new_reserved', v_new_res,
    'available',    v_new_avail
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_wallet(uuid, integer, uuid) IS
  'Reserve wallet paise for an in-flight generation. Fails if insufficient available balance.';


-- ─────────────────────────────────────────────────────────────────────────────
-- spend_wallet
-- Converts a reservation to spent: decrements BOTH wallet_balance_paise AND
-- wallet_reserved_paise by p_amount_paise. Called on generation approval.
-- Returns: new_balance (int), new_reserved (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_wallet(
  p_brand_id      uuid,
  p_amount_paise  integer,
  p_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand    record;
  v_new_bal  integer;
  v_new_res  integer;
BEGIN
  SELECT * INTO v_brand
    FROM public.brands
   WHERE id = p_brand_id
   FOR UPDATE;

  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brands row % not found', p_brand_id;
  END IF;

  IF v_brand.wallet_reserved_paise < p_amount_paise THEN
    RAISE EXCEPTION 'spend_wallet: reserved=% < amount=% for brand %',
      v_brand.wallet_reserved_paise, p_amount_paise, p_brand_id;
  END IF;

  UPDATE public.brands
     SET wallet_balance_paise   = wallet_balance_paise   - p_amount_paise,
         wallet_reserved_paise  = wallet_reserved_paise  - p_amount_paise
   WHERE id = p_brand_id
   RETURNING wallet_balance_paise, wallet_reserved_paise INTO v_new_bal, v_new_res;

  INSERT INTO public.wallet_transactions
    (brand_id, type, amount_paise, balance_after_paise,
     reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'spend', -p_amount_paise, v_new_bal,
     'generation', p_generation_id,
     'Creator fee spent on approved generation');

  RETURN jsonb_build_object(
    'new_balance',  v_new_bal,
    'new_reserved', v_new_res
  );
END;
$$;

COMMENT ON FUNCTION public.spend_wallet(uuid, integer, uuid) IS
  'Convert a wallet reservation to spent on generation approval.';


-- ─────────────────────────────────────────────────────────────────────────────
-- release_reserve
-- Undoes a reservation: decrements wallet_reserved_paise only.
-- p_type must be 'release_reserve' or 'refund'.
-- Returns: new_balance (int), new_reserved (int).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_reserve(
  p_brand_id      uuid,
  p_amount_paise  integer,
  p_generation_id uuid,
  p_type          text  -- 'release_reserve' or 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand    record;
  v_new_bal  integer;
  v_new_res  integer;
BEGIN
  IF p_type NOT IN ('release_reserve', 'refund') THEN
    RAISE EXCEPTION 'release_reserve: invalid p_type %, must be release_reserve or refund', p_type;
  END IF;

  SELECT * INTO v_brand
    FROM public.brands
   WHERE id = p_brand_id
   FOR UPDATE;

  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brands row % not found', p_brand_id;
  END IF;

  IF v_brand.wallet_reserved_paise < p_amount_paise THEN
    RAISE EXCEPTION 'release_reserve: reserved=% < amount=% for brand %',
      v_brand.wallet_reserved_paise, p_amount_paise, p_brand_id;
  END IF;

  UPDATE public.brands
     SET wallet_reserved_paise = wallet_reserved_paise - p_amount_paise
   WHERE id = p_brand_id
   RETURNING wallet_balance_paise, wallet_reserved_paise INTO v_new_bal, v_new_res;

  INSERT INTO public.wallet_transactions
    (brand_id, type, amount_paise, balance_after_paise,
     reference_type, reference_id, description)
  VALUES
    (p_brand_id, p_type::text, p_amount_paise,
     v_new_bal - v_new_res,
     'generation', p_generation_id,
     CASE p_type
       WHEN 'release_reserve' THEN 'Reservation released — generation rejected/cancelled'
       WHEN 'refund'           THEN 'Creator fee refunded to wallet'
       ELSE 'Reserve released'
     END);

  RETURN jsonb_build_object(
    'new_balance',  v_new_bal,
    'new_reserved', v_new_res
  );
END;
$$;

COMMENT ON FUNCTION public.release_reserve(uuid, integer, uuid, text) IS
  'Release (or refund) a wallet reservation back to available balance.';


-- ─────────────────────────────────────────────────────────────────────────────
-- add_free_signup_credits
-- One-time 5 free credits on signup. Idempotent — checks for existing
-- credit_top_ups row with pack='free_signup' for this brand.
-- Returns: credits_added (int), new_balance (int), idempotent (bool).
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
  -- Check idempotency: has this brand already received signup credits?
  SELECT id INTO v_existing_topup_id
    FROM public.credit_top_ups
   WHERE brand_id = p_brand_id
     AND pack = 'free_signup'
   LIMIT 1;

  IF v_existing_topup_id IS NOT NULL THEN
    SELECT credits_remaining INTO v_new_bal FROM public.brands WHERE id = p_brand_id;
    RETURN jsonb_build_object(
      'credits_added', 0,
      'new_balance',   v_new_bal,
      'idempotent',    true
    );
  END IF;

  -- Lock brand row.
  PERFORM 1 FROM public.brands WHERE id = p_brand_id FOR UPDATE;

  -- Create a free_signup top-up record (already at 'success' since no payment needed).
  INSERT INTO public.credit_top_ups
    (brand_id, pack, credits, amount_paise, credits_granted, bonus_credits, status)
  VALUES
    (p_brand_id, 'free_signup', 5, 0, 5, 0, 'success')
  RETURNING id INTO v_topup_id;

  -- Credit 5 credits.
  UPDATE public.brands
     SET credits_remaining          = credits_remaining + 5,
         credits_lifetime_purchased = credits_lifetime_purchased + 5
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_bal;

  -- Ledger entry.
  INSERT INTO public.credit_transactions
    (brand_id, type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (p_brand_id, 'topup', 5, v_new_bal, 'credit_top_up', v_topup_id,
     'Free signup credits');

  RETURN jsonb_build_object(
    'credits_added', 5,
    'new_balance',   v_new_bal,
    'idempotent',    false
  );
END;
$$;

COMMENT ON FUNCTION public.add_free_signup_credits(uuid) IS
  'One-time grant of 5 free signup credits. Idempotent via credit_top_ups.pack=free_signup check.';
