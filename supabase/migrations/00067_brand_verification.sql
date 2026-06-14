-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00067: Brand manual verification (mirrors creator verification 00065)
--
-- Brands previously got brands.is_verified = true AUTOMATICALLY the moment they
-- filled the onboarding form (just a company name; no review). That was security
-- theatre. Now a brand submits GST + PAN + company details during onboarding and
-- the request lands PENDING in the Control Centre, where an operator manually
-- verifies and approves / rejects — exactly like creators.
--
-- On approval: brands.is_verified = true (unblocks collaborating with creators).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PAN on the brand row (GST already exists on brands).
alter table public.brands
  add column if not exists pan_number text;

-- 2. One verification request per brand (mirror of creator_verifications).
create table if not exists public.brand_verifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null unique references public.brands(id) on delete cascade,

  status text not null default 'not_started'
    check (status in ('not_started', 'pending', 'verified', 'rejected')),

  -- Typed business details the operator verifies manually (no doc upload).
  gst_number        text,
  pan_number        text,
  company_name      text,
  legal_name        text,   -- authorised signatory / legal entity name
  registered_address text,

  submitted_at  timestamptz,
  reviewed_by   text,        -- CC operator handle
  reviewed_at   timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_verifications_status
  on public.brand_verifications (status, submitted_at desc);

-- RLS: all reads/writes happen server-side with the service role key
-- (createAdminClient bypasses RLS). Enable RLS with no public policies so
-- anon/auth clients can't touch it directly — same as creator_verifications.
alter table public.brand_verifications enable row level security;

-- 3. Reset every existing brand to UNVERIFIED. Brands were auto-verified before;
--    the operator must now manually verify each one through the new flow.
update public.brands set is_verified = false;
