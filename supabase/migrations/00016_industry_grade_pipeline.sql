-- ═══════════════════════════════════════════════════════════════════════════
-- Industry-grade generation pipeline: Nano Banana Pro + quality gate + upscaler
-- Ref spec: docs/superpowers/specs/2026-04-18-industry-grade-generation-pipeline-design.md
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This migration is ADDITIVE ONLY — no destructive changes, no column renames,
-- no data migrations. Safe to run on production. Idempotent via IF NOT EXISTS.
--
-- Changes summary:
--   generations: +6 columns (base/upscaled URLs, quality scores, attempts,
--                provider prediction id, pipeline version)
--   creators:   +2 columns (face anchor pack array, anchor generated timestamp)
--   indexes:    +2 (quality scores gin, retry monitoring partial)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── generations: pipeline v2 output + telemetry ──────────────────────────────
alter table public.generations
  add column if not exists base_image_url text,
  add column if not exists upscaled_url text,
  add column if not exists quality_scores jsonb,
  add column if not exists generation_attempts smallint not null default 1,
  add column if not exists provider_prediction_id text,
  add column if not exists pipeline_version text not null default 'v1';

-- Constrain pipeline_version to known values. Using a CHECK rather than a PG
-- enum so future versions can be added without DDL pain (same pattern the
-- project already uses for generations.status).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'generations_pipeline_version_check'
      and conrelid = 'public.generations'::regclass
  ) then
    alter table public.generations
      add constraint generations_pipeline_version_check
      check (pipeline_version in ('v1', 'v2', 'v3'));
  end if;
end $$;

comment on column public.generations.base_image_url is
  'Stage 1 provider output (Nano Banana Pro / Kontext Max) before upscale';
comment on column public.generations.upscaled_url is
  'Stage 3 Clarity Upscaler 2x output; NULL if skipped because native resolution was already >= 2048px';
comment on column public.generations.quality_scores is
  'JSON: { clip: number, face: number, aesthetic: number, passed: boolean, failedOn: string[] | null }';
comment on column public.generations.generation_attempts is
  'Stage 1 inference attempts made (1-3, including quality-gate retries)';
comment on column public.generations.provider_prediction_id is
  'Google AI operation id (v2) or Replicate prediction id (v1/v3) — provider-agnostic audit trail';
comment on column public.generations.pipeline_version is
  'v1=Flux Dev legacy (rollback only), v2=Nano Banana Pro (default), v3=Kontext Max (edge-case fallback)';

-- ── creators: face anchor pack cache (Stage 0) ───────────────────────────────
alter table public.creators
  add column if not exists face_anchor_pack jsonb,
  add column if not exists face_anchor_generated_at timestamptz;

comment on column public.creators.face_anchor_pack is
  'Array of R2 public URLs: ["https://.../neutral.png", "https://.../smile.png", ...]. Generated once per LoRA training completion by LoRA-driven Stage 0; used as multi-reference input for Nano Banana Pro on every generation. Invalidated when latest creator_lora_models.created_at > face_anchor_generated_at.';
comment on column public.creators.face_anchor_generated_at is
  'Timestamp face_anchor_pack was generated; compared against latest LoRA training to detect staleness.';

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- GIN on quality_scores for analytics: P95 gate pass rates, failure reason
-- breakdown, etc. See runbook monitoring queries.
create index if not exists idx_generations_quality_scores
  on public.generations using gin (quality_scores);

-- Partial index for retry-rate monitoring (only rows that retried)
create index if not exists idx_generations_attempts_high
  on public.generations (created_at)
  where generation_attempts > 1;

-- Index for pipeline version filtering in dashboards
create index if not exists idx_generations_pipeline_version
  on public.generations (pipeline_version);
