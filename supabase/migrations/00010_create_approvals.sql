create table public.approvals (
  id uuid primary key default extensions.uuid_generate_v4(),
  generation_id uuid not null unique references public.generations(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null check (status in (
    'pending', 'approved', 'rejected', 'expired', 'revision_requested'
  )) default 'pending',
  feedback text,
  decided_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_approvals_generation_id on public.approvals(generation_id);
create index idx_approvals_creator_id on public.approvals(creator_id);
create index idx_approvals_status on public.approvals(status);
create index idx_approvals_expires_at on public.approvals(expires_at) where status = 'pending';

-- RLS
alter table public.approvals enable row level security;
create policy "Creators can read own approvals" on public.approvals for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can update own approvals" on public.approvals for update using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Brands can read own approvals" on public.approvals for select using (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Admins can read all approvals" on public.approvals for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
