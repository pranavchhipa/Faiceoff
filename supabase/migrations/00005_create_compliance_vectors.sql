create table public.creator_compliance_vectors (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  blocked_concept text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_compliance_vectors_creator_id on public.creator_compliance_vectors(creator_id);
create index idx_compliance_vectors_embedding on public.creator_compliance_vectors
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table public.creator_compliance_vectors enable row level security;
create policy "Creators can read own compliance vectors" on public.creator_compliance_vectors for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can insert own compliance vectors" on public.creator_compliance_vectors for insert with check (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can update own compliance vectors" on public.creator_compliance_vectors for update using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can delete own compliance vectors" on public.creator_compliance_vectors for delete using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Admins can read all compliance vectors" on public.creator_compliance_vectors for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
