-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00051 — chat attachments (image upload in messages)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Adds optional attachment columns to conversation_messages so users can
-- send images alongside text. Designed to be backward-compatible: existing
-- text-only messages have NULL attachment fields.
--
-- Columns:
--   attachment_url   text  — public CDN URL of the uploaded asset (R2)
--   attachment_type  text  — MIME type (e.g. 'image/png', 'image/jpeg')
--   attachment_name  text  — original filename for download UX
--   attachment_size  int   — byte size, for client-side display
--
-- A message can have body OR attachment OR both (caption).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS attachment_url   text,
  ADD COLUMN IF NOT EXISTS attachment_type  text,
  ADD COLUMN IF NOT EXISTS attachment_name  text,
  ADD COLUMN IF NOT EXISTS attachment_size  integer;

-- The body NOT NULL constraint should be relaxed: a message may be
-- attachment-only (caption empty). Make body nullable, but enforce that
-- at least one of body/attachment_url is present.
ALTER TABLE public.conversation_messages
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.conversation_messages
  DROP CONSTRAINT IF EXISTS chk_message_has_content;

ALTER TABLE public.conversation_messages
  ADD CONSTRAINT chk_message_has_content
  CHECK (
    (body IS NOT NULL AND length(trim(body)) > 0)
    OR attachment_url IS NOT NULL
  );

COMMENT ON COLUMN public.conversation_messages.attachment_url IS
  'Public R2 URL of an attached image. NULL for text-only messages.';
COMMENT ON COLUMN public.conversation_messages.attachment_type IS
  'MIME type (image/png, image/jpeg, etc.)';
COMMENT ON COLUMN public.conversation_messages.attachment_name IS
  'Original filename, used for download UX.';
COMMENT ON COLUMN public.conversation_messages.attachment_size IS
  'Byte size of the asset, used for client-side display.';
