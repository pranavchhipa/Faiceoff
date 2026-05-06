-- migration 00049: add youtube fields to creators table
-- Also adds tiktok_handle for future-proofing social data capture

alter table public.creators
  add column if not exists youtube_handle       text,
  add column if not exists youtube_subscribers  integer,
  add column if not exists tiktok_handle        text;

comment on column public.creators.youtube_handle      is 'YouTube channel handle e.g. @channelname';
comment on column public.creators.youtube_subscribers is 'Self-reported subscriber count bucket (same scale as instagram_followers)';
comment on column public.creators.tiktok_handle       is 'TikTok handle e.g. @username';
