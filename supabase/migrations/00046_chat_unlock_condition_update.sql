-- Chat unlock condition changed: conversations now created when collab_request.status
-- transitions to 'accepted', not post-first-approval. Enforced at API layer.

comment on table public.conversations is
  'Brand-creator DM threads. Created when collab_request.status transitions to accepted (was: post-first-approval, changed 2026-05). Unique per pair. Eligibility checked at API layer.';
