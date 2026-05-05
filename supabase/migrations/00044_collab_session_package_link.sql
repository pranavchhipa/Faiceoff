-- Link a collab_session back to its originating package + request, and snapshot
-- approved_count for fast progress display.

alter table public.collab_sessions
  add column collab_request_id uuid references public.collab_requests(id),
  add column package_id uuid references public.creator_packages(id),
  add column package_tier text check (package_tier in ('frame', 'feature', 'cover')),
  add column package_price_paise integer,
  add column final_images_target integer,
  add column approved_count integer not null default 0,
  add column gen_credits_total integer,
  add column gen_credits_used integer not null default 0,
  add column usage_scope text check (usage_scope in ('social_organic', 'social_paid', 'digital_full')),
  add column license_expires_at timestamptz;

create index idx_collab_sessions_package on public.collab_sessions(package_id) where package_id is not null;
create index idx_collab_sessions_request on public.collab_sessions(collab_request_id) where collab_request_id is not null;

comment on column public.collab_sessions.approved_count is
  'Cached count of approved generations within this session. Updated by approvals trigger or in approve API route.';
comment on column public.collab_sessions.gen_credits_total is
  'Total generation credits granted at collab start (= final_images × 3).';
comment on column public.collab_sessions.license_expires_at is
  'Computed at collab completion: completed_at + (license_duration_days from package).';
