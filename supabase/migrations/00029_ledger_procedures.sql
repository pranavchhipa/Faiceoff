-- ═══════════════════════════════════════════════════════════════════════════
-- PL/pgSQL procedures for atomic ledger commits (Chunk C)
-- Ref plan Task 16, spec §4.3–§4.4 (money lifecycles)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every money-affecting state transition is wrapped in a procedure so the
-- multi-table INSERT + UPDATE runs in a single PG transaction (functions are
-- transactional by default). Row-level `for update` locks on the parent
-- record prevent concurrent double-spend.
--
-- Invariants enforced:
--   • credit balances never go negative (reserve checks available = balance - reserved)
--   • state transitions validated before mutation (idempotency + safety)
--   • ledger tables append-only — we INSERT rows; reversals are negative-sign rows
--   • running totals on escrow_ledger carried forward within the license scope
--
-- All functions are `security definer` so they run with admin privileges
-- regardless of the caller's RLS role. They're only ever invoked via the
-- service-role admin client (src/lib/ledger/commit.ts), never by end users.
--
-- Rates (kept inline as numeric literals to match src/lib/ledger/math.ts):
--   commission = 18%, gst = 18%, tcs = 1%, tds = 1%
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_top_up — Cashfree Collect webhook SUCCESS handler
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_top_up(p_top_up_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_top_up record;
  v_brand record;
  v_new_balance integer;
begin
  raise notice 'commit_top_up: %', p_top_up_id;

  select * into v_top_up
    from public.credit_top_ups
    where id = p_top_up_id
    for update;

  if v_top_up is null then
    raise exception 'credit_top_up % not found', p_top_up_id;
  end if;

  if v_top_up.status <> 'success' then
    raise exception 'commit_top_up requires status=success, got %', v_top_up.status;
  end if;

  -- Idempotency: if a credit_transactions row already exists for this top-up,
  -- we've already committed. No-op.
  if exists (
    select 1 from public.credit_transactions
    where reference_type = 'credit_top_up'
      and reference_id = v_top_up.id
      and type = 'topup'
  ) then
    raise notice 'commit_top_up: already committed for %, no-op', p_top_up_id;
    return;
  end if;

  select * into v_brand
    from public.brands
    where id = v_top_up.brand_id
    for update;

  if v_brand is null then
    raise exception 'brand % not found for top-up %', v_top_up.brand_id, p_top_up_id;
  end if;

  v_new_balance := v_brand.credits_balance_paise + v_top_up.amount_paise;

  insert into public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) values (
    v_top_up.brand_id, 'topup', v_top_up.amount_paise, v_new_balance,
    'credit_top_up', v_top_up.id,
    'Top-up ' || v_top_up.pack || ' (' || v_top_up.credits || ' credits)'
  );

  update public.brands
     set credits_balance_paise = v_new_balance,
         lifetime_topup_paise  = lifetime_topup_paise + v_top_up.amount_paise
   where id = v_top_up.brand_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_credit_reserve — hold credits against a pending license request
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_credit_reserve(
  p_brand_id uuid,
  p_amount_paise integer,
  p_ref_type text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_brand record;
  v_available integer;
begin
  raise notice 'commit_credit_reserve: brand=% amount=%', p_brand_id, p_amount_paise;

  if p_amount_paise <= 0 then
    raise exception 'commit_credit_reserve requires amount > 0, got %', p_amount_paise;
  end if;

  select * into v_brand
    from public.brands
    where id = p_brand_id
    for update;

  if v_brand is null then
    raise exception 'brand % not found', p_brand_id;
  end if;

  v_available := v_brand.credits_balance_paise - v_brand.credits_reserved_paise;
  if v_available < p_amount_paise then
    raise exception 'insufficient credits: available=% required=%', v_available, p_amount_paise;
  end if;

  insert into public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) values (
    p_brand_id, 'reserve', p_amount_paise, v_brand.credits_balance_paise,
    p_ref_type, p_ref_id,
    'Reserve against ' || p_ref_type
  );

  update public.brands
     set credits_reserved_paise = credits_reserved_paise + p_amount_paise
   where id = p_brand_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_credit_release_reserve — free a reserve without debiting balance
-- (e.g. creator rejected the request, request cancelled before acceptance)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_credit_release_reserve(
  p_brand_id uuid,
  p_amount_paise integer,
  p_ref_type text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_brand record;
begin
  raise notice 'commit_credit_release_reserve: brand=% amount=%', p_brand_id, p_amount_paise;

  if p_amount_paise <= 0 then
    raise exception 'commit_credit_release_reserve requires amount > 0, got %', p_amount_paise;
  end if;

  select * into v_brand
    from public.brands
    where id = p_brand_id
    for update;

  if v_brand is null then
    raise exception 'brand % not found', p_brand_id;
  end if;

  if v_brand.credits_reserved_paise < p_amount_paise then
    raise exception 'cannot release % from reserved %; underflow',
      p_amount_paise, v_brand.credits_reserved_paise;
  end if;

  insert into public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) values (
    p_brand_id, 'release_reserve', p_amount_paise, v_brand.credits_balance_paise,
    p_ref_type, p_ref_id,
    'Release reserve from ' || p_ref_type
  );

  update public.brands
     set credits_reserved_paise = credits_reserved_paise - p_amount_paise
   where id = p_brand_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_credit_spend — debit balance AND clear the reservation
-- Called as part of commit_license_acceptance; rarely stand-alone.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_credit_spend(
  p_brand_id uuid,
  p_amount_paise integer,
  p_ref_type text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_brand record;
  v_new_balance integer;
begin
  raise notice 'commit_credit_spend: brand=% amount=%', p_brand_id, p_amount_paise;

  if p_amount_paise <= 0 then
    raise exception 'commit_credit_spend requires amount > 0, got %', p_amount_paise;
  end if;

  select * into v_brand
    from public.brands
    where id = p_brand_id
    for update;

  if v_brand is null then
    raise exception 'brand % not found', p_brand_id;
  end if;

  if v_brand.credits_balance_paise < p_amount_paise then
    raise exception 'cannot spend % from balance %; underflow',
      p_amount_paise, v_brand.credits_balance_paise;
  end if;

  if v_brand.credits_reserved_paise < p_amount_paise then
    raise exception 'cannot spend % with only % reserved; must reserve first',
      p_amount_paise, v_brand.credits_reserved_paise;
  end if;

  v_new_balance := v_brand.credits_balance_paise - p_amount_paise;

  insert into public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) values (
    p_brand_id, 'spend', p_amount_paise, v_new_balance,
    p_ref_type, p_ref_id,
    'Spend on ' || p_ref_type
  );

  update public.brands
     set credits_balance_paise = v_new_balance,
         credits_reserved_paise = credits_reserved_paise - p_amount_paise
   where id = p_brand_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_license_acceptance — full state transition when creator signs contract
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.3 Step 3):
--   1. Lock license_request; require status = 'accepted'
--   2. Debit brand credits via commit_credit_spend (base + commission + gst)
--   3. Insert escrow_ledger 'lock' row (creator_locked += base_paise)
--   4. Insert platform_revenue_ledger 'commission' + 'gst_on_commission' rows
--   5. Insert gst_output_ledger 'output_on_commission' row
--   6. Transition status → 'active', set activated_at + expires_at
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_license_acceptance(p_license_request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_request record;
  v_period date := date_trunc('month', now())::date;
begin
  raise notice 'commit_license_acceptance: %', p_license_request_id;

  select * into v_request
    from public.license_requests
    where id = p_license_request_id
    for update;

  if v_request is null then
    raise exception 'license_request % not found', p_license_request_id;
  end if;

  if v_request.status <> 'accepted' then
    raise exception 'commit_license_acceptance requires status=accepted, got %',
      v_request.status;
  end if;

  -- Idempotency: if escrow lock already exists for this license, no-op.
  if exists (
    select 1 from public.escrow_ledger
    where license_request_id = p_license_request_id and type = 'lock'
  ) then
    raise notice 'commit_license_acceptance: lock already exists for %, no-op',
      p_license_request_id;
    return;
  end if;

  -- 1. Debit brand credits (clears the reservation from commit_credit_reserve).
  perform public.commit_credit_spend(
    v_request.brand_id,
    v_request.total_paise,
    'license_request',
    p_license_request_id
  );

  -- 2. Lock escrow. creator_locked_paise = base (all in escrow, none pending yet).
  insert into public.escrow_ledger (
    license_request_id, creator_id, brand_id,
    type, amount_paise,
    creator_locked_paise, creator_pending_paise, brand_refundable_paise,
    reference_type, reference_id, description
  ) values (
    p_license_request_id, v_request.creator_id, v_request.brand_id,
    'lock', v_request.base_paise,
    v_request.base_paise, 0, 0,
    'license_request', p_license_request_id,
    'Escrow lock on contract acceptance'
  );

  -- 3. Recognize platform commission.
  insert into public.platform_revenue_ledger (
    license_request_id, type, amount_paise, accounting_period, description
  ) values (
    p_license_request_id, 'commission', v_request.commission_paise, v_period,
    'Commission on license acceptance'
  );

  -- 4. Recognize GST on commission.
  insert into public.platform_revenue_ledger (
    license_request_id, type, amount_paise, accounting_period, description
  ) values (
    p_license_request_id, 'gst_on_commission', v_request.gst_on_commission_paise, v_period,
    'GST on platform commission'
  );

  -- 5. GST output — collected from brand, remitted by platform.
  insert into public.gst_output_ledger (
    reference_type, reference_id, brand_id,
    type, taxable_value_paise, rate_percent, tax_paise,
    accounting_period
  ) values (
    'license_request', p_license_request_id, v_request.brand_id,
    'output_on_commission',
    v_request.commission_paise, 18.00, v_request.gst_on_commission_paise,
    v_period
  );

  -- 6. Transition to ACTIVE. expires_at computed from validity_days snapshot.
  update public.license_requests
     set status       = 'active',
         activated_at = now(),
         expires_at   = now() + make_interval(days => v_request.validity_days)
   where id = p_license_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_image_approval — release one image's worth of escrow to creator
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.3 Step 4):
--   1. Lock license_request; require status = 'active'
--   2. Require images_approved < image_quota
--   3. Compute release_amount: per_image (+ residual iff final image)
--   4. Insert escrow_ledger 'release_per_image' row (locked -= amount, pending += amount)
--   5. Increment creator.pending_balance_paise + lifetime_earned_gross_paise
--   6. Increment license_requests.images_approved
--   7. If this was the final image, transition status → 'completed'
--
-- p_is_final:
--   Caller (API route) passes true iff this approval is the Nth image where
--   N == image_quota (i.e. will_be_images_approved == image_quota after the
--   increment). The procedure validates this to prevent residual double-payment.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_image_approval(
  p_license_request_id uuid,
  p_is_final boolean
)
returns void
language plpgsql
security definer
as $$
declare
  v_request record;
  v_latest record;
  v_release_per_image integer;
  v_residual integer;
  v_release_amount integer;
  v_is_final_computed boolean;
  v_new_approved integer;
  v_new_creator_locked integer;
  v_new_creator_pending integer;
begin
  raise notice 'commit_image_approval: % is_final=%', p_license_request_id, p_is_final;

  select * into v_request
    from public.license_requests
    where id = p_license_request_id
    for update;

  if v_request is null then
    raise exception 'license_request % not found', p_license_request_id;
  end if;

  if v_request.status <> 'active' then
    raise exception 'commit_image_approval requires status=active, got %',
      v_request.status;
  end if;

  if v_request.images_approved >= v_request.image_quota then
    raise exception 'all % slots already approved on license %',
      v_request.image_quota, p_license_request_id;
  end if;

  v_release_per_image := v_request.release_per_image_paise;
  v_residual := v_request.base_paise - v_release_per_image * v_request.image_quota;
  v_new_approved := v_request.images_approved + 1;

  -- Compute is_final independently and require the caller to match.
  v_is_final_computed := (v_new_approved = v_request.image_quota);
  if p_is_final <> v_is_final_computed then
    raise exception 'is_final mismatch: caller said %, computed % (approved will be %/%)',
      p_is_final, v_is_final_computed, v_new_approved, v_request.image_quota;
  end if;

  v_release_amount := v_release_per_image + (case when p_is_final then v_residual else 0 end);

  -- Read the latest escrow row for this license to continue the running totals.
  select *
    into v_latest
    from public.escrow_ledger
    where license_request_id = p_license_request_id
    order by created_at desc, id desc
    limit 1;

  if v_latest is null then
    raise exception 'no escrow lock exists for license % — call commit_license_acceptance first',
      p_license_request_id;
  end if;

  v_new_creator_locked  := v_latest.creator_locked_paise - v_release_amount;
  v_new_creator_pending := v_latest.creator_pending_paise + v_release_amount;

  insert into public.escrow_ledger (
    license_request_id, creator_id, brand_id,
    type, amount_paise,
    creator_locked_paise, creator_pending_paise, brand_refundable_paise,
    reference_type, reference_id, description
  ) values (
    p_license_request_id, v_request.creator_id, v_request.brand_id,
    'release_per_image', v_release_amount,
    v_new_creator_locked, v_new_creator_pending, v_latest.brand_refundable_paise,
    'license_request', p_license_request_id,
    case when p_is_final
         then 'Final image release (incl. residual)'
         else 'Per-image escrow release' end
  );

  update public.creators
     set pending_balance_paise        = pending_balance_paise + v_release_amount,
         lifetime_earned_gross_paise  = lifetime_earned_gross_paise + v_release_amount
   where id = v_request.creator_id;

  update public.license_requests
     set images_approved = v_new_approved,
         status = case when v_is_final_computed then 'completed' else status end,
         completed_at = case when v_is_final_computed then now() else completed_at end
   where id = p_license_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_expiry_refund — pro-rata refund to brand on license expiry
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.3 Step 5):
--   1. Lock license_request; require status = 'active' AND expires_at < now()
--   2. Compute refund = unused_slots * release_per_image + residual (if any unused)
--   3. Insert escrow_ledger 'refund_to_brand' row (locked -= refund, brand_refundable += refund)
--   4. Increment brands.credits_balance_paise += refund
--   5. Insert credit_transactions 'refund' row
--   6. Transition license_requests.status → 'expired'
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_expiry_refund(p_license_request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_request record;
  v_latest record;
  v_brand record;
  v_release_per_image integer;
  v_residual integer;
  v_remaining_slots integer;
  v_refund_paise integer;
  v_new_balance integer;
begin
  raise notice 'commit_expiry_refund: %', p_license_request_id;

  select * into v_request
    from public.license_requests
    where id = p_license_request_id
    for update;

  if v_request is null then
    raise exception 'license_request % not found', p_license_request_id;
  end if;

  if v_request.status <> 'active' then
    raise exception 'commit_expiry_refund requires status=active, got %',
      v_request.status;
  end if;

  if v_request.expires_at is null or v_request.expires_at >= now() then
    raise exception 'license % has not yet expired (expires_at=%)',
      p_license_request_id, v_request.expires_at;
  end if;

  v_release_per_image := v_request.release_per_image_paise;
  v_residual := v_request.base_paise - v_release_per_image * v_request.image_quota;
  v_remaining_slots := v_request.image_quota - v_request.images_approved;

  if v_remaining_slots <= 0 then
    -- Nothing to refund — transition to completed instead of expired for clarity.
    update public.license_requests
       set status = 'completed',
           completed_at = coalesce(completed_at, now())
     where id = p_license_request_id;
    raise notice 'commit_expiry_refund: all slots used, marked completed';
    return;
  end if;

  v_refund_paise := v_remaining_slots * v_release_per_image + v_residual;

  -- Running totals: continue from latest row.
  select *
    into v_latest
    from public.escrow_ledger
    where license_request_id = p_license_request_id
    order by created_at desc, id desc
    limit 1;

  if v_latest is null then
    raise exception 'no escrow history for license %', p_license_request_id;
  end if;

  insert into public.escrow_ledger (
    license_request_id, creator_id, brand_id,
    type, amount_paise,
    creator_locked_paise, creator_pending_paise, brand_refundable_paise,
    reference_type, reference_id, description
  ) values (
    p_license_request_id, v_request.creator_id, v_request.brand_id,
    'refund_to_brand', v_refund_paise,
    v_latest.creator_locked_paise - v_refund_paise,
    v_latest.creator_pending_paise,
    v_latest.brand_refundable_paise + v_refund_paise,
    'license_request', p_license_request_id,
    'Pro-rata refund on license expiry'
  );

  select * into v_brand
    from public.brands
    where id = v_request.brand_id
    for update;

  v_new_balance := v_brand.credits_balance_paise + v_refund_paise;

  insert into public.credit_transactions (
    brand_id, type, amount_paise, balance_after_paise,
    reference_type, reference_id, description
  ) values (
    v_request.brand_id, 'refund', v_refund_paise, v_new_balance,
    'license_request', p_license_request_id,
    'Refund from expired license'
  );

  update public.brands
     set credits_balance_paise = v_new_balance
   where id = v_request.brand_id;

  update public.license_requests
     set status = 'expired',
         completed_at = now()
   where id = p_license_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_withdrawal_deductions — apply TCS/TDS/(GST) at withdraw-time
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.4 Step 2):
--   1. Lock withdrawal_request; require status = 'requested' or 'kyc_check'
--   2. Compute tcs = 1% gross, tds = 1% gross, gst = 18% gross if GSTIN, net = gross - all
--   3. Insert tcs_ledger + tds_ledger + (optional) gst_output_ledger rows
--   4. Update withdrawal_requests.tcs_paise/tds_paise/gst_output_paise/net_paise
--   5. Transition status → 'deductions_applied'
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_withdrawal_deductions(
  p_withdrawal_request_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_req record;
  v_kyc record;
  v_has_gstin boolean := false;
  v_tcs integer;
  v_tds integer;
  v_gst integer;
  v_net integer;
  v_period date := date_trunc('month', now())::date;
begin
  raise notice 'commit_withdrawal_deductions: %', p_withdrawal_request_id;

  select * into v_req
    from public.withdrawal_requests
    where id = p_withdrawal_request_id
    for update;

  if v_req is null then
    raise exception 'withdrawal_request % not found', p_withdrawal_request_id;
  end if;

  if v_req.status not in ('requested', 'kyc_check') then
    raise exception 'commit_withdrawal_deductions requires status in (requested, kyc_check), got %',
      v_req.status;
  end if;

  -- Idempotency: if tax rows already exist for this withdrawal, no-op.
  if exists (
    select 1 from public.tcs_ledger
    where withdrawal_request_id = p_withdrawal_request_id
      and type = 'deducted_at_withdrawal'
  ) then
    raise notice 'commit_withdrawal_deductions: already applied, no-op';
    return;
  end if;

  -- GSTIN flag lives on creator_kyc. Missing row = no GSTIN.
  select * into v_kyc
    from public.creator_kyc
    where creator_id = v_req.creator_id;
  if v_kyc is not null then
    v_has_gstin := coalesce(v_kyc.is_gstin_registered, false);
  end if;

  v_tcs := round(v_req.gross_paise * 0.01)::integer;
  v_tds := round(v_req.gross_paise * 0.01)::integer;
  v_gst := case when v_has_gstin then round(v_req.gross_paise * 0.18)::integer else 0 end;
  v_net := v_req.gross_paise - v_tcs - v_tds - v_gst;

  if v_net <= 0 then
    raise exception 'withdrawal net must be positive; got gross=% net=%', v_req.gross_paise, v_net;
  end if;

  insert into public.tcs_ledger (
    withdrawal_request_id, creator_id,
    type, taxable_value_paise, rate_percent, tax_paise,
    accounting_period
  ) values (
    p_withdrawal_request_id, v_req.creator_id,
    'deducted_at_withdrawal', v_req.gross_paise, 1.00, v_tcs,
    v_period
  );

  insert into public.tds_ledger (
    withdrawal_request_id, creator_id,
    type, taxable_value_paise, rate_percent, tax_paise,
    accounting_period
  ) values (
    p_withdrawal_request_id, v_req.creator_id,
    'deducted_at_withdrawal', v_req.gross_paise, 1.00, v_tds,
    v_period
  );

  if v_has_gstin then
    insert into public.gst_output_ledger (
      reference_type, reference_id, creator_id,
      type, taxable_value_paise, rate_percent, tax_paise,
      accounting_period
    ) values (
      'withdrawal_request', p_withdrawal_request_id, v_req.creator_id,
      'output_on_creator_service', v_req.gross_paise, 18.00, v_gst,
      v_period
    );
  end if;

  update public.withdrawal_requests
     set status            = 'deductions_applied',
         tcs_paise         = v_tcs,
         tds_paise         = v_tds,
         gst_output_paise  = v_gst,
         net_paise         = v_net
   where id = p_withdrawal_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_withdrawal_success — Cashfree TRANSFER_SUCCESS webhook handler
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.4 Step 4 success branch):
--   1. Lock withdrawal_request; require status = 'processing'
--   2. Set status = 'success', record UTR, completed_at
--   3. Decrement creator.pending_balance_paise by gross
--      (the full gross left the creator's pending; net went to bank, deductions went to gov)
--   4. Increment creator.lifetime_withdrawn_net_paise by net
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_withdrawal_success(
  p_withdrawal_request_id uuid,
  p_cf_utr text
)
returns void
language plpgsql
security definer
as $$
declare
  v_req record;
  v_creator record;
begin
  raise notice 'commit_withdrawal_success: % utr=%', p_withdrawal_request_id, p_cf_utr;

  select * into v_req
    from public.withdrawal_requests
    where id = p_withdrawal_request_id
    for update;

  if v_req is null then
    raise exception 'withdrawal_request % not found', p_withdrawal_request_id;
  end if;

  if v_req.status = 'success' then
    -- Idempotent: webhook re-delivery is normal.
    raise notice 'commit_withdrawal_success: already success, no-op';
    return;
  end if;

  if v_req.status <> 'processing' then
    raise exception 'commit_withdrawal_success requires status=processing, got %',
      v_req.status;
  end if;

  select * into v_creator
    from public.creators
    where id = v_req.creator_id
    for update;

  if v_creator.pending_balance_paise < v_req.gross_paise then
    raise exception 'creator pending balance % < withdrawal gross %',
      v_creator.pending_balance_paise, v_req.gross_paise;
  end if;

  update public.creators
     set pending_balance_paise        = pending_balance_paise - v_req.gross_paise,
         lifetime_withdrawn_net_paise = lifetime_withdrawn_net_paise + v_req.net_paise
   where id = v_req.creator_id;

  update public.withdrawal_requests
     set status        = 'success',
         cf_utr        = p_cf_utr,
         completed_at  = now()
   where id = p_withdrawal_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- commit_withdrawal_failure — Cashfree TRANSFER_FAILED / REVERSED handler
-- ─────────────────────────────────────────────────────────────────────────────
-- Flow (spec §4.4 Step 4 failure branch):
--   1. Lock withdrawal_request; require status in ('processing','deductions_applied')
--   2. If deductions were applied, INSERT reversal rows on tax ledgers (negative-sign)
--      and zero the deduction columns on the row (except for audit via reversals).
--      We keep tcs_paise etc. on the row for audit; only net/gst reversals matter.
--   3. Restore: creator.pending_balance_paise — no change needed
--      (gross was never decremented; that happens only on success).
--   4. Transition status → 'failed', record failure_reason.
--
-- Reversals: ledger rows are APPEND-ONLY (spec §3 principle 2). Rather than
-- UPDATE the original row, we INSERT a new row with type='reversal' and
-- tax_paise = -original_paise.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_withdrawal_failure(
  p_withdrawal_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
as $$
declare
  v_req record;
  v_period date := date_trunc('month', now())::date;
begin
  raise notice 'commit_withdrawal_failure: % reason=%', p_withdrawal_request_id, p_reason;

  select * into v_req
    from public.withdrawal_requests
    where id = p_withdrawal_request_id
    for update;

  if v_req is null then
    raise exception 'withdrawal_request % not found', p_withdrawal_request_id;
  end if;

  if v_req.status = 'failed' then
    raise notice 'commit_withdrawal_failure: already failed, no-op';
    return;
  end if;

  if v_req.status not in ('processing', 'deductions_applied') then
    raise exception 'commit_withdrawal_failure requires status in (processing, deductions_applied), got %',
      v_req.status;
  end if;

  -- Reverse tax ledger entries if they exist. Negative-sign rows of type 'reversal'.
  if v_req.tcs_paise > 0 then
    insert into public.tcs_ledger (
      withdrawal_request_id, creator_id,
      type, taxable_value_paise, rate_percent, tax_paise,
      accounting_period
    ) values (
      p_withdrawal_request_id, v_req.creator_id,
      'reversal', v_req.gross_paise, 1.00, -v_req.tcs_paise,
      v_period
    );
  end if;

  if v_req.tds_paise > 0 then
    insert into public.tds_ledger (
      withdrawal_request_id, creator_id,
      type, taxable_value_paise, rate_percent, tax_paise,
      accounting_period
    ) values (
      p_withdrawal_request_id, v_req.creator_id,
      'reversal', v_req.gross_paise, 1.00, -v_req.tds_paise,
      v_period
    );
  end if;

  if v_req.gst_output_paise > 0 then
    insert into public.gst_output_ledger (
      reference_type, reference_id, creator_id,
      type, taxable_value_paise, rate_percent, tax_paise,
      accounting_period
    ) values (
      'withdrawal_request', p_withdrawal_request_id, v_req.creator_id,
      'reversal', v_req.gross_paise, 18.00, -v_req.gst_output_paise,
      v_period
    );
  end if;

  -- pending_balance was never decremented (that only happens on success),
  -- so nothing to restore there.

  update public.withdrawal_requests
     set status         = 'failed',
         failure_reason = p_reason,
         completed_at   = now()
   where id = p_withdrawal_request_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions: functions are security definer and called via admin client.
-- We grant EXECUTE to service_role only. (authenticated/anon cannot invoke.)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.commit_top_up(uuid) from public;
revoke all on function public.commit_credit_reserve(uuid, integer, text, uuid) from public;
revoke all on function public.commit_credit_release_reserve(uuid, integer, text, uuid) from public;
revoke all on function public.commit_credit_spend(uuid, integer, text, uuid) from public;
revoke all on function public.commit_license_acceptance(uuid) from public;
revoke all on function public.commit_image_approval(uuid, boolean) from public;
revoke all on function public.commit_expiry_refund(uuid) from public;
revoke all on function public.commit_withdrawal_deductions(uuid) from public;
revoke all on function public.commit_withdrawal_success(uuid, text) from public;
revoke all on function public.commit_withdrawal_failure(uuid, text) from public;

grant execute on function public.commit_top_up(uuid) to service_role;
grant execute on function public.commit_credit_reserve(uuid, integer, text, uuid) to service_role;
grant execute on function public.commit_credit_release_reserve(uuid, integer, text, uuid) to service_role;
grant execute on function public.commit_credit_spend(uuid, integer, text, uuid) to service_role;
grant execute on function public.commit_license_acceptance(uuid) to service_role;
grant execute on function public.commit_image_approval(uuid, boolean) to service_role;
grant execute on function public.commit_expiry_refund(uuid) to service_role;
grant execute on function public.commit_withdrawal_deductions(uuid) to service_role;
grant execute on function public.commit_withdrawal_success(uuid, text) to service_role;
grant execute on function public.commit_withdrawal_failure(uuid, text) to service_role;


comment on function public.commit_top_up is
  'Cashfree Collect webhook SUCCESS handler. Inserts credit_transactions (type=topup) + updates brands.credits_balance_paise. Idempotent.';
comment on function public.commit_license_acceptance is
  'Creator clicks accept → debits brand credits, locks escrow, recognizes platform revenue + GST output, transitions request to ACTIVE with expires_at. Idempotent.';
comment on function public.commit_image_approval is
  'Per-image approval: releases 1/quota of base to creator pending balance. On the final image (p_is_final=true) bundles the residual. Transitions to COMPLETED on final.';
comment on function public.commit_expiry_refund is
  'License expired with unused slots: refund pro-rata + residual to brand credits, transition to EXPIRED.';
comment on function public.commit_withdrawal_deductions is
  'Apply TCS (1%) + TDS (1%) + GST (18% if GSTIN) at withdrawal time. Inserts tax ledger rows + snapshots on withdrawal_requests. Idempotent.';
comment on function public.commit_withdrawal_success is
  'Cashfree Payouts SUCCESS webhook handler. Decrements creator pending_balance by gross, increments lifetime_withdrawn_net. Idempotent.';
comment on function public.commit_withdrawal_failure is
  'Cashfree Payouts FAILED/REVERSED webhook handler. Inserts negative-sign reversal rows on tax ledgers; pending_balance untouched (never debited pre-success). Idempotent.';
