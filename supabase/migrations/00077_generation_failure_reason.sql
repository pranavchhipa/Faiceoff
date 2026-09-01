-- ─────────────────────────────────────────────────────────────────────────────
-- 00077: Give generations a human-readable failure reason.
--
-- A generation can end in 'failed' for at least six different reasons —
-- compliance block, missing/dead product image, face-ref fetch failure,
-- Gemini refusal, Gemini API error, or the stuck-generation sweep. All of
-- them wrote the same bare status, so the brand saw "Failed" with no
-- explanation and no idea their credit had already been refunded.
--
-- `failure_reason` stores a short, user-safe phrase (NOT a stack trace —
-- the raw error still goes to Sentry).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.generations
  add column if not exists failure_reason text;

comment on column public.generations.failure_reason is
  'User-facing explanation shown in Studio when status = failed. Short, safe copy only — never raw provider errors or stack traces.';
