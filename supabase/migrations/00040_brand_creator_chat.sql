-- ═══════════════════════════════════════════════════════════════════════════
-- Brand ↔ Creator chat (gated DM after first approved license)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two tables:
--   conversations          — one row per brand-creator pair
--   conversation_messages  — append-only message log
--
-- Eligibility (enforced at API layer, not in SQL):
--   A conversation is allowed only after at least one approval has been
--   issued between the brand and creator. Once eligible, it stays eligible
--   forever (the relationship exists). API routes check this before insert.
--
-- Realtime: messages are subscribed via Supabase realtime channels at the
-- table level. RLS policies ensure each user only sees their own
-- conversations + messages.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.conversations (
  id          uuid primary key default extensions.uuid_generate_v4(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  creator_id  uuid not null references public.creators(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Updated whenever a new message is appended; lets the inbox sort cheaply.
  last_message_at timestamptz,
  unique (brand_id, creator_id)
);

create index idx_conversations_brand
  on public.conversations(brand_id, last_message_at desc nulls last);
create index idx_conversations_creator
  on public.conversations(creator_id, last_message_at desc nulls last);

create table public.conversation_messages (
  id              uuid primary key default extensions.uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id  uuid not null references public.users(id) on delete cascade,
  -- Either 'brand' or 'creator' — denormalised so reads don't need a join.
  sender_role     text not null check (sender_role in ('brand', 'creator')),
  body            text not null check (length(body) between 1 and 4000),
  read_by_brand   boolean not null default false,
  read_by_creator boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_messages_conv on public.conversation_messages(conversation_id, created_at desc);

-- ── Trigger: bump conversations.last_message_at on insert ──
create or replace function public.handle_message_insert()
returns trigger as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_message_insert
  after insert on public.conversation_messages
  for each row execute function public.handle_message_insert();

-- ── RLS ──
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

create policy "Brand reads own conversations" on public.conversations
  for select using (
    brand_id in (select id from public.brands where user_id = auth.uid())
  );

create policy "Creator reads own conversations" on public.conversations
  for select using (
    creator_id in (select id from public.creators where user_id = auth.uid())
  );

create policy "Participants read messages" on public.conversation_messages
  for select using (
    conversation_id in (
      select id from public.conversations c
      where c.brand_id in (select id from public.brands where user_id = auth.uid())
         or c.creator_id in (select id from public.creators where user_id = auth.uid())
    )
  );

-- Inserts go through admin client from API routes; no policy needed for brand/creator
-- direct inserts.

comment on table public.conversations is
  'Brand-creator DM threads. Created post first approved license (eligibility checked at API layer). Unique per pair.';
comment on table public.conversation_messages is
  'Append-only chat messages. sender_role denormalised for fast reads. read_* flags drive unread badges.';
