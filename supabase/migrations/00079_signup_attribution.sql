-- ─────────────────────────────────────────────────────────────────────────────
-- 00079: Record where each signup actually came from.
--
-- 21 creators signed up in one morning and there was no way to tell where
-- from: the PostHog browser SDK was never initialised, so no pageview,
-- referrer or UTM was ever captured, and NEXT_PUBLIC_POSTHOG_HOST pointed at
-- the dashboard domain rather than the ingestion one, so even the
-- server-side events went nowhere.
--
-- Attribution lives in our OWN database, not only in a third-party tool:
-- it survives a vendor change, it can be joined against collabs and earnings
-- to answer "which channel brings creators who actually transact", and it is
-- queryable in plain SQL today.
--
-- FIRST-touch, not last: the referrer that introduced someone is the one
-- that deserves credit, and it is the one a later internal navigation would
-- otherwise overwrite.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists signup_referrer text,
  add column if not exists signup_landing_path text,
  add column if not exists signup_utm jsonb,
  add column if not exists signup_source text;

comment on column public.users.signup_referrer is
  'document.referrer at the visitor''s FIRST page view, before any internal navigation. Null for direct traffic.';
comment on column public.users.signup_landing_path is
  'The first path on faiceoff.com this visitor opened — tells you which page converts.';
comment on column public.users.signup_utm is
  'First-touch UTM params {source,medium,campaign,term,content} as sent by the campaign link.';
comment on column public.users.signup_source is
  'Coarse bucket derived from referrer + UTM: direct | organic_search | social | referral | campaign. For grouping without parsing URLs in every query.';

create index if not exists idx_users_signup_source on public.users(signup_source, created_at desc);
