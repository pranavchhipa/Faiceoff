-- Brand → Creator collaboration requests. Sit between "discover" and "active collab".
-- Once accepted + paid, a collab_session row is created (existing table).

create table public.collab_requests (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  brand_id              uuid not null references public.brands(id) on delete cascade,
  creator_id            uuid not null references public.creators(id) on delete cascade,
  package_id            uuid not null references public.creator_packages(id) on delete restrict,

  -- Snapshot of package terms at request time (immune to creator changes mid-flight)
  package_tier          text not null check (package_tier in ('frame', 'feature', 'cover')),
  package_price_paise   integer not null,
  final_images          integer not null,
  gen_credits           integer not null,
  usage_scope           text not null check (usage_scope in ('social_organic', 'social_paid', 'digital_full')),
  license_duration_days integer not null,

  -- Brief (brand fills these on request)
  product_name          text not null,
  product_image_url     text not null,
  brief_one_liner       text not null check (length(brief_one_liner) between 1 and 500),

  status                text not null check (status in (
    'pending',     -- waiting for creator decision
    'accepted',    -- creator accepted, awaiting brand payment
    'declined',    -- creator declined
    'paid',        -- brand paid, collab_session created (terminal for this row)
    'expired',     -- creator didn't respond in time
    'cancelled'    -- brand cancelled before acceptance
  )) default 'pending',

  decline_reason        text,
  expires_at            timestamptz not null,  -- typically created_at + 72h
  decided_at            timestamptz,
  paid_at               timestamptz,
  collab_session_id     uuid references public.collab_sessions(id),  -- linked once paid

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_collab_requests_brand on public.collab_requests(brand_id, status);
create index idx_collab_requests_creator on public.collab_requests(creator_id, status);
create index idx_collab_requests_pending_expiry on public.collab_requests(expires_at) where status = 'pending';

alter table public.collab_requests enable row level security;
create policy "Brand reads own requests" on public.collab_requests
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));
create policy "Creator reads own requests" on public.collab_requests
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
-- Inserts/updates go through admin client in API routes only.

create trigger on_collab_requests_updated
  before update on public.collab_requests
  for each row execute function public.handle_updated_at();

comment on table public.collab_requests is
  'Brand-initiated collab requests. Snapshots package terms at request time. Transitions: pending → accepted → paid → (links collab_session). Or pending → declined/expired/cancelled.';
