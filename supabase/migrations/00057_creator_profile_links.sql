-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00057: Creator profile custom links (Linktree-style buttons)
--
-- Creators can add their own link buttons to their public /creators/<slug>
-- page — "My YouTube", "WhatsApp me", "My website", "Latest collab", etc.
-- Each appears as a tappable button on the public profile.
--
-- Stored as a JSONB array (max ~10 links per creator, always fetched together
-- with the profile, no need for a separate table + join):
--   [{ "id": "uuid", "label": "My YouTube", "url": "https://youtube.com/@x" }]
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.creators
  add column if not exists profile_links jsonb not null default '[]'::jsonb;

comment on column public.creators.profile_links is
  'Linktree-style custom link buttons for the public profile. Array of { id, label, url }. Order = display order.';
