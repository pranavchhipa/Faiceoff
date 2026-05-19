-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00055: Instagram OAuth integration
--
-- Adds fields to creators table to store verified Instagram connection data
-- pulled via the new Instagram API with Instagram Login (replaces the
-- deprecated Instagram Basic Display API that was sunset Dec 4 2024).
--
-- Only Business / Creator IG accounts can connect via this API — Meta does
-- not allow Personal accounts. For Personal accounts we keep the manual
-- @handle + bucket entry as a fallback (existing instagram_handle column
-- already supports that; instagram_verified=false signals "unverified").
--
-- Tokens: long-lived access token (60-day expiry, refreshable up to 60d
-- before expiry). Encrypted at rest using KYC_ENCRYPTION_KEY (AES-256-GCM)
-- — same key pattern as creator_kyc.pan_encrypted to avoid a new key.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.creators
  -- IG-scoped user id (stable across token refreshes; used for refetches)
  add column if not exists instagram_user_id        text,
  -- Long-lived access token encrypted with AES-256-GCM (KYC_ENCRYPTION_KEY)
  add column if not exists instagram_access_token   bytea,
  -- When the long-lived token expires (refresh before this)
  add column if not exists instagram_token_expires_at timestamptz,
  -- When the creator first completed OAuth (for analytics + lifecycle)
  add column if not exists instagram_connected_at   timestamptz,
  -- "BUSINESS" or "MEDIA_CREATOR" — null means unverified / manual entry
  add column if not exists instagram_account_type   text,
  -- Snapshot of profile data at last sync
  add column if not exists instagram_profile_pic_url text,
  add column if not exists instagram_media_count    integer,
  -- Insights cache (refreshed daily)
  add column if not exists instagram_insights       jsonb,
  -- Last successful sync (profile + insights)
  add column if not exists instagram_last_synced_at timestamptz,
  -- True if creator completed OAuth, false if manual entry only
  add column if not exists instagram_verified       boolean not null default false;

-- Index for OAuth callback lookups (find creator by IG user id)
create unique index if not exists creators_instagram_user_id_idx
  on public.creators(instagram_user_id)
  where instagram_user_id is not null;

-- Index for the daily token-refresh cron (find tokens expiring soon)
create index if not exists creators_instagram_token_expires_at_idx
  on public.creators(instagram_token_expires_at)
  where instagram_token_expires_at is not null;

comment on column public.creators.instagram_user_id        is 'Meta IG-scoped user id from OAuth (stable across token refreshes)';
comment on column public.creators.instagram_access_token   is 'AES-256-GCM encrypted long-lived token; nonce(12)|tag(16)|ciphertext layout';
comment on column public.creators.instagram_token_expires_at is 'Long-lived token expiry (60d from issue, refreshable)';
comment on column public.creators.instagram_connected_at   is 'When creator first completed IG OAuth';
comment on column public.creators.instagram_account_type   is 'BUSINESS or MEDIA_CREATOR — null if manual entry only';
comment on column public.creators.instagram_profile_pic_url is 'Cached profile picture URL from last sync';
comment on column public.creators.instagram_media_count    is 'Total media posts on IG profile';
comment on column public.creators.instagram_insights       is 'Cached insights JSON: reach, impressions, engagement_rate, top_media';
comment on column public.creators.instagram_last_synced_at is 'Last successful profile + insights sync';
comment on column public.creators.instagram_verified       is 'True if creator completed Meta OAuth; false = manual self-reported entry';
