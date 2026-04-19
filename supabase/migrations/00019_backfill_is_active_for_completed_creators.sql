-- 00019_backfill_is_active_for_completed_creators.sql
--
-- Backfills creators.is_active = true for every creator whose onboarding
-- is already marked complete.
--
-- Why this exists:
--   /api/onboarding/complete used to set `is_active = false` at the end
--   of the flow. The original intent was to keep creators inactive until
--   their LoRA training finished and they'd approved the sample images —
--   but nothing in the codebase ever flipped the flag back to true. The
--   DB default is also `false`, so every creator who ran the complete
--   route ended up invisible to brands (/api/creators, /api/campaigns/create,
--   /api/generations/create all filter by is_active = true).
--
--   The complete + force-complete routes have been fixed to set
--   is_active = true on successful completion. This migration unblocks
--   anyone who completed onboarding before that fix shipped.
--
-- Idempotent: filters on is_active = false so re-running is a no-op.
-- Safe: only touches creators who actually finished onboarding
--       (onboarding_step = 'complete') — doesn't prematurely activate
--       anyone still mid-flow.

update public.creators
set is_active = true
where onboarding_step = 'complete'
  and is_active = false;
