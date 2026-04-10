create table public.campaigns (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  name text not null,
  description text,
  budget_paise integer not null,
  spent_paise integer not null default 0,
  generation_count integer not null default 0,
  max_generations integer not null,
  status text not null check (status in ('active', 'paused', 'completed', 'cancelled')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_campaigns_brand_id on public.campaigns(brand_id);
create index idx_campaigns_creator_id on public.campaigns(creator_id);
create index idx_campaigns_status on public.campaigns(status);

-- RLS
alter table public.campaigns enable row level security;
create policy "Brands can read own campaigns" on public.campaigns for select using (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Brands can insert own campaigns" on public.campaigns for insert with check (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Brands can update own campaigns" on public.campaigns for update using (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Creators can read campaigns they are part of" on public.campaigns for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Admins can read all campaigns" on public.campaigns for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_campaigns_updated
  before update on public.campaigns
  for each row execute function public.handle_updated_at();
