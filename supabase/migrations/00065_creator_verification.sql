-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00065: Creator manual verification (golden tick)
--
-- After a creator finishes onboarding they land on the dashboard and can
-- request verification: upload Aadhaar + PAN, confirm they follow @faiceoff
-- on Instagram. The request lands in the Control Centre where an operator
-- manually reviews the documents and approves / rejects.
--
-- On approval: creators.is_verified = true (drives the golden tick) AND
-- creators.kyc_status = 'verified' (unblocks payouts).
--
-- The exact verification rules are still being finalised — this is the
-- scaffold (table + flag + bucket) the flow runs on.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Golden-tick flag on the creator row.
alter table public.creators
  add column if not exists is_verified boolean not null default false;

comment on column public.creators.is_verified is
  'Manually verified by a Control Centre operator (Aadhaar + PAN + follows @faiceoff). Drives the golden verified tick on profile + discovery. Separate from kyc_status (which gates payouts) but set together on approval.';

-- 2. One verification request per creator.
create table if not exists public.creator_verifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null unique references public.creators(id) on delete cascade,

  status text not null default 'not_started'
    check (status in ('not_started', 'pending', 'verified', 'rejected')),

  -- Document references in the private `kyc-documents` bucket.
  aadhaar_path text,
  pan_path text,
  -- Self-declared "I follow @faiceoff" — operator spot-checks during review.
  instagram_followed boolean not null default false,

  submitted_at  timestamptz,
  reviewed_by   text,          -- CC operator handle
  reviewed_at   timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_verifications_status
  on public.creator_verifications (status, submitted_at desc);

-- 3. Private bucket for KYC documents (Aadhaar / PAN). Server-side access
--    only, via short-lived signed URLs — no public reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- RLS: all reads/writes happen server-side with the service role key
-- (createAdminClient) which bypasses RLS, mirroring the other private
-- buckets. Enable RLS on the table with no public policies so anon/auth
-- clients can't touch it directly.
alter table public.creator_verifications enable row level security;
