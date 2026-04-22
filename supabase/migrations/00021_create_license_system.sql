-- ═══════════════════════════════════════════════════════════════════════════
-- License marketplace: creator-listed licenses + brand requests + contracts
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three tables:
--   creator_license_listings — creator-owned template instances (price/quota/validity editable)
--   license_requests         — brand-initiated request with frozen pricing snapshot
--   license_contracts        — click-to-accept PDF audit trail (IT Act 2000)
--
-- Templates: 'creation' (default ₹6,000 / 25 img / 90d) and 'creation_promotion'
-- (default ₹15,000 / 10 img + 1 IG post / 30d).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── creator_license_listings: creator-owned pricing ──────────────────────────
create table public.creator_license_listings (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  template text not null check (template in ('creation', 'creation_promotion')),
  price_paise integer not null check (price_paise > 0),
  image_quota integer not null check (image_quota > 0),
  validity_days integer not null check (validity_days > 0),
  ig_post_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, template)
);

create index idx_cll_creator on public.creator_license_listings(creator_id);
create index idx_cll_active on public.creator_license_listings(is_active) where is_active = true;

alter table public.creator_license_listings enable row level security;
create policy "Anyone can read active listings" on public.creator_license_listings
  for select using (is_active = true);
create policy "Creators manage own listings" on public.creator_license_listings
  for all using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all listings" on public.creator_license_listings
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_cll_updated
  before update on public.creator_license_listings
  for each row execute function public.handle_updated_at();

-- ── license_requests: brand request with frozen pricing ──────────────────────
create table public.license_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  listing_id uuid not null references public.creator_license_listings(id),
  creator_id uuid not null references public.creators(id),
  brand_id uuid not null references public.brands(id),
  status text not null check (status in (
    'draft', 'requested', 'accepted', 'active', 'rejected', 'expired', 'cancelled', 'completed'
  )) default 'requested',

  -- Pricing snapshot (frozen at request time even if listing edits)
  base_paise integer not null,
  commission_paise integer not null,
  gst_on_commission_paise integer not null,
  total_paise integer not null,
  image_quota integer not null,
  validity_days integer not null,
  release_per_image_paise integer not null,

  -- Progress
  images_requested integer not null default 0,
  images_approved integer not null default 0,
  images_rejected integer not null default 0,

  -- Lifecycle timestamps
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,

  brand_notes text,
  creator_reject_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lr_creator_status on public.license_requests(creator_id, status);
create index idx_lr_brand_status on public.license_requests(brand_id, status);
create index idx_lr_expires on public.license_requests(expires_at) where status = 'active';

alter table public.license_requests enable row level security;
create policy "Creators read own requests" on public.license_requests
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Brands read own requests" on public.license_requests
  for select using (
    brand_id in (select id from public.brands where user_id = auth.uid())
  );
create policy "Admins read all requests" on public.license_requests
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_lr_updated
  before update on public.license_requests
  for each row execute function public.handle_updated_at();

-- ── license_contracts: click-to-accept audit trail ───────────────────────────
create table public.license_contracts (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid not null references public.license_requests(id) on delete cascade unique,

  -- Contract document
  pdf_r2_path text not null,
  pdf_hash_sha256 text not null,
  template_version text not null,

  -- Acceptance audit (IT Act 2000)
  creator_accepted_at timestamptz not null,
  creator_accept_ip text not null,
  creator_accept_user_agent text not null,
  brand_accepted_at timestamptz,
  brand_accept_ip text,
  brand_accept_user_agent text,

  -- License terms frozen at accept-time (scope, usage rights, quota, price, validity)
  terms_json jsonb not null,

  created_at timestamptz not null default now()
);

create index idx_lc_lr on public.license_contracts(license_request_id);

alter table public.license_contracts enable row level security;
create policy "Parties read own contracts" on public.license_contracts
  for select using (
    license_request_id in (
      select id from public.license_requests lr
      where lr.creator_id in (select id from public.creators where user_id = auth.uid())
         or lr.brand_id in (select id from public.brands where user_id = auth.uid())
    )
  );
create policy "Admins read all contracts" on public.license_contracts
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

comment on table public.creator_license_listings is
  'Creator-owned license offerings. One row per (creator, template). price/quota/validity editable by creator; retry policy and commission % are platform-level.';
comment on table public.license_requests is
  'Brand-initiated license request. Pricing snapshot frozen at request time so subsequent listing edits do not affect in-flight requests.';
comment on table public.license_contracts is
  'Click-to-accept digital contract PDF + acceptance audit trail (IP, UA, timestamp) per IT Act 2000 Sec 10A. PDF stored in R2 bucket faiceoff-contracts, SHA256 for integrity verification.';
