-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00058: In-app notifications
--
-- A single feed per user (auth.users.id). Emitted from server-side events
-- (collab request, accept, payment, generation ready, approval, ticket reply,
-- etc.) via src/lib/notifications/emit.ts. Read by the topbar NotificationBell.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  -- Recipient (auth user id)
  user_id uuid not null references public.users(id) on delete cascade,
  -- Machine type for grouping/icon selection, e.g. 'collab_request',
  -- 'collab_accepted', 'payment_received', 'generation_ready',
  -- 'approval_requested', 'approval_approved', 'approval_rejected',
  -- 'ticket_reply', 'ticket_resolved', 'credits_granted', 'system'
  type text not null,
  title text not null,
  body text,
  -- Optional deep link the bell row navigates to
  href text,
  -- Read state
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Feed query: most recent unread-first for a user
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id)
  where read_at is null;

comment on table  public.notifications        is 'Per-user in-app notification feed (topbar bell)';
comment on column public.notifications.type    is 'Machine type for icon/grouping';
comment on column public.notifications.href    is 'Optional deep-link the row navigates to';
comment on column public.notifications.read_at is 'NULL = unread';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

-- Users can read their own notifications
create policy "notifications_self_read"
  on public.notifications for select
  using (user_id = auth.uid());

-- Users can mark their own as read (update read_at)
create policy "notifications_self_update"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts happen server-side via the admin (service role) client, which
-- bypasses RLS — no insert policy needed for end users.
