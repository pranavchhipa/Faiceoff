-- Bank account details for manual payouts.
-- Stored encrypted at rest; KYC_ENCRYPTION_KEY env var already exists.

alter table public.creators
  add column bank_account_holder_name text,
  add column bank_account_number_encrypted text,  -- AES-256-GCM
  add column bank_ifsc text,
  add column bank_added_at timestamptz;

comment on column public.creators.bank_account_number_encrypted is
  'AES-256-GCM ciphertext using KYC_ENCRYPTION_KEY env var. Decrypt only in admin payout flows.';
