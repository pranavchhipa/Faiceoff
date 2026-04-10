create table public.creator_categories (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  category text not null,
  subcategories text[] not null default '{}',
  price_per_generation_paise integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_creator_categories_creator_id on public.creator_categories(creator_id);
create index idx_creator_categories_active on public.creator_categories(is_active) where is_active = true;

-- RLS
alter table public.creator_categories enable row level security;
create policy "Creators can read own categories" on public.creator_categories for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can insert own categories" on public.creator_categories for insert with check (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can update own categories" on public.creator_categories for update using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can delete own categories" on public.creator_categories for delete using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Brands can read active categories" on public.creator_categories for select using (is_active = true);

create trigger on_creator_categories_updated
  before update on public.creator_categories
  for each row execute function public.handle_updated_at();
