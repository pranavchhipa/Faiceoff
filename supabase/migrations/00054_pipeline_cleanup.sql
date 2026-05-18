-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00054 — Pipeline cleanup + Phase 5/6 infrastructure
--
-- 1. Drop confirmed-dead columns from public.generations (Phase 5.1):
--    - base_image_url     (00016, never populated by Gemini pipeline)
--    - license_request_id (00025/00028, never populated by current flow —
--      license_requests table itself stays, only the FK column on generations
--      is dead; escrow_ledger.license_request_id etc. are UNTOUCHED)
--    - slot_number        (00028, never populated)
--
--    NOT dropped (still live, despite plan listing them as drop targets):
--    - delivery_url           — actively read by src/lib/vault/vault-service.ts
--      list/single queries. Dropping would break vault listing for every brand.
--    - replicate_prediction_id — actively referenced by the daily cron
--      /api/cron/poll-replicate (vercel.json line 17) and the Replicate
--      webhook receiver. Dropping would silently break the legacy Replicate
--      fallback flow that's still wired to production.
--    Removal of those two requires first migrating off the dependent code
--    paths — flagged in handoff for follow-up.
--
--    Kept and now being written:
--    - upscaled_url           (Phase 3.1 — already in use)
--    - quality_scores         (Phase 6e — text_fidelity score on Stage 2 path)
--    - generation_attempts    (Phase 5.4 — incremented per inline retry)
--    - provider_prediction_id (Phase 5.4 — Gemini response id when SDK exposes it)
--
-- 2. Create public.generation_costs (Phase 5.3) — per-call cost ledger so
--    the admin dashboard can compute margin per generation.
--
-- 3. Create public.pill_suggestions_cache (Phase 6a/6b) — SHA256-keyed
--    cache for the vision-call suggestions on uploaded product images.
--
-- 4. Add public.generations.ocr_validation_result jsonb + stage2_triggered_by
--    (Phase 6e) — track post-gen OCR vs pack_text drift and which trigger
--    fired Stage 2 refinement.
--
-- All changes are idempotent (IF EXISTS / IF NOT EXISTS) so re-running on
-- a partially-applied DB is safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop dead columns from generations (Phase 5.1) ────────────────────────
alter table public.generations
  drop column if exists base_image_url,
  drop column if exists license_request_id,
  drop column if exists slot_number;

-- ── 2. generation_costs ledger (Phase 5.3) ───────────────────────────────────
create table if not exists public.generation_costs (
  id uuid primary key default extensions.uuid_generate_v4(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openrouter', 'hive', 'replicate')),
  call_type text not null,
  prompt_tokens integer,
  completion_tokens integer,
  -- BIGINT is overflow-safe — INTEGER caps at ~$2147 lifetime which is
  -- comically low for a money column.
  cost_usd_micros bigint,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_gen_costs_generation_id
  on public.generation_costs(generation_id);
create index if not exists idx_gen_costs_provider_date
  on public.generation_costs(provider, created_at);

-- Server-side inserts only — block direct client access.
alter table public.generation_costs enable row level security;
create policy "service role only" on public.generation_costs
  for all using (false);

comment on table public.generation_costs is
  'Per-call cost ledger for the image-generation pipeline. Populated by '
  'trackCost() in src/lib/observability/cost-tracker.ts. Used to compute '
  'margin per generation in the admin dashboard.';

-- ── 3. pill_suggestions_cache (Phase 6a/6b) ─────────────────────────────────
create table if not exists public.pill_suggestions_cache (
  -- SHA256 hex digest of the product image bytes.
  image_hash text primary key,
  suggestions jsonb not null,
  created_at timestamptz not null default now()
);

-- (No TTL job here — manual cleanup or a future cron. 30-day staleness is
-- the agreed-upon convention.)

alter table public.pill_suggestions_cache enable row level security;
create policy "service role only" on public.pill_suggestions_cache
  for all using (false);

comment on table public.pill_suggestions_cache is
  'SHA256-keyed cache of Phase 6a/6b vision-call output (pill suggestions + '
  'pack_text extraction + label bbox). 30-day TTL convention; manual cleanup '
  'until a cron is added.';

-- ── 4. OCR validation result + Stage 2 trigger reason (Phase 6e) ─────────────
alter table public.generations
  add column if not exists ocr_validation_result jsonb,
  add column if not exists stage2_triggered_by text;

-- Use DO block so we can drop the existing constraint (if any) before
-- recreating it, since `alter table ... add constraint if not exists` does
-- not exist in Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_stage2_triggered_by_check'
  ) then
    alter table public.generations
      add constraint generations_stage2_triggered_by_check
      check (
        stage2_triggered_by in ('manual', 'ocr_fail', 'dense_label')
        or stage2_triggered_by is null
      );
  end if;
end $$;

comment on column public.generations.ocr_validation_result is
  'JSON snapshot of post-generation OCR vs pack_text comparison: '
  '{ extracted: string, drift: number 0..1, confidence: number 0..1 }.';
comment on column public.generations.stage2_triggered_by is
  'Why Stage 2 refinement ran. NULL if Stage 2 was skipped. '
  'Values: manual (high_detail_mode), ocr_fail (drift > 0.3), dense_label.';
