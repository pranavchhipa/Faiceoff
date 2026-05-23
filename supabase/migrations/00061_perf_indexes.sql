-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00061: Performance indexes on hot query paths
--
-- collab_sessions is filtered by brand_id / creator_id on every collabs list,
-- dashboard stat, and creator/brand home — but only had indexes on
-- collab_request_id + package_id. These add the missing access paths.
--
-- All idempotent (if not exists). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- collab_sessions — the hottest table for list/stat queries
create index if not exists collab_sessions_brand_id_idx
  on public.collab_sessions(brand_id);

create index if not exists collab_sessions_creator_id_idx
  on public.collab_sessions(creator_id);

-- Composite for dashboard "active collabs" counts (role + status together)
create index if not exists collab_sessions_creator_status_idx
  on public.collab_sessions(creator_id, status);

create index if not exists collab_sessions_brand_status_idx
  on public.collab_sessions(brand_id, status);

-- approvals — dashboard pending/approval-rate counts filter (creator_id, status)
create index if not exists approvals_creator_status_idx
  on public.approvals(creator_id, status);

-- ticket_messages — thread fetch by ticket, oldest-first
create index if not exists ticket_messages_ticket_created_idx
  on public.ticket_messages(ticket_id, created_at);

-- creator_demo_samples — public profile reads visible+ready by creator
create index if not exists creator_demo_samples_creator_visible_idx
  on public.creator_demo_samples(creator_id, is_visible, status);
