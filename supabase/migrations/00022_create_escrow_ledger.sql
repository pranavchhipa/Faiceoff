-- ═══════════════════════════════════════════════════════════════════════════
-- Escrow + platform revenue ledgers (append-only)
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- escrow_ledger          — every nodal-account movement tied to a license
-- platform_revenue_ledger — commission + GST-on-commission recognition
--
-- Both are APPEND-ONLY: reversals are inserted as new rows (type='reversal'
-- or opposite-direction amount). Never UPDATE. This gives a dispute-proof
-- audit trail and matches Cashfree's own ledger semantics.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── escrow_ledger: creator-held money lifecycle ──────────────────────────────
create table public.escrow_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid not null references public.license_requests(id),
  creator_id uuid references public.creators(id),
  brand_id uuid not null references public.brands(id),

  type text not null check (type in (
    'lock',               -- on contract accept (base_paise → LOCKED)
    'release_per_image',  -- per approved image (LOCKED → CREATOR_PENDING)
    'refund_to_brand',    -- unused slots at expiry (LOCKED → BRAND credits)
    'dispute_hold',       -- freeze during dispute
    'dispute_release',
    'withdraw_hold',      -- creator hit withdraw (CREATOR_PENDING → WITHDRAW_HELD)
    'withdraw_paid',      -- Cashfree payout SUCCESS (WITHDRAW_HELD → PAID_OUT)
    'withdraw_reversed'   -- Cashfree payout FAILED (WITHDRAW_HELD → CREATOR_PENDING)
  )),
  amount_paise integer not null,

  -- Derived state AFTER this entry (running totals for the license_request)
  creator_locked_paise integer not null,
  creator_pending_paise integer not null,
  brand_refundable_paise integer not null,

  reference_type text,
  reference_id uuid,
  description text,

  created_at timestamptz not null default now()
);

create index idx_el_lr on public.escrow_ledger(license_request_id, created_at);
create index idx_el_creator on public.escrow_ledger(creator_id, created_at desc);
create index idx_el_brand on public.escrow_ledger(brand_id, created_at desc);
create index idx_el_type on public.escrow_ledger(type);

alter table public.escrow_ledger enable row level security;
create policy "Creators read own escrow rows" on public.escrow_ledger
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );
create policy "Brands read own escrow rows" on public.escrow_ledger
  for select using (
    brand_id in (select id from public.brands where user_id = auth.uid())
  );
create policy "Admins read all escrow rows" on public.escrow_ledger
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ── platform_revenue_ledger: commission + GST recognition ────────────────────
create table public.platform_revenue_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid references public.license_requests(id),
  type text not null check (type in (
    'commission',
    'gst_on_commission',
    'commission_reversal',
    'gst_reversal',
    'adjustment'
  )),
  amount_paise integer not null,

  accounting_period date not null,  -- first-of-month date for GSTR filing grouping
  description text,

  created_at timestamptz not null default now()
);

create index idx_prl_period on public.platform_revenue_ledger(accounting_period);
create index idx_prl_lr on public.platform_revenue_ledger(license_request_id);
create index idx_prl_type on public.platform_revenue_ledger(type);

alter table public.platform_revenue_ledger enable row level security;
-- Server-only table — no brand/creator read access. Admin read only.
create policy "Admins read platform revenue" on public.platform_revenue_ledger
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

comment on table public.escrow_ledger is
  'Append-only ledger of every money movement inside the Cashfree Nodal account tied to a license. Running totals (creator_locked_paise, creator_pending_paise, brand_refundable_paise) carried forward on each row for fast state reads.';
comment on table public.platform_revenue_ledger is
  'Append-only commission + GST-on-commission recognition. accounting_period is first-of-month for GSTR-1/3B filing rollups. Server-only (no brand/creator RLS policies).';
