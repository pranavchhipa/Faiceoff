-- ═══════════════════════════════════════════════════════════════════════════
-- Withdrawal + KYC + bank accounts (creator payout infrastructure)
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four schema changes:
--   1. creators          — add pending/earned/withdrawn balance + new kyc_status values
--   2. withdrawal_requests — creator-initiated payout lifecycle
--   3. creator_kyc        — Cashfree KYC state per creator (PAN/Aadhaar/GSTIN/bank)
--   4. creator_bank_accounts — one-or-more bank accounts (only one active)
--
-- ENCRYPTION: PAN and bank account numbers stored as bytea via pgcrypto's
-- pgp_sym_encrypt(). Decryption key is read from env var KYC_ENCRYPTION_KEY
-- from application code — the DB does not hold the key. Aadhaar is NEVER
-- stored in full (only last4 + hash for dedup per UIDAI compliance).
--
-- FINAL STEP: adds FKs from tcs_ledger / tds_ledger → withdrawal_requests
-- (deferred from 00023 since withdrawal_requests did not yet exist).
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for PAN/bank account encryption at rest
create extension if not exists pgcrypto with schema extensions;

-- ── creators: add payout balance columns + new kyc_status vocabulary ─────────
-- The existing kyc_status constraint (from 00002) allowed ('not_started','pending','approved','rejected').
-- Spec requires ('not_started','in_progress','verified','rejected'). We:
--   1. Drop the old check constraint.
--   2. Map old values: pending → in_progress, approved → verified.
--   3. Add the new check constraint.
-- This preserves existing creator rows without manual data fixup.

alter table public.creators
  add column pending_balance_paise integer not null default 0,
  add column lifetime_earned_gross_paise integer not null default 0,
  add column lifetime_withdrawn_net_paise integer not null default 0;

alter table public.creators drop constraint if exists creators_kyc_status_check;

update public.creators set kyc_status = 'in_progress' where kyc_status = 'pending';
update public.creators set kyc_status = 'verified'    where kyc_status = 'approved';

alter table public.creators
  add constraint creators_kyc_status_check
  check (kyc_status in ('not_started', 'in_progress', 'verified', 'rejected'));

-- ── withdrawal_requests: creator payout lifecycle ───────────────────────────
create table public.withdrawal_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id),

  gross_paise integer not null,
  tcs_paise integer not null,
  tds_paise integer not null,
  gst_output_paise integer not null,
  net_paise integer not null,

  status text not null check (status in (
    'requested', 'kyc_check', 'deductions_applied', 'processing', 'success', 'failed', 'cancelled'
  )) default 'requested',
  failure_reason text,

  -- Bank snapshot for audit (in case creator edits later)
  bank_account_number_masked text not null,  -- last 4 digits only
  bank_ifsc text not null,
  bank_name text not null,

  -- Cashfree
  cf_transfer_id text unique,
  cf_utr text,                     -- UTR number from bank
  cf_mode text,                    -- IMPS / NEFT

  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wr_creator on public.withdrawal_requests(creator_id, created_at desc);
create index idx_wr_status on public.withdrawal_requests(status);
create index idx_wr_cf on public.withdrawal_requests(cf_transfer_id);

alter table public.withdrawal_requests enable row level security;
create policy "Creators read own withdrawals" on public.withdrawal_requests
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Creators insert own withdrawals" on public.withdrawal_requests
  for insert with check (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all withdrawals" on public.withdrawal_requests
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );
create policy "Admins update all withdrawals" on public.withdrawal_requests
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_withdrawal_requests_updated
  before update on public.withdrawal_requests
  for each row execute function public.handle_updated_at();

-- ── creator_kyc: Cashfree KYC state per creator ─────────────────────────────
create table public.creator_kyc (
  creator_id uuid primary key references public.creators(id) on delete cascade,

  -- PAN (encrypted at rest via pgp_sym_encrypt; key is env KYC_ENCRYPTION_KEY in application code)
  pan_number_encrypted bytea,
  pan_name text,
  pan_verified_at timestamptz,
  pan_verification_status text check (pan_verification_status in (
    'pending', 'verified', 'mismatch', 'failed'
  )),

  -- Aadhaar: UIDAI compliance forbids storing full number. We keep last 4 +
  -- a salted hash for dedup/lookup only.
  aadhaar_last4 text,
  aadhaar_hash text unique,
  aadhaar_verified_at timestamptz,

  -- GSTIN (optional — affects whether GST output is deducted at withdrawal)
  gstin text,
  gstin_verified_at timestamptz,
  is_gstin_registered boolean not null default false,

  -- Cashfree beneficiary (creator-level; individual bank accounts in creator_bank_accounts)
  cf_beneficiary_id text unique,

  -- Aggregate state machine
  status text not null check (status in (
    'not_started', 'pan_pending', 'aadhaar_pending', 'bank_pending', 'verified', 'rejected'
  )) default 'not_started',

  rejected_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_kyc enable row level security;
create policy "Creators read own KYC" on public.creator_kyc
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all KYC" on public.creator_kyc
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_creator_kyc_updated
  before update on public.creator_kyc
  for each row execute function public.handle_updated_at();

-- ── creator_bank_accounts: one or more per creator (only one active) ────────
create table public.creator_bank_accounts (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,

  -- Account number encrypted at rest (pgp_sym_encrypt; key in env KYC_ENCRYPTION_KEY)
  account_number_encrypted bytea not null,
  account_number_last4 text not null,
  ifsc text not null,
  bank_name text not null,
  account_holder_name text not null,

  -- Penny-drop verification via Cashfree
  penny_drop_verified_at timestamptz,
  penny_drop_verified_name text,   -- name returned by bank
  name_match_score numeric(5,2),

  is_active boolean not null default false,
  cf_beneficiary_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cba_creator on public.creator_bank_accounts(creator_id);
create unique index uniq_active_bank_per_creator
  on public.creator_bank_accounts(creator_id) where is_active = true;

alter table public.creator_bank_accounts enable row level security;
create policy "Creators read own bank accounts" on public.creator_bank_accounts
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Creators manage own bank accounts" on public.creator_bank_accounts
  for all using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all bank accounts" on public.creator_bank_accounts
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_creator_bank_accounts_updated
  before update on public.creator_bank_accounts
  for each row execute function public.handle_updated_at();

-- ── Deferred FKs from 00023: tax ledgers → withdrawal_requests ──────────────
alter table public.tcs_ledger
  add constraint tcs_ledger_withdrawal_request_id_fkey
  foreign key (withdrawal_request_id) references public.withdrawal_requests(id);

alter table public.tds_ledger
  add constraint tds_ledger_withdrawal_request_id_fkey
  foreign key (withdrawal_request_id) references public.withdrawal_requests(id);

-- ── Comments ────────────────────────────────────────────────────────────────
comment on column public.creator_kyc.pan_number_encrypted is
  'PAN stored as pgp_sym_encrypt() bytea. Decryption via pgp_sym_decrypt(col, current_setting(''app.kyc_key'')) in server-side code with KYC_ENCRYPTION_KEY env var.';
comment on column public.creator_kyc.aadhaar_last4 is
  'Last 4 digits of Aadhaar only. Full Aadhaar never stored (UIDAI compliance).';
comment on column public.creator_kyc.aadhaar_hash is
  'Salted hash of full Aadhaar for dedup/lookup. UNIQUE. Computed in application code with KYC_ENCRYPTION_KEY.';
comment on column public.creator_bank_accounts.account_number_encrypted is
  'Bank account number stored as pgp_sym_encrypt() bytea. Decryption via KYC_ENCRYPTION_KEY env var in application code.';
comment on table public.withdrawal_requests is
  'Creator-initiated withdrawal lifecycle. Min gross_paise: 50000 (₹500). Transitions requested → kyc_check → deductions_applied → processing → success/failed via Cashfree Payouts webhook.';
comment on table public.creator_kyc is
  'Cashfree KYC aggregate state per creator. PAN + Aadhaar + optional GSTIN + bank (via creator_bank_accounts). Gates withdrawal.';
comment on table public.creator_bank_accounts is
  'Creator bank accounts. Only one active per creator (uniq_active_bank_per_creator partial unique index). Penny-drop via Cashfree verifies account holder name.';
