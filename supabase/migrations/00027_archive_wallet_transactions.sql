-- ═══════════════════════════════════════════════════════════════════════════
-- Archive wallet_transactions — replaced by specialized ledgers
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.3
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Renames public.wallet_transactions → public.wallet_transactions_archive.
-- Retained for historical lookups / audits; never written to again. New
-- money movement writes to:
--   credit_transactions        — brand credit lifecycle (00020)
--   escrow_ledger              — creator-held escrow (00022)
--   platform_revenue_ledger    — commission + GST recognition (00022)
--   gst_output_ledger          — GST output collected (00023)
--   tcs_ledger / tds_ledger    — withdrawal deductions (00023)
--
-- Archive remains read-only via existing admin + user select policies
-- (which are renamed below to match the new table name). No insert/update/
-- delete policies exist, so the table is effectively sealed against writes
-- from the client side. Service role writes are no longer performed (all
-- new code targets the specialized ledgers).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Rename the table ───────────────────────────────────────────────────────
alter table public.wallet_transactions rename to wallet_transactions_archive;

-- ── Rename indexes ─────────────────────────────────────────────────────────
alter index if exists idx_wallet_transactions_user_id_created
  rename to idx_wallet_transactions_archive_user_id_created;
alter index if exists idx_wallet_transactions_reference
  rename to idx_wallet_transactions_archive_reference;
alter index if exists idx_wallet_transactions_unique_generation_settlement
  rename to idx_wallet_transactions_archive_unique_generation_settlement;

-- ── Rename RLS policies ────────────────────────────────────────────────────
alter policy "Users can read own transactions"
  on public.wallet_transactions_archive rename to "Users can read own archived transactions";
alter policy "Admins can read all transactions"
  on public.wallet_transactions_archive rename to "Admins can read all archived transactions";

-- ── Archival comment ───────────────────────────────────────────────────────
comment on table public.wallet_transactions_archive is
  'Historical wallet transactions (pre-2026-04 revamp). Read-only archive. '
  'Replaced by credit_transactions (00020), escrow_ledger + '
  'platform_revenue_ledger (00022), and gst_output/tcs/tds ledgers (00023). '
  'No new writes — all money movement goes through the specialized ledgers.';
