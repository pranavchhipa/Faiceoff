-- ═══════════════════════════════════════════════════════════════════════════
-- Rename campaigns → collab_sessions (terminology match with new flow)
-- Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §5.2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Renames the table, its indexes, its RLS policies, and the FK column in
-- generations (campaign_id → collab_session_id). Adds a license_request_id
-- column linking the session to its originating license request.
--
-- Also drops the legacy create_campaign_with_escrow PL/pgSQL function from
-- 00017 — it operates on the old wallet_transactions + campaigns model which
-- is being retired in this chunk (replaced by license_requests +
-- credit_transactions + escrow_ledger). New equivalent procedures will be
-- added in a later migration (00028 in the plan).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Drop the legacy escrow function (operates on retiring wallet model) ─────
drop function if exists public.create_campaign_with_escrow(
  uuid, uuid, uuid, text, text, integer, integer, integer, jsonb
);

-- ── Rename the table ────────────────────────────────────────────────────────
alter table public.campaigns rename to collab_sessions;

-- ── Add link to originating license request ─────────────────────────────────
alter table public.collab_sessions
  add column license_request_id uuid references public.license_requests(id);

create index idx_collab_sessions_license_request_id
  on public.collab_sessions(license_request_id)
  where license_request_id is not null;

-- ── Drop lora_model_id if present (no longer applicable) ────────────────────
alter table public.collab_sessions drop column if exists lora_model_id;

-- ── Rename indexes that carried the old "campaigns" name ────────────────────
alter index if exists idx_campaigns_brand_id    rename to idx_collab_sessions_brand_id;
alter index if exists idx_campaigns_creator_id  rename to idx_collab_sessions_creator_id;
alter index if exists idx_campaigns_status      rename to idx_collab_sessions_status;

-- ── Rename RLS policies ─────────────────────────────────────────────────────
alter policy "Brands can read own campaigns"
  on public.collab_sessions rename to "Brands can read own collab sessions";
alter policy "Brands can insert own campaigns"
  on public.collab_sessions rename to "Brands can insert own collab sessions";
alter policy "Brands can update own campaigns"
  on public.collab_sessions rename to "Brands can update own collab sessions";
alter policy "Creators can read campaigns they are part of"
  on public.collab_sessions rename to "Creators can read collab sessions they are part of";
alter policy "Admins can read all campaigns"
  on public.collab_sessions rename to "Admins can read all collab sessions";

-- ── Rename the updated_at trigger ──────────────────────────────────────────
alter trigger on_campaigns_updated on public.collab_sessions
  rename to on_collab_sessions_updated;

-- ── Rename FK column on generations ─────────────────────────────────────────
alter table public.generations rename column campaign_id to collab_session_id;
alter index if exists idx_generations_campaign_id
  rename to idx_generations_collab_session_id;

comment on table public.collab_sessions is
  'Brand/creator collaboration sessions (renamed from campaigns 2026-04 to match new license-driven flow). Links to license_request_id; images generated within live in generations.';
comment on column public.generations.collab_session_id is
  'FK to collab_sessions.id (renamed from campaign_id 2026-04).';
