-- ─────────────────────────────────────────────────────────────────────────────
-- 00076: Add 'needs_admin_review' to the generations status constraint.
--
-- The admin safety queue (/api/admin/safety/queue) has always filtered on
-- status = 'needs_admin_review', but no migration ever added that value to
-- generations_status_check — the queue could never receive a row (dead
-- feature). Hive-flagged generations now transition to this status instead
-- of dead-ending as 'failed' (see run-generation.ts), so a human reviews
-- every safety flag and decides refund vs confirm.
-- ─────────────────────────────────────────────────────────────────────────────

do $fo76$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.generations'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%';
  if cname is not null then
    execute format('alter table public.generations drop constraint %I', cname);
  end if;
end $fo76$;

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
    'discarded',
    'needs_admin_review'
  ));

comment on column public.generations.status is
  'Lifecycle: draft → compliance_check → generating → output_check → ready_for_brand_review → ready_for_approval → approved/rejected. Terminal: approved, rejected, failed, discarded. needs_admin_review = Hive safety flag awaiting operator verdict (00076).';
