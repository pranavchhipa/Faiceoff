-- Separate cover/banner photo from reference (face anchor) photos.
-- cover_image_path → stored in reference-photos bucket at covers/{creator_id}/cover.{ext}
-- Used on /brand/discover cards and creator profile page.
-- Falls back to primary reference photo if null.

alter table public.creators
  add column if not exists cover_image_path text;

comment on column public.creators.cover_image_path is
  'Optional cover photo stored in reference-photos bucket at covers/{creator_id}/cover.*. Used as hero on discover grid + profile page. Falls back to primary reference photo when null.';
