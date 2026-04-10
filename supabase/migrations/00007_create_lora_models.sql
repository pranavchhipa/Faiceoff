create table public.creator_lora_models (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  replicate_model_id text,
  training_status text not null check (training_status in ('queued', 'training', 'completed', 'failed')) default 'queued',
  training_started_at timestamptz,
  training_completed_at timestamptz,
  sample_images text[] not null default '{}',
  creator_approved boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_lora_models_creator_id on public.creator_lora_models(creator_id);
create index idx_lora_models_training_status on public.creator_lora_models(training_status);

-- RLS
alter table public.creator_lora_models enable row level security;
create policy "Creators can read own lora models" on public.creator_lora_models for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Creators can update own lora models" on public.creator_lora_models for update using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Admins can read all lora models" on public.creator_lora_models for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "Admins can update all lora models" on public.creator_lora_models for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_lora_models_updated
  before update on public.creator_lora_models
  for each row execute function public.handle_updated_at();
