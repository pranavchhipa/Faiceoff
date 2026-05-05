-- Creator-defined collaboration packages.
-- Tier name + usage scope are platform-fixed; creator only sets price + final_images.

create table public.creator_packages (
  id              uuid primary key default extensions.uuid_generate_v4(),
  creator_id      uuid not null references public.creators(id) on delete cascade,
  tier            text not null check (tier in ('frame', 'feature', 'cover')),
  price_paise     integer not null check (price_paise >= 150000), -- ₹1,500 minimum floor
  final_images    integer not null check (final_images between 1 and 20),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (creator_id, tier)  -- one row per creator per tier
);

create index idx_creator_packages_creator on public.creator_packages(creator_id);
create index idx_creator_packages_active on public.creator_packages(creator_id, is_active) where is_active = true;

-- RLS
alter table public.creator_packages enable row level security;

create policy "Creators read own packages" on public.creator_packages
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
create policy "Creators write own packages" on public.creator_packages
  for all using (creator_id in (select id from public.creators where user_id = auth.uid()));
create policy "Anyone reads active packages" on public.creator_packages
  for select using (is_active = true);

create trigger on_creator_packages_updated
  before update on public.creator_packages
  for each row execute function public.handle_updated_at();

-- Computed in application code (not as generated column due to portability):
--   gen_credits = final_images × 3
--   usage_scope is mapped from tier:
--     frame    → 'social_organic'      (90 days)
--     feature  → 'social_paid'         (6 months)
--     cover    → 'digital_full'        (12 months)

comment on table public.creator_packages is
  'Creator-defined collab packages. Tier (frame/feature/cover) fixes name + usage scope. Creator sets price + final_images count. gen_credits computed in app as final_images × 3.';
