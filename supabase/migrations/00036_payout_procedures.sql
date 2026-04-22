-- ═══════════════════════════════════════════════════════════════════════════
-- Payout procedures: atomic INSERT creator_payouts + LOCK escrow rows
-- Ref spec: Task E8, Chunk E — on-demand creator payout service
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `request_payout` wraps the two-phase write (INSERT + UPDATE) in a single
-- PG transaction to prevent races where two concurrent payout requests could
-- lock overlapping escrow rows. A FOR UPDATE lock on the escrow rows inside
-- the function serialises concurrent callers for the same creator.
--
-- Security model: SECURITY DEFINER so the admin client's service_role can
-- call it regardless of RLS policies. Anon/authenticated callers cannot reach
-- this function (EXECUTE revoked from public, granted to service_role only).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_payout(
  p_creator_id   uuid,
  p_amount_paise integer,
  p_tds_paise    integer,
  p_fee_paise    integer,
  p_net_paise    integer,
  p_bank_last4   text,
  p_escrow_ids   uuid[]
)
RETURNS public.creator_payouts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout      public.creator_payouts;
  v_lock_count  integer;
  v_expect      integer;
BEGIN
  RAISE NOTICE 'request_payout: creator=% gross=% tds=% fee=% net=%',
    p_creator_id, p_amount_paise, p_tds_paise, p_fee_paise, p_net_paise;

  -- Validate inputs before touching the DB.
  IF p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'gross_amount_paise must be positive, got %', p_amount_paise;
  END IF;

  IF p_net_paise <= 0 THEN
    RAISE EXCEPTION 'net_amount_paise must be positive after deductions, got %', p_net_paise;
  END IF;

  IF array_length(p_escrow_ids, 1) IS NULL OR array_length(p_escrow_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_escrow_ids must not be empty';
  END IF;

  -- Insert the payout row first so we have an id to lock escrow with.
  INSERT INTO public.creator_payouts (
    creator_id,
    gross_amount_paise,
    tds_amount_paise,
    processing_fee_paise,
    net_amount_paise,
    bank_account_last4,
    escrow_ledger_ids,
    status
  ) VALUES (
    p_creator_id,
    p_amount_paise,
    p_tds_paise,
    p_fee_paise,
    p_net_paise,
    p_bank_last4,
    p_escrow_ids,
    'requested'
  )
  RETURNING * INTO v_payout;

  -- Lock escrow rows atomically.
  -- Conditions: not already locked + belongs to this creator.
  UPDATE public.escrow_ledger
     SET payout_id = v_payout.id
   WHERE id = ANY(p_escrow_ids)
     AND payout_id IS NULL
     AND creator_id = p_creator_id;

  GET DIAGNOSTICS v_lock_count = ROW_COUNT;
  v_expect := array_length(p_escrow_ids, 1);

  IF v_lock_count <> v_expect THEN
    RAISE EXCEPTION
      'Failed to lock all escrow rows (race condition or invalid ids): expected %, locked %',
      v_expect, v_lock_count;
  END IF;

  RETURN v_payout;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.request_payout(uuid, integer, integer, integer, integer, text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, integer, integer, integer, integer, text, uuid[]) TO service_role;

COMMENT ON FUNCTION public.request_payout IS
  'Atomically inserts a creator_payouts row (status=requested) and locks the supplied escrow_ledger rows by setting payout_id. Raises if any row is already locked or not owned by the creator (race condition guard).';
