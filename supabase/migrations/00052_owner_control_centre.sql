-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00052 — Owner Control Centre
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Three tables for the owner-only Control Centre at /<OWNER_CONTROL_CENTRE_SLUG>:
--   • owner_totp          — singleton row holding the encrypted TOTP secret
--                           + bcrypt-hashed backup codes. First-mover after
--                           env slug is set becomes the owner.
--   • owner_sessions      — short-lived session cookies tied to a TOTP login.
--                           idle 15 min, hard cap 8 h. Revocable.
--   • owner_audit_log     — append-only record of EVERY Control Centre action
--                           (login, view, mutation). Used in the Audit tab.
--
-- These tables are accessed only via the service-role admin client. They have
-- RLS enabled with "deny all" policies so no anon/auth-cookie session can read
-- them, but the service role bypasses RLS — that's the intended access path.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── owner_totp ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_totp (
  id integer PRIMARY KEY DEFAULT 1,
  totp_secret_encrypted text NOT NULL,
  totp_secret_iv text NOT NULL,
  totp_secret_tag text NOT NULL,
  backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT owner_totp_singleton CHECK (id = 1)
);

ALTER TABLE public.owner_totp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all on owner_totp" ON public.owner_totp;
CREATE POLICY "deny all on owner_totp" ON public.owner_totp
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.owner_totp IS
  'Singleton: holds the encrypted TOTP secret for the Control Centre owner. AES-256-GCM with OWNER_TOTP_KEY env.';

-- ── owner_sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_sessions (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_owner_sessions_expires
  ON public.owner_sessions (expires_at);

ALTER TABLE public.owner_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all on owner_sessions" ON public.owner_sessions;
CREATE POLICY "deny all on owner_sessions" ON public.owner_sessions
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.owner_sessions IS
  'Active Control Centre sessions. id = signed cookie token. Idle 15m / hard cap 8h.';

-- ── owner_audit_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_audit_log (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  session_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  payload jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_audit_created
  ON public.owner_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_audit_action
  ON public.owner_audit_log (action, created_at DESC);

ALTER TABLE public.owner_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all on owner_audit_log" ON public.owner_audit_log;
CREATE POLICY "deny all on owner_audit_log" ON public.owner_audit_log
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.owner_audit_log IS
  'Append-only audit trail of every Control Centre action. Never delete — anonymise via separate retention job after 7 years.';
