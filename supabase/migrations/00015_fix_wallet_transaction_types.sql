-- Extend wallet_transactions.type to allow the two types the generation
-- pipeline actually writes on approval settlement.
--
-- Migration 00011 shipped with a CHECK constraint that only listed
-- {topup, escrow_lock, escrow_release, payout, refund, commission}, but
-- src/inngest/functions/generation/generation-pipeline.ts inserts rows with
-- type='generation_earning' (creator credit) and type='generation_spend'
-- (brand debit). Those inserts were being rejected by Postgres, causing
-- the approval settlement to silently fail — creator showed "Approved"
-- but neither wallet moved.

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in (
    'topup',
    'escrow_lock',
    'escrow_release',
    'payout',
    'refund',
    'commission',
    'generation_earning',
    'generation_spend'
  ));

-- Idempotency guard for retries.
--
-- The Inngest finalize step updates campaigns + inserts two
-- wallet_transactions. If any step throws, Inngest retries the ENTIRE
-- step body — which would otherwise re-insert the wallet rows and
-- double-credit/debit. A partial-unique index on (user_id, reference_id,
-- type) stops that at the DB level. Scoped to reference_type='generation'
-- so it doesn't affect topups / refunds / other kinds of transactions.
create unique index if not exists
  idx_wallet_transactions_unique_generation_settlement
  on public.wallet_transactions (user_id, reference_id, type)
  where reference_type = 'generation';
