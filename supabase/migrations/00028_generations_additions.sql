-- ═══════════════════════════════════════════════════════════════════════════
-- Generations additions for per-image licensing + retry policy
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds four columns to public.generations that Chunk D will need to drive the
-- per-image approval + retry-credit flow:
--   license_request_id  — which license this generation consumes a slot from
--   slot_number         — 1-based position within the license's image_quota
--   retry_count         — 0 = first attempt; 1..3 = free retries; 4+ = paid
--   is_free_retry       — true if this row was a no-cost retry (budget charged)
--
-- Retry policy (decision log D4): 3 free retries per image slot; the 4th
-- attempt deducts ~5 credits from the brand. The procedures added in 00029
-- do NOT touch retry_count — that belongs to Chunk D's image pipeline. These
-- columns exist here so the schema is ready when that chunk lands.
--
-- NULL semantics:
--   - license_request_id NULL for legacy rows (pre-Chunk C campaigns)
--   - slot_number NULL for legacy rows; new rows are expected to set 1..quota
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.generations
  add column if not exists license_request_id uuid
    references public.license_requests(id) on delete set null,
  add column if not exists slot_number integer,
  add column if not exists retry_count integer not null default 0,
  add column if not exists is_free_retry boolean not null default false;

-- Lookup pattern: "all generations for license X, ordered by slot"
create index if not exists idx_gen_license_slot
  on public.generations(license_request_id, slot_number)
  where license_request_id is not null;

-- Lookup pattern: "how many retries has this slot had?"
create index if not exists idx_gen_license_slot_retry
  on public.generations(license_request_id, slot_number, retry_count)
  where license_request_id is not null;

comment on column public.generations.license_request_id is
  'FK to license_requests. NULL for legacy pre-2026-04 campaign rows. Set for all new generations under the licensing flow.';
comment on column public.generations.slot_number is
  '1-based slot within the license''s image_quota (1..quota). NULL for legacy rows.';
comment on column public.generations.retry_count is
  'Number of retries for this slot. 0 = first attempt (free); 1..3 are free retries (policy D4); 4+ are paid (~5 credits each).';
comment on column public.generations.is_free_retry is
  'True iff this generation row was a no-cost retry. Used by the credit debit side-effect in the image pipeline.';
