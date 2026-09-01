-- ─────────────────────────────────────────────────────────────────────────────
-- 00073: Repair top-ups that granted ZERO base credits.
--
-- Bug: /api/credits/confirm-topup selected the top-up row WITHOUT the
-- `credits` column, then wrote `credits_granted: topUp.credits ?? 0` = 0.
-- add_credits_for_topup grants exactly credits_granted (NOT NULL DEFAULT 0,
-- so its COALESCE fallback to `credits` never fires) → the brand paid, got
-- bonus credits only, and the poisoned 'topup' ledger row (credits = 0) made
-- every webhook retry a no-op. The route is fixed in the same commit; this
-- migration grants the missing base credits for already-affected rows.
--
-- Idempotent: the zero-credit ledger row is UPDATED in place, so a second
-- run finds no matching rows.
-- ─────────────────────────────────────────────────────────────────────────────

DO $fo73$
DECLARE
  r         record;
  v_new_bal integer;
BEGIN
  FOR r IN
    SELECT t.id, t.brand_id, t.credits, t.pack
      FROM public.credit_top_ups t
     WHERE t.status = 'success'
       AND t.credits_granted = 0
       AND COALESCE(t.credits, 0) > 0
       AND EXISTS (
         SELECT 1
           FROM public.credit_transactions ct
          WHERE ct.reference_type = 'credit_top_up'
            AND ct.reference_id   = t.id
            AND ct.type           = 'topup'
            AND ct.credits        = 0
       )
  LOOP
    -- Grant the missing base credits.
    UPDATE public.brands
       SET credits_remaining          = credits_remaining + r.credits,
           credits_lifetime_purchased = credits_lifetime_purchased + r.credits
     WHERE id = r.brand_id
     RETURNING credits_remaining INTO v_new_bal;

    -- Record the true grant on the top-up row.
    UPDATE public.credit_top_ups
       SET credits_granted = r.credits
     WHERE id = r.id;

    -- Repair the poisoned ledger row in place (keeps the audit trail 1:1
    -- with grants and makes this loop idempotent).
    UPDATE public.credit_transactions
       SET credits       = r.credits,
           balance_after = v_new_bal,
           description   = 'Credit pack: ' || COALESCE(r.pack, 'unknown')
                           || ' (repaired by 00073 — zero-credit confirm bug)'
     WHERE reference_type = 'credit_top_up'
       AND reference_id   = r.id
       AND type           = 'topup'
       AND credits        = 0;

    RAISE NOTICE '00073: repaired top-up % — granted % credits to brand % (new balance %)',
      r.id, r.credits, r.brand_id, v_new_bal;
  END LOOP;
END $fo73$;
