-- Collaboration Agreements — per-collab master agreement (industry MSA).
--
-- Generated when a brand pays and a collab_session starts. Dual e-signed:
--   • Creator signs at ACCEPT (before payment).
--   • Brand signs at PAYMENT.
-- Once both have signed, a tamper-evident PDF is rendered + stored in R2 and
-- the agreement goes 'active'. Per-image license certs (table `licenses`) sit
-- UNDER this master agreement — this row is additive, it does not replace them.
--
-- One row per collab_request. Terms are SNAPSHOTTED here so the signed PDF is
-- immune to later package edits by the creator.

create table public.collab_agreements (
  id                     uuid primary key default extensions.uuid_generate_v4(),
  collab_request_id      uuid not null references public.collab_requests(id) on delete cascade,
  collab_session_id      uuid references public.collab_sessions(id) on delete set null,
  brand_id               uuid not null references public.brands(id) on delete cascade,
  creator_id             uuid not null references public.creators(id) on delete cascade,

  agreement_version      text not null default '1.0',

  -- ── Terms snapshot (immutable copy of request terms at signing time) ──
  package_tier           text not null,
  package_price_paise    integer not null,
  final_images           integer not null,
  usage_scope            text not null,
  license_duration_days  integer not null,
  product_name           text not null,
  creator_share_paise    integer not null,
  platform_share_paise   integer not null,

  -- ── Creator signature (captured at accept) ──
  creator_signed_name    text,
  creator_signed_at      timestamptz,
  creator_signed_ip      text,

  -- ── Brand signature (captured at payment) ──
  brand_signed_name      text,
  brand_signed_at        timestamptz,
  brand_signed_ip        text,

  status                 text not null default 'pending_brand' check (status in (
    'pending_brand',  -- creator signed, awaiting brand signature + payment
    'active',         -- both signed, collab funded
    'cancelled'       -- request declined/expired/cancelled before payment
  )),

  -- ── Rendered, dual-signed PDF (set after brand signs) ──
  pdf_url                text,
  pdf_sha256             text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Exactly one agreement per request.
  unique (collab_request_id)
);

create index idx_collab_agreements_session  on public.collab_agreements(collab_session_id) where collab_session_id is not null;
create index idx_collab_agreements_brand    on public.collab_agreements(brand_id);
create index idx_collab_agreements_creator  on public.collab_agreements(creator_id);

alter table public.collab_agreements enable row level security;

create policy "Brand reads own agreements" on public.collab_agreements
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));
create policy "Creator reads own agreements" on public.collab_agreements
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
-- Inserts/updates go through the admin client in API routes only.
-- Public verification reads via the admin client with a zero-PII projection.

create trigger on_collab_agreements_updated
  before update on public.collab_agreements
  for each row execute function public.handle_updated_at();

comment on table public.collab_agreements is
  'Per-collab master agreement, dual e-signed (creator at accept, brand at payment). Snapshots package terms. One row per collab_request. Additive to per-image license certs.';
