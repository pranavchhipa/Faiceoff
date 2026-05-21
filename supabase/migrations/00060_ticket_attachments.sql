-- ─────────────────────────────────────────────────────────────────────────────
-- migration 00060: Ticket message attachments (screenshots)
--
-- Lets users attach a screenshot when raising a ticket or replying. Mirrors
-- the chat-attachments shape (00051). A message can be text, image, or both.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ticket_messages
  add column if not exists attachment_url   text,
  add column if not exists attachment_type  text,
  add column if not exists attachment_name  text;

-- body was NOT NULL; allow attachment-only messages
alter table public.ticket_messages
  alter column body drop not null;

alter table public.ticket_messages
  drop constraint if exists chk_ticket_message_has_content;

alter table public.ticket_messages
  add constraint chk_ticket_message_has_content
  check (
    (body is not null and length(trim(body)) > 0)
    or attachment_url is not null
  );

comment on column public.ticket_messages.attachment_url  is 'Public Supabase Storage URL of an attached screenshot. NULL = text-only.';
comment on column public.ticket_messages.attachment_type is 'MIME type (image/png, image/jpeg, etc.)';
comment on column public.ticket_messages.attachment_name is 'Original filename for download UX.';
