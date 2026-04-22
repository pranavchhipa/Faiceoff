-- ═══════════════════════════════════════════════════════════════════════════
-- Chunk C — Starter data seed (migration 00031)
-- Ref plan: docs/superpowers/plans/2026-04-22-chunk-c-foundation.md Task 34
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §8
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Seeds day-1 state for pre-revamp users so the marketplace is usable
-- immediately after cutover:
--
--   1. Grants ₹250 (25000 paise) starter credits to every existing brand with
--      zero balance. Matches the free_signup pack from src/domains/credit/types.ts
--      (5 credits × ₹50/credit). Pre-revamp brands wouldn't have run through the
--      new signup flow that auto-grants this, so we backfill.
--
--   2. Auto-creates a default Creation license listing for every active creator.
--      Defaults match LICENSE_TEMPLATES.creation in src/domains/license/templates.ts
--      (₹6,000 / 25 images / 90 days). Creators can edit price/quota/validity
--      later via their listing UI, but this ensures they show up in brand
--      discovery on day 1.
--
-- Idempotent by design:
--   - Step 1 uses a description-keyed EXISTS check to avoid double-grant.
--   - Step 2 uses `on conflict (creator_id, template) do nothing` — the unique
--     constraint on creator_license_listings(creator_id, template) guarantees
--     at most one Creation listing per creator.
-- Safe to re-run after new brands/creators are added.
--
-- Verification after apply:
--   select count(*) from public.credit_transactions
--     where description = 'Revamp migration starter credits';
--   → should equal the count of brands that existed pre-migration
--
--   select count(*) from public.creator_license_listings where template = 'creation';
--   → should equal the count of creators where is_active = true pre-migration
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Starter credits — ₹250 for every brand with zero balance ─────────────
-- Matches CREDIT_PACKS.free_signup (5 credits × ₹50 = ₹250 = 25000 paise).
-- Granted free (not purchased), so lifetime_topup_paise is NOT incremented —
-- that counter is reserved for actual money inflows.
with brands_to_seed as (
  select b.id
  from public.brands b
  where b.credits_balance_paise = 0
    and not exists (
      select 1
      from public.credit_transactions ct
      where ct.brand_id = b.id
        and ct.type = 'bonus'
        and ct.description = 'Revamp migration starter credits'
    )
)
insert into public.credit_transactions (
  brand_id, type, amount_paise, balance_after_paise, description
)
select
  id,
  'bonus',
  25000,    -- ₹250 in paise (5 credits × ₹50)
  25000,    -- balance_after: started at 0, now 25000
  'Revamp migration starter credits'
from brands_to_seed;

-- Bump the denormalized balance on brands for brands that just got a ledger row.
-- Guarded by the same description match so we never double-credit.
update public.brands b
set credits_balance_paise = 25000
where b.credits_balance_paise = 0
  and exists (
    select 1
    from public.credit_transactions ct
    where ct.brand_id = b.id
      and ct.type = 'bonus'
      and ct.description = 'Revamp migration starter credits'
  );


-- ── 2. Default Creation listing for every active creator ────────────────────
-- Defaults mirror LICENSE_TEMPLATES.creation from src/domains/license/templates.ts.
-- Creators can edit these via the listing CRUD (Task 20) after login.
-- The (creator_id, template) unique constraint + on conflict clause makes this
-- safe to re-run against creators who already have a listing.
insert into public.creator_license_listings (
  creator_id, template, price_paise, image_quota, validity_days,
  ig_post_required, is_active
)
select
  id,
  'creation',
  600000,   -- ₹6,000 base price
  25,       -- 25 image quota
  90,       -- 90 day validity
  false,    -- Creation template never requires an IG post
  true      -- Active by default so brands can discover them
from public.creators
where is_active = true
on conflict (creator_id, template) do nothing;


-- ── 3. Optional: default Creation+Promotion listing ─────────────────────────
-- Intentionally NOT auto-created. Creators opt in to this template via the
-- listing UI because it commits them to an Instagram post, which not every
-- creator wants as their default product. Uncomment to auto-create:
--
-- insert into public.creator_license_listings (
--   creator_id, template, price_paise, image_quota, validity_days,
--   ig_post_required, is_active
-- )
-- select id, 'creation_promotion', 1500000, 10, 30, true, true
-- from public.creators where is_active = true
-- on conflict (creator_id, template) do nothing;


-- ── 4. Column comment announcing the seed ──────────────────────────────────
comment on column public.brands.credits_balance_paise is
  'Current brand credit balance in paise. Seeded with 25000 (₹250) for pre-revamp brands on 2026-04-22 via migration 00031.';
