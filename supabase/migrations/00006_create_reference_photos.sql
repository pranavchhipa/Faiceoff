create table public.creator_reference_photos (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  storage_path text not null,
  face_embedding vector(512),
  is_primary boolean not null default false,
  uploaded_at timestamptz not null default now()
);

-- Indexes
create index idx_reference_photos_creator_id on public.creator_reference_photos(creator_id);

-- RLS
alter table public.creator_reference_photos enable row level security;
create policy "Creators can read own photos" on public.creator_reference_photos for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can insert own photos" on public.creator_reference_photos for insert with check (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can update own photos" on public.creator_reference_photos for update using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can delete own photos" on public.creator_reference_photos for delete using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Admins can read all photos" on public.creator_reference_photos for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
