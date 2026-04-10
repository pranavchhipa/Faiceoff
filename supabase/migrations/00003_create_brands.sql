create table public.brands (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  company_name text not null,
  gst_number text,
  website_url text,
  industry text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_brands_user_id on public.brands(user_id);

-- RLS
alter table public.brands enable row level security;
create policy "Brands can read own profile" on public.brands for select using (user_id = auth.uid());
create policy "Brands can update own profile" on public.brands for update using (user_id = auth.uid());
create policy "Admins can read all brands" on public.brands for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "Admins can update all brands" on public.brands for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_brands_updated
  before update on public.brands
  for each row execute function public.handle_updated_at();
