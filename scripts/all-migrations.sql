-- ============================================================
-- Faiceoff: Combined Database Migrations (00001 through 00012)
-- ============================================================
-- Paste this entire file into the Supabase Dashboard SQL Editor
-- and run it to set up the complete database schema.
--
-- Migrations are applied in order. Each section corresponds to
-- one migration file from supabase/migrations/.
-- ============================================================


-- ═══════════════════════════════════════
-- Migration: 00001_create_users.sql
-- ═══════════════════════════════════════

-- Enable required extensions
-- NOTE: pgvector will be enabled later when compliance vectors are needed
-- (enable it from Supabase Dashboard > Database > Extensions > vector)
create extension if not exists "uuid-ossp" with schema extensions;

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  phone text,
  role text not null check (role in ('creator', 'brand', 'admin')) default 'creator',
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;
create policy "Users can read own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Admins can read all users" on public.users for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Updated at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_users_updated
  before update on public.users
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════
-- Migration: 00002_create_creators.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00003_create_brands.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00004_create_categories.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00005_create_compliance_vectors.sql
-- ═══════════════════════════════════════

create table public.creator_compliance_vectors (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  blocked_concept text not null,
  embedding jsonb not null, -- will migrate to vector(1536) when pgvector is enabled
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_compliance_vectors_creator_id on public.creator_compliance_vectors(creator_id);

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


-- ═══════════════════════════════════════
-- Migration: 00006_create_reference_photos.sql
-- ═══════════════════════════════════════

create table public.creator_reference_photos (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  storage_path text not null,
  face_embedding jsonb, -- will migrate to vector(512) when pgvector is enabled
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


-- ═══════════════════════════════════════
-- Migration: 00007_create_lora_models.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00008_create_campaigns.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00009_create_generations.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00010_create_approvals.sql
-- ═══════════════════════════════════════

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


-- ═══════════════════════════════════════
-- Migration: 00011_create_wallet.sql
-- ═══════════════════════════════════════

-- Wallet transactions
create table public.wallet_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'topup', 'escrow_lock', 'escrow_release', 'payout', 'refund', 'commission'
  )),
  amount_paise integer not null,
  direction text not null check (direction in ('credit', 'debit')),
  reference_id text,
  reference_type text,
  balance_after_paise integer not null,
  description text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_wallet_transactions_user_id_created on public.wallet_transactions(user_id, created_at desc);
create index idx_wallet_transactions_reference on public.wallet_transactions(reference_id) where reference_id is not null;

-- RLS
alter table public.wallet_transactions enable row level security;
create policy "Users can read own transactions" on public.wallet_transactions for select using (user_id = auth.uid());
create policy "Admins can read all transactions" on public.wallet_transactions for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Disputes
create table public.disputes (
  id uuid primary key default extensions.uuid_generate_v4(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  raised_by uuid not null references public.users(id) on delete cascade,
  reason text not null,
  status text not null check (status in (
    'open', 'investigating', 'resolved_refund', 'resolved_no_action', 'closed'
  )) default 'open',
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_disputes_generation_id on public.disputes(generation_id);
create index idx_disputes_raised_by on public.disputes(raised_by);
create index idx_disputes_status on public.disputes(status);

-- RLS
alter table public.disputes enable row level security;
create policy "Users can read disputes they raised" on public.disputes for select using (raised_by = auth.uid());
create policy "Users can read disputes on their generations" on public.disputes for select using (
  generation_id in (
    select g.id from public.generations g
    join public.creators c on c.id = g.creator_id
    where c.user_id = auth.uid()
    union
    select g.id from public.generations g
    join public.brands b on b.id = g.brand_id
    where b.user_id = auth.uid()
  )
);
create policy "Users can insert disputes" on public.disputes for insert with check (raised_by = auth.uid());
create policy "Admins can read all disputes" on public.disputes for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "Admins can update all disputes" on public.disputes for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create trigger on_disputes_updated
  before update on public.disputes
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════
-- Migration: 00012_create_audit_log.sql
-- ═══════════════════════════════════════

create table public.audit_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'system', 'admin')),
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_audit_log_actor_id on public.audit_log(actor_id);
create index idx_audit_log_action on public.audit_log(action);
create index idx_audit_log_created_at on public.audit_log(created_at desc);
create index idx_audit_log_resource on public.audit_log(resource_type, resource_id);

-- RLS: append-only table -- no update or delete policies
alter table public.audit_log enable row level security;
create policy "Admins can read audit log" on public.audit_log for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
-- Insert is handled via service role (server-side only), no client insert policy
