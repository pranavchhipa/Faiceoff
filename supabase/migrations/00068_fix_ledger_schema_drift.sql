-- ═══════════════════════════════════════════════════════════════════════════
-- 00068: Fix ledger schema drift (P0 — creators were silently earning ₹0)
--
-- The approval code (src/app/api/approvals/[id]/approve/route.ts and the
-- auto-approve cron) inserts GENERATION-based rows:
--   escrow_ledger:           { creator_id, generation_id, amount_paise, holding_until, type:'release_per_image' }
--   platform_revenue_ledger: { generation_id, amount_paise, gst_paise, source }
-- But the original 00022 schema required license_request_id / brand_id /
-- creator_*_paise running totals (escrow) and type / accounting_period
-- (revenue) — columns the code never sets, and had NO generation_id/gst_paise/
-- source columns. Every insert was REJECTED by Postgres and swallowed by the
-- non-fatal try/catch, so creators never accrued escrow and could never be
-- paid. This migration reshapes both tables to accept the live insert shape.
--
-- Idempotent: safe whether prod is still on 00022 or was hand-patched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── escrow_ledger ──────────────────────────────────────────────────────────
alter table public.escrow_ledger
  add column if not exists generation_id uuid references public.generations(id);
create index if not exists idx_el_generation on public.escrow_ledger(generation_id);

-- Relax the running-total / license columns the generation-based flow omits.
do $$
begin
  alter table public.escrow_ledger alter column license_request_id drop not null;
exception when others then null; end $$;
do $$
begin
  alter table public.escrow_ledger alter column brand_id drop not null;
exception when others then null; end $$;
do $$
begin
  alter table public.escrow_ledger alter column creator_locked_paise drop not null;
exception when others then null; end $$;
do $$
begin
  alter table public.escrow_ledger alter column creator_pending_paise drop not null;
exception when others then null; end $$;
do $$
begin
  alter table public.escrow_ledger alter column brand_refundable_paise drop not null;
exception when others then null; end $$;

-- ── platform_revenue_ledger ────────────────────────────────────────────────
alter table public.platform_revenue_ledger
  add column if not exists generation_id uuid references public.generations(id),
  add column if not exists gst_paise integer,
  add column if not exists source text;
create index if not exists idx_prl_generation on public.platform_revenue_ledger(generation_id);

do $$
begin
  alter table public.platform_revenue_ledger alter column type drop not null;
exception when others then null; end $$;
do $$
begin
  alter table public.platform_revenue_ledger alter column accounting_period drop not null;
exception when others then null; end $$;

-- ── payout double-request guard (P1) ───────────────────────────────────────
-- One open payout request per creator, enforced at the DB so a double-click /
-- retry race can't create a phantom unbacked payout.
create unique index if not exists uniq_open_payout_per_creator
  on public.creator_payouts (creator_id)
  where status in ('requested', 'processing');
