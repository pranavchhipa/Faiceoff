-- ============================================================================
-- One-off backfill for generations that were approved but never settled
-- because the wallet_transactions CHECK constraint rejected
-- 'generation_earning' / 'generation_spend' rows.
--
-- Run this AFTER migration 00015 has been applied (which extends the CHECK
-- constraint and adds the uniqueness guard).
--
-- Safe to re-run: uses ON CONFLICT DO NOTHING so rows aren't duplicated, and
-- reconciles campaign.spent_paise / generation_count to the ground truth
-- (sum of approved generations' cost).
-- ============================================================================

begin;

-- ── 1. Insert missing creator credit rows ─────────────────────────────────
-- For every approved generation that has no 'generation_earning' row yet,
-- create one credited to that creator's user. balance_after_paise is
-- computed off the running max to stay consistent with the denormalised
-- balance the wallet page reads.
with candidates as (
  select
    g.id             as generation_id,
    g.cost_paise,
    c.user_id        as creator_user_id
  from public.generations g
  join public.creators c on c.id = g.creator_id
  where g.status = 'approved'
    and g.cost_paise is not null
    and not exists (
      select 1
      from public.wallet_transactions wt
      where wt.reference_id = g.id
        and wt.reference_type = 'generation'
        and wt.type = 'generation_earning'
    )
),
prior_balance as (
  select
    cand.generation_id,
    cand.cost_paise,
    cand.creator_user_id,
    coalesce(
      (
        select wt.balance_after_paise
        from public.wallet_transactions wt
        where wt.user_id = cand.creator_user_id
        order by wt.created_at desc
        limit 1
      ),
      0
    ) as balance_before
  from candidates cand
)
insert into public.wallet_transactions (
  user_id, type, amount_paise, direction,
  reference_id, reference_type, balance_after_paise, description
)
select
  pb.creator_user_id,
  'generation_earning',
  pb.cost_paise,
  'credit',
  pb.generation_id,
  'generation',
  pb.balance_before + pb.cost_paise,
  'Earning for generation ' || pb.generation_id || ' (backfill)'
from prior_balance pb
on conflict do nothing;

-- ── 2. Insert missing brand debit rows ────────────────────────────────────
with candidates as (
  select
    g.id          as generation_id,
    g.cost_paise,
    b.user_id     as brand_user_id
  from public.generations g
  join public.brands b on b.id = g.brand_id
  where g.status = 'approved'
    and g.cost_paise is not null
    and not exists (
      select 1
      from public.wallet_transactions wt
      where wt.reference_id = g.id
        and wt.reference_type = 'generation'
        and wt.type = 'generation_spend'
    )
),
prior_balance as (
  select
    cand.generation_id,
    cand.cost_paise,
    cand.brand_user_id,
    coalesce(
      (
        select wt.balance_after_paise
        from public.wallet_transactions wt
        where wt.user_id = cand.brand_user_id
        order by wt.created_at desc
        limit 1
      ),
      0
    ) as balance_before
  from candidates cand
)
insert into public.wallet_transactions (
  user_id, type, amount_paise, direction,
  reference_id, reference_type, balance_after_paise, description
)
select
  pb.brand_user_id,
  'generation_spend',
  pb.cost_paise,
  'debit',
  pb.generation_id,
  'generation',
  greatest(0, pb.balance_before - pb.cost_paise),
  'Spend for generation ' || pb.generation_id || ' (backfill)'
from prior_balance pb
on conflict do nothing;

-- ── 3. Set delivery_url for approved generations that don't have one ──────
update public.generations
set delivery_url = image_url
where status = 'approved'
  and delivery_url is null
  and image_url is not null;

-- ── 4. Reconcile campaign counters to ground truth ────────────────────────
-- Previous pipeline runs may have double-incremented spent_paise /
-- generation_count on Inngest retries. We rebuild these from the approved
-- generations themselves rather than trusting the stored counter.
with approved_totals as (
  select
    campaign_id,
    count(*)                          as approved_count,
    coalesce(sum(cost_paise), 0)::int as approved_spend
  from public.generations
  where status = 'approved'
  group by campaign_id
)
update public.campaigns c
set
  spent_paise      = at.approved_spend,
  generation_count = at.approved_count
from approved_totals at
where c.id = at.campaign_id;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
-- Run these to confirm the backfill worked. Each approved generation should
-- have exactly one earning row and one spend row.
--
-- select g.id, g.status, g.cost_paise,
--        (select count(*) from wallet_transactions wt
--         where wt.reference_id = g.id and wt.type = 'generation_earning') as earn_count,
--        (select count(*) from wallet_transactions wt
--         where wt.reference_id = g.id and wt.type = 'generation_spend') as spend_count
-- from generations g
-- where g.status = 'approved'
-- order by g.created_at desc;
