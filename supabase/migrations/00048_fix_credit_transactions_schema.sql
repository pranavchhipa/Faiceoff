-- Fix credit_transactions schema mismatch.
--
-- Migration 00020 created credit_transactions with columns:
--   amount_paise (integer) + balance_after_paise (integer)
-- used by the paise-based ledger procedures in 00029.
--
-- Migration 00037 added deduct_credit + add_credits_for_topup RPCs that
-- INSERT into credit_transactions using column names:
--   credits (integer count) + balance_after (integer count)
-- causing "column credits does not exist" errors at runtime.
--
-- Fix: add the missing columns with IF NOT EXISTS guard (idempotent).
-- Legacy rows (paise-based) will have NULL in these new columns — that is
-- correct; NULL = "this row is from the paise-era, no credit count applies".

alter table public.credit_transactions
  add column if not exists credits integer,
  add column if not exists balance_after integer;

comment on column public.credit_transactions.credits is
  'Credit slot count delta (positive=added, negative=spent). NULL on legacy paise-based rows from 00029 procedures.';

comment on column public.credit_transactions.balance_after is
  'Brand credit slot balance after this transaction. NULL on legacy paise-based rows.';
