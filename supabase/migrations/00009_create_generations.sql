create table public.generations (
  id uuid primary key default extensions.uuid_generate_v4(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  structured_brief jsonb not null,
  assembled_prompt text,
  replicate_prediction_id text,
  image_url text,
  delivery_url text,
  status text not null check (status in (
    'draft', 'compliance_check', 'generating', 'output_check',
    'ready_for_approval', 'approved', 'rejected', 'failed'
  )) default 'draft',
  compliance_result jsonb,
  cost_paise integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_generations_campaign_id on public.generations(campaign_id);
create index idx_generations_status on public.generations(status);
create index idx_generations_creator_id on public.generations(creator_id);
create index idx_generations_brand_id on public.generations(brand_id);

-- RLS
alter table public.generations enable row level security;
create policy "Brands can read own generations" on public.generations for select using (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Brands can insert own generations" on public.generations for insert with check (
  brand_id in (select id from public.brands where user_id = auth.uid())
);
create policy "Creators can read own generations" on public.generations for select using (
  creator_id in (select id from public.creators where user_id = auth.uid())
);
create policy "Admins can read all generations" on public.generations for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_generations_updated
  before update on public.generations
  for each row execute function public.handle_updated_at();
