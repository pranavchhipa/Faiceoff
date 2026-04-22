-- ═══════════════════════════════════════════════════════════════════════════
-- webhook_events: raw inbound webhook payloads (audit + replay + dedup)
-- Ref plan Task 19 Step 2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cashfree (and any future provider) retries failed webhook deliveries.
-- We persist the raw payload on arrival, dedup via `(source, idempotency_key)`
-- so a retry is a no-op, and let the nightly reconciliation cron pick up any
-- rows where `processed_at IS NULL` (i.e. the event was received before its
-- target DB row existed — a race condition at high QPS).
--
-- Idempotency key convention: sha256(signature || timestamp) — supplied by
-- the webhook route.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.webhook_events (
  id uuid primary key default extensions.uuid_generate_v4(),
  source text not null check (source in ('cashfree', 'inngest', 'other')),
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  retry_count integer not null default 0,
  unique (source, idempotency_key)
);

create index idx_we_unprocessed
  on public.webhook_events (source, received_at)
  where processed_at is null;

create index idx_we_type
  on public.webhook_events (source, event_type, received_at desc);

alter table public.webhook_events enable row level security;

-- Admins only — webhook bodies can contain PII and payment identifiers.
create policy "Admins read webhook events" on public.webhook_events
  for select using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

comment on table public.webhook_events is
  'Raw inbound webhook payloads (Cashfree, Inngest, ...). Unique on (source, idempotency_key) for dedup. processed_at=null rows are fair game for the reconciliation cron.';
