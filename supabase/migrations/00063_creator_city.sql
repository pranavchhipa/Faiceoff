-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00063: Creator city (nullable)
--
-- Surfaces a city next to the creator's name on Discover cards (the location
-- pin from the Claude Design source), the public /creators/<slug> profile
-- hero (matches the Anya Sharma reference layout), and the discovery
-- filters down the line.
--
-- We also lean on `creators.created_at` for the "New" badge + "Newest" sort
-- on Discover, but that column already exists from migration 00002 — no
-- schema change needed there, just thread it through the CreatorCard shape
-- (handled in src/lib/profile/public-creators.ts + brand/discover loader).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.creators
  add column if not exists city text;

comment on column public.creators.city is
  'Creator''s primary city — surfaced on Discover cards + public profile hero. Free-text, no enum.';

-- Make case-insensitive city searches cheap once we wire a "Browse by city"
-- filter. Partial index — empty cities don''t pay for indexing.
create index if not exists creators_city_lower_idx
  on public.creators (lower(city))
  where city is not null and city <> '';
