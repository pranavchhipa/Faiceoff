-- ═══════════════════════════════════════════════════════════════════════════
-- Brand-review gate between safety check and creator approval
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds two new statuses to the generations check constraint:
--   ready_for_brand_review — image generated + safety-passed; awaiting brand
--                            quality OK before being sent to creator
--   discarded              — brand rejected at preview OR superseded by retry
--
-- Flow change (paired with run-generation.ts + new API routes):
--   safety pass → ready_for_brand_review (NOT ready_for_approval)
--   brand clicks "Send" → ready_for_approval + approval row inserted
--   brand clicks "Retry" → discarded + new generation row in draft
--   brand clicks "Discard" → discarded + refund
--   24h timeout → auto-send to creator (handled in /api/generations/[id] GET)
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the existing check constraint (name may vary based on PG default).
do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.generations'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%in%';
  if cname is not null then
    execute format('alter table public.generations drop constraint %I', cname);
  end if;
end $$;

-- Re-add with the two new statuses included.
alter table public.generations
  add constraint generations_status_check
  check (status in (
    'draft',
    'compliance_check',
    'generating',
    'output_check',
    'ready_for_brand_review',
    'ready_for_approval',
    'approved',
    'rejected',
    'failed',
    'discarded'
  ));

comment on column public.generations.status is
  'Lifecycle: draft → compliance_check → generating → output_check → ready_for_brand_review → ready_for_approval → approved/rejected. Terminal: approved, rejected, failed, discarded. ready_for_brand_review is the brand quality gate added 2026-04 (00039).';
