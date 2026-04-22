-- ═══════════════════════════════════════════════════════════════════════════
-- Chunk E follow-up: admin credit RPCs
-- Ref: src/app/api/generations/create/route.ts:113 (rollback_credit_for_generation)
--      src/app/api/admin/safety/[id]/reject/route.ts:96 (add_credits_manual)
--      src/app/api/admin/stuck-gens/[id]/refund/route.ts:93 (add_credits_manual)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Both functions support credit reversals that the public credits-service
-- cannot model:
--   • rollback_credit_for_generation — undoes a deductCredit() when the gen
--     create flow fails post-deduction (compliance check, prompt assembly,
--     or wallet reserve failure). One row per generation_id (idempotent via
--     credit_transactions.reference_id uniqueness check).
--   • add_credits_manual — admin restitution path used by safety reject and
--     stuck-gen refund. Bypasses the top-up path; ledger row tagged with the
--     ops source so audit trails make sense.
--
-- Both run with SECURITY DEFINER so the admin client (service-role JWT) can
-- invoke them and bypass RLS on credit_transactions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── rollback_credit_for_generation ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rollback_credit_for_generation(
  p_brand_id uuid,
  p_generation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_refunded boolean;
  v_new_balance integer;
BEGIN
  -- Idempotency guard: skip if a refund row for this generation already exists.
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE reference_type = 'generation_rollback'
      AND reference_id = p_generation_id
  ) INTO v_already_refunded;

  IF v_already_refunded THEN
    RETURN;
  END IF;

  -- Refund 1 credit to the brand (atomic: lock row, increment, capture balance).
  UPDATE public.brands
     SET credits_remaining = credits_remaining + 1
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Audit row: type='refund', amount_paise stores the credit count (legacy column name).
  INSERT INTO public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) VALUES (
    p_brand_id, 'refund', 1, v_new_balance,
    'generation_rollback', p_generation_id,
    'Auto-rollback: generation create failed after credit deduction'
  );
END;
$$;

COMMENT ON FUNCTION public.rollback_credit_for_generation IS
  'Restores 1 credit to a brand when generation creation fails post-deduction. Idempotent on reference_id. Used by /api/generations/create error path.';

GRANT EXECUTE ON FUNCTION public.rollback_credit_for_generation TO service_role;

-- ── add_credits_manual ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_credits_manual(
  p_brand_id uuid,
  p_credits integer,
  p_bonus integer,
  p_source text,
  p_reference_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := COALESCE(p_credits, 0) + COALESCE(p_bonus, 0);
  v_new_balance integer;
BEGIN
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT' USING ERRCODE = '22023';
  END IF;

  IF p_source IS NULL OR length(trim(p_source)) = 0 THEN
    RAISE EXCEPTION 'SOURCE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: skip if same source+reference already credited.
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.credit_transactions
     WHERE reference_type = p_source
       AND reference_id = p_reference_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.brands
     SET credits_remaining = credits_remaining + v_total
   WHERE id = p_brand_id
   RETURNING credits_remaining INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) VALUES (
    p_brand_id,
    CASE WHEN p_bonus > 0 AND p_credits = 0 THEN 'bonus' ELSE 'adjustment' END,
    v_total, v_new_balance,
    p_source, p_reference_id,
    format('Manual credit add (%s base + %s bonus) from %s', p_credits, p_bonus, p_source)
  );
END;
$$;

COMMENT ON FUNCTION public.add_credits_manual IS
  'Admin path to grant credits without a top-up payment (safety reject refund, stuck-gen refund, marketing comp, etc.). Idempotent on (source, reference_id).';

GRANT EXECUTE ON FUNCTION public.add_credits_manual TO service_role;
