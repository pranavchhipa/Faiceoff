-- ═══════════════════════════════════════════════════════════════════════════
-- Retire LoRA models — Gemini / Nano Banana Pro pipeline does not require
-- per-creator LoRA training
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.3
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Drops the creator_lora_models table (created in 00007, extended in 00013).
-- CASCADE removes any dependent FKs. The face_anchor_pack columns on
-- creators (added in 00016) are retained — they're used by the Nano Banana
-- Pro multi-reference flow and are not LoRA-specific.
--
-- Storage cleanup NOT in scope: the `lora-training` storage bucket (created
-- in 00014) contains uploaded zip files for LoRA training. Bucket deletion
-- requires the Supabase Storage admin API and must be done manually via the
-- Supabase dashboard (or via a service-role admin client call) — not via
-- SQL migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the table. CASCADE will remove any FKs from other tables.
drop table if exists public.creator_lora_models cascade;

-- Defensive: drop any legacy LoRA columns that may have been added to
-- creators in earlier iterations. These were mentioned in the plan but are
-- not present in the current schema; `if exists` makes this a no-op if so.
alter table public.creators
  drop column if exists lora_replicate_id,
  drop column if exists lora_training_status;

-- NOTE: Storage bucket `lora-training` from 00014 remains. Manual cleanup
-- via Supabase dashboard (or a service-role Storage admin call) is required
-- to delete the bucket and its contents. Not included here because SQL
-- migrations cannot reliably purge storage objects.
