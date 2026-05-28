-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00064: Brand-side "Saved creators" (heart icon) persistence
--
-- The /brand/discover Heart button was localStorage-only — no cross-device
-- sync, lost on incognito or browser clear. This table stores the
-- (brand → creator) saves server-side. Composite PK doubles as the dedupe
-- + uniqueness guarantee. RLS keeps every brand to their own list; admin
-- (service role) writes from the API routes bypass RLS.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.brand_saved_creators (
  brand_id    uuid not null references public.brands(id)   on delete cascade,
  creator_id  uuid not null references public.creators(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (brand_id, creator_id)
);

-- Fast "all the creators this brand saved" reads
create index if not exists brand_saved_creators_brand_idx
  on public.brand_saved_creators (brand_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.brand_saved_creators enable row level security;

-- A brand can only read their own saves
create policy "brand_saved_creators_self_read"
  on public.brand_saved_creators for select
  using (
    brand_id in (
      select b.id from public.brands b where b.user_id = auth.uid()
    )
  );

-- Inserts / deletes go through the admin (service-role) API routes so no
-- direct end-user write policy is needed. Locking writes to the server keeps
-- the brand_id derivation tamper-proof.

comment on table  public.brand_saved_creators is
  'Per-brand bookmark of creators (Heart button on /brand/discover). Composite (brand_id, creator_id) PK.';
