create table public.creators (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  instagram_handle text,
  instagram_followers integer,
  bio text,
  kyc_status text not null check (kyc_status in ('not_started', 'pending', 'approved', 'rejected')) default 'not_started',
  kyc_document_url text, -- encrypted path, 90-day auto-delete
  onboarding_step text not null check (onboarding_step in (
    'identity', 'instagram', 'categories', 'compliance', 'consent', 'photos', 'lora_review', 'pricing', 'complete'
  )) default 'identity',
  is_active boolean not null default false,
  dpdp_consent_version text,
  dpdp_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_creators_user_id on public.creators(user_id);
create index idx_creators_kyc_status on public.creators(kyc_status);
create index idx_creators_is_active on public.creators(is_active) where is_active = true;

-- RLS
alter table public.creators enable row level security;
create policy "Creators can read own profile" on public.creators for select using (user_id = auth.uid());
create policy "Creators can update own profile" on public.creators for update using (user_id = auth.uid());
create policy "Brands can read active creators" on public.creators for select using (is_active = true);
create policy "Admins can read all creators" on public.creators for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "Admins can update all creators" on public.creators for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_creators_updated
  before update on public.creators
  for each row execute function public.handle_updated_at();
