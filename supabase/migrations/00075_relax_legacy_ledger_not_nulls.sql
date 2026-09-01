-- ─────────────────────────────────────────────────────────────────────────────
-- 00075: Relax legacy NOT NULLs on credit_transactions.
--
-- 00020 created the paise-era columns as NOT NULL:
--   amount_paise integer not null, balance_after_paise integer not null
-- 00048 added the credits-era columns (credits, balance_after) but never
-- relaxed the old ones. Every credits-era INSERT (add_credits_for_topup,
-- deduct_credit, grant_collab_credits, dispute/ticket credit grants) omits
-- amount_paise/balance_after_paise entirely — on any database still carrying
-- the 00020 constraints those inserts violate NOT NULL, the enclosing RPC
-- transaction rolls back, and the failure is swallowed by non-fatal catches.
--
-- Idempotent + harmless if the constraints were already dropped by hand.
-- ─────────────────────────────────────────────────────────────────────────────

do $fo75a$
begin
  alter table public.credit_transactions alter column amount_paise drop not null;
exception when others then null;
end $fo75a$;

do $fo75b$
begin
  alter table public.credit_transactions alter column balance_after_paise drop not null;
exception when others then null;
end $fo75b$;

comment on column public.credit_transactions.amount_paise is
  'Paise-era ledger amount (00029 procedures). NULL on credits-era rows (00037+).';
comment on column public.credit_transactions.balance_after_paise is
  'Paise-era running balance. NULL on credits-era rows.';
