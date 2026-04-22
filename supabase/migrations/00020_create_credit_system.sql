-- ═══════════════════════════════════════════════════════════════════════════
-- Credit system: brand wallet-as-credits model
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Introduces brand credit balance (₹50 / credit) with append-only ledger
-- (credit_transactions) and Cashfree Collect top-up orders (credit_top_ups).
-- Replaces the legacy wallet_transactions model for brand money movement.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── brands: denormalized credit balance (derived from credit_transactions) ──
alter table public.brands
  add column credits_balance_paise integer not null default 0,
  add column credits_reserved_paise integer not null default 0,
  add column lifetime_topup_paise integer not null default 0;

-- ── credit_transactions: append-only ledger ─────────────────────────────────
create table public.credit_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null check (type in (
    'topup', 'reserve', 'release_reserve', 'spend', 'refund', 'bonus', 'adjustment'
  )),
  amount_paise integer not null,
  balance_after_paise integer not null,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index idx_ct_brand_created on public.credit_transactions(brand_id, created_at desc);
create index idx_ct_ref on public.credit_transactions(reference_type, reference_id);

alter table public.credit_transactions enable row level security;
create policy "Brands read own credit transactions" on public.credit_transactions
  for select using (
    brand_id in (select id from public.brands where user_id = auth.uid())
  );
create policy "Admins read all credit transactions" on public.credit_transactions
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ── credit_top_ups: Cashfree Collect order lifecycle ─────────────────────────
create table public.credit_top_ups (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  pack text not null check (pack in ('free_signup', 'small', 'medium', 'large')),
  credits integer not null,
  amount_paise integer not null,
  cf_order_id text unique,
  cf_payment_id text,
  status text not null check (status in (
    'initiated', 'processing', 'success', 'failed', 'expired'
  )) default 'initiated',
  failure_reason text,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ctu_brand on public.credit_top_ups(brand_id, created_at desc);
create index idx_ctu_cf on public.credit_top_ups(cf_order_id);

alter table public.credit_top_ups enable row level security;
create policy "Brands read own top-ups" on public.credit_top_ups
  for select using (
    brand_id in (select id from public.brands where user_id = auth.uid())
  );
create policy "Admins read all top-ups" on public.credit_top_ups
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create trigger on_credit_top_ups_updated
  before update on public.credit_top_ups
  for each row execute function public.handle_updated_at();

comment on table public.credit_transactions is
  'Append-only brand credit ledger. Every row represents a delta against credits_balance_paise. Never UPDATE — reversals inserted as new rows.';
comment on table public.credit_top_ups is
  'Cashfree Collect order lifecycle for brand credit purchases. Transitions initiated → processing → success/failed/expired via webhook.';
