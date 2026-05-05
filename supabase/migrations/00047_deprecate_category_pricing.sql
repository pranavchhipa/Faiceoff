-- creator_categories.price_per_generation_paise is no longer the source of
-- truth — packages are. Keep the column for one release cycle (data audit /
-- rollback safety) but mark deprecated.

comment on column public.creator_categories.price_per_generation_paise is
  'DEPRECATED 2026-05: packages (creator_packages table) are now the pricing source. Column retained for one release for audit; new code MUST NOT read this. Will be dropped in a future migration.';
