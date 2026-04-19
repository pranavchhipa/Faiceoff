-- ═══════════════════════════════════════════════════════════════════════════
-- Atomic campaign creation with wallet escrow
-- Ref spec: docs/superpowers/specs/2026-04-19-simplified-campaign-flow-design.md
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fixes the race + orphan-campaign issues in /api/campaigns/create:
--   1. Concurrent campaign creates from the same brand could both pass the
--      balance check and overspend — fixed with pg_advisory_xact_lock per user.
--   2. Campaign insert succeeds, generations insert fails → orphan campaign
--      with status='active' — fixed by running both inserts inside the same
--      function (implicit PG transaction rolls back on any failure).
--   3. Budget was not actually reserved against the brand's wallet balance —
--      fixed by writing an `escrow_lock` wallet_transaction at creation time.
--
-- Balance model:
--   • Create:   escrow_lock DEBIT budget_paise (full budget = count × price)
--   • Approve:  escrow_release CREDIT + generation_spend DEBIT (net zero vs
--               escrow, but accounting stays clean). See generation-pipeline.ts
--               for the approval/rejection side.
--   • Reject:   escrow_release CREDIT (refund per-gen cost to brand).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_campaign_with_escrow(
  p_brand_id uuid,
  p_user_id uuid,
  p_creator_id uuid,
  p_name text,
  p_description text,
  p_budget_paise integer,
  p_max_generations integer,
  p_price_per_generation_paise integer,
  p_structured_brief jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_campaign_id uuid;
  v_generation_ids uuid[];
  v_generation_id uuid;
  v_i integer;
begin
  -- Per-user advisory lock: serializes all wallet-mutating operations for
  -- this brand user for the duration of this transaction. Two concurrent
  -- create_campaign_with_escrow calls from the same user queue up instead of
  -- racing the balance check.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Read latest running balance INSIDE the locked transaction.
  select balance_after_paise
    into v_current_balance
    from public.wallet_transactions
    where user_id = p_user_id
    order by created_at desc
    limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

  if v_current_balance < p_budget_paise then
    raise exception 'insufficient_balance: required=% available=%',
      p_budget_paise, v_current_balance
      using errcode = 'P0001';
  end if;

  -- Insert campaign first so we have an id to reference from the escrow row.
  insert into public.campaigns (
    brand_id, creator_id, name, description,
    budget_paise, max_generations, status
  ) values (
    p_brand_id, p_creator_id, p_name, p_description,
    p_budget_paise, p_max_generations, 'active'
  )
  returning id into v_campaign_id;

  -- Lock the full budget on the brand's wallet.
  v_new_balance := v_current_balance - p_budget_paise;
  insert into public.wallet_transactions (
    user_id, type, amount_paise, direction,
    reference_id, reference_type,
    balance_after_paise, description
  ) values (
    p_user_id, 'escrow_lock', p_budget_paise, 'debit',
    v_campaign_id::text, 'campaign',
    v_new_balance,
    format('Campaign escrow: %s', p_name)
  );

  -- Insert one generation row per unit of the campaign's max_generations.
  -- All start as 'draft'; the API caller dispatches generation/created
  -- Inngest events for each id.
  v_generation_ids := array[]::uuid[];
  for v_i in 1..p_max_generations loop
    insert into public.generations (
      campaign_id, brand_id, creator_id,
      structured_brief, status, cost_paise
    ) values (
      v_campaign_id, p_brand_id, p_creator_id,
      p_structured_brief, 'draft', p_price_per_generation_paise
    )
    returning id into v_generation_id;
    v_generation_ids := array_append(v_generation_ids, v_generation_id);
  end loop;

  return jsonb_build_object(
    'campaign_id', v_campaign_id,
    'generation_ids', to_jsonb(v_generation_ids),
    'balance_after_paise', v_new_balance
  );
end;
$$;

comment on function public.create_campaign_with_escrow is
  'Atomically creates a campaign, reserves the full budget via an escrow_lock '
  'wallet_transaction, and inserts max_generations draft generation rows. '
  'Uses pg_advisory_xact_lock per user_id to serialize concurrent calls. '
  'Raises SQLSTATE P0001 with message starting "insufficient_balance:" when '
  'the brand wallet lacks funds.';

-- Grant execute to the service_role (used by createAdminClient()).
grant execute on function public.create_campaign_with_escrow(
  uuid, uuid, uuid, text, text, integer, integer, integer, jsonb
) to service_role;
