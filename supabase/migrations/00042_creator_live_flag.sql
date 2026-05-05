-- Separate "is_live" from "is_active". A creator may be active (account intact)
-- but paused (not accepting new requests). Brands only see is_live=true creators.

alter table public.creators
  add column is_live boolean not null default false;

create index idx_creators_is_live on public.creators(is_live) where is_live = true;

comment on column public.creators.is_live is
  'Creator visible on Discover and accepts new collab requests. Set to true only after onboarding complete + at least one package active. Toggleable from /creator/packages.';
