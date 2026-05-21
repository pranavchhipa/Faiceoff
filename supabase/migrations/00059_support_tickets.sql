-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00059: Support ticketing system
--
-- Creators + brands raise support tickets from their dashboards. Tickets land
-- in the Control Centre where an operator triages, replies, and resolves —
-- including direct remediation actions (e.g. grant credits to a brand).
--
-- Two tables:
--   support_tickets   — one row per ticket
--   ticket_messages   — threaded conversation (user ↔ operator)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.support_tickets (
  id uuid primary key default extensions.uuid_generate_v4(),
  -- Raiser (auth user id) + a role snapshot so CC can show brand/creator
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('brand', 'creator')),
  subject text not null,
  -- category drives triage + canned remediation in the CC
  category text not null default 'other'
    check (category in (
      'generation_quality', 'payment', 'payout', 'account',
      'collab', 'bug', 'feature_request', 'other'
    )),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  -- Optional links to the thing the ticket is about
  related_collab_session_id uuid references public.collab_sessions(id) on delete set null,
  related_generation_id uuid references public.generations(id) on delete set null,
  -- Resolution metadata
  resolution_note text,
  resolved_at timestamptz,
  -- Operator-side unread flag (set true on new user message, false when operator views)
  has_unread_for_operator boolean not null default true,
  -- User-side unread flag (set true on new operator message)
  has_unread_for_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx
  on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets(status, created_at desc);

comment on table public.support_tickets is 'Support tickets raised by creators/brands, triaged in Control Centre';

create table if not exists public.ticket_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  -- Who sent it: the ticket raiser ('user') or a CC operator ('operator')
  sender_kind text not null check (sender_kind in ('user', 'operator')),
  -- For user messages, the auth user id; null for operator (CC session, not a user)
  sender_user_id uuid references public.users(id) on delete set null,
  body text not null,
  -- For operator action messages (e.g. "Granted 5 credits"), a machine tag
  action_tag text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx
  on public.ticket_messages(ticket_id, created_at asc);

comment on table public.ticket_messages is 'Threaded messages on a support ticket (user ↔ operator)';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

-- Users read/update their own tickets
create policy "tickets_self_read"
  on public.support_tickets for select
  using (user_id = auth.uid());

-- Users read messages on their own tickets
create policy "ticket_messages_self_read"
  on public.ticket_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_messages.ticket_id
        and t.user_id = auth.uid()
    )
  );

-- All writes go through the admin (service-role) client server-side, plus the
-- Control Centre operates via admin. No end-user insert/update policies needed.
