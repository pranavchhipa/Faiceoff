-- ═══════════════════════════════════════════════════════════════════════════
-- Tax ledgers: GST output, TCS, TDS (append-only)
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three separate tables (not one polymorphic table) for compliance clarity:
--   gst_output_ledger — GST collected by platform (on commission + on creator service)
--   tcs_ledger        — Sec 52 CGST 1% deducted at creator withdrawal
--   tds_ledger        — Sec 194-O IT Act 1% deducted at creator withdrawal
--
-- All append-only. accounting_period is first-of-month for filing rollups:
--   GSTR-1 / GSTR-3B  — GST output
--   GSTR-8            — TCS
--   Form 26Q / TRACES — TDS (Form 16A issued quarterly to creators)
--
-- Note: tcs_ledger and tds_ledger carry a withdrawal_request_id column. The FK
-- constraint is added in 00024 after withdrawal_requests is created (forward
-- reference avoided by deferring the constraint).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── gst_output_ledger ────────────────────────────────────────────────────────
create table public.gst_output_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  reference_type text not null,  -- 'license_request' | 'withdrawal_request'
  reference_id uuid not null,
  creator_id uuid references public.creators(id),
  brand_id uuid references public.brands(id),

  type text not null check (type in (
    'output_on_commission',       -- GST charged to brand on platform commission
    'output_on_creator_service',  -- GST on creator's service (platform remits on behalf)
    'reversal'
  )),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 18.00,
  tax_paise integer not null,

  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,       -- GSTR challan #

  created_at timestamptz not null default now()
);

create index idx_gst_period on public.gst_output_ledger(accounting_period);
create index idx_gst_ref on public.gst_output_ledger(reference_type, reference_id);
create index idx_gst_creator on public.gst_output_ledger(creator_id);
create index idx_gst_brand on public.gst_output_ledger(brand_id);

alter table public.gst_output_ledger enable row level security;
create policy "Admins read GST output ledger" on public.gst_output_ledger
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ── tcs_ledger ───────────────────────────────────────────────────────────────
create table public.tcs_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  withdrawal_request_id uuid not null,  -- FK added in 00024 after withdrawal_requests exists
  creator_id uuid not null references public.creators(id),

  type text not null check (type in ('deducted_at_withdrawal', 'reversal')),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 1.00,
  tax_paise integer not null,

  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,    -- GSTR-8 challan #

  created_at timestamptz not null default now()
);

create index idx_tcs_period on public.tcs_ledger(accounting_period);
create index idx_tcs_creator on public.tcs_ledger(creator_id);
create index idx_tcs_withdrawal on public.tcs_ledger(withdrawal_request_id);

alter table public.tcs_ledger enable row level security;
create policy "Creators read own TCS rows" on public.tcs_ledger
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all TCS rows" on public.tcs_ledger
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ── tds_ledger ───────────────────────────────────────────────────────────────
create table public.tds_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  withdrawal_request_id uuid not null,  -- FK added in 00024 after withdrawal_requests exists
  creator_id uuid not null references public.creators(id),

  type text not null check (type in ('deducted_at_withdrawal', 'reversal')),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 1.00,
  tax_paise integer not null,

  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,    -- Form 26Q / TRACES challan #
  form_16a_issued_at timestamptz,

  created_at timestamptz not null default now()
);

create index idx_tds_period on public.tds_ledger(accounting_period);
create index idx_tds_creator on public.tds_ledger(creator_id);
create index idx_tds_withdrawal on public.tds_ledger(withdrawal_request_id);

alter table public.tds_ledger enable row level security;
create policy "Creators read own TDS rows" on public.tds_ledger
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Admins read all TDS rows" on public.tds_ledger
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

comment on table public.gst_output_ledger is
  'GST collected by platform. Two flavours: output_on_commission (GST charged to brand on platform commission) and output_on_creator_service (GST remitted on creator''s behalf). Filing: GSTR-1 / GSTR-3B monthly.';
comment on table public.tcs_ledger is
  'Sec 52 CGST 1% TCS deducted at creator withdrawal. Filing: GSTR-8 monthly. FK to withdrawal_requests added in 00024.';
comment on table public.tds_ledger is
  'Sec 194-O Income Tax 1% TDS deducted at creator withdrawal. Filing: Form 26Q / TRACES. Form 16A issued to creators quarterly. FK to withdrawal_requests added in 00024.';
