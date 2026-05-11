/**
 * Control Centre session management.
 *
 *   • Sessions live in `owner_sessions` (Postgres). Service-role only.
 *   • The cookie value is a 32-byte random token (base64url) used as the
 *     row primary key. No JWT — keeps the trust boundary inside the DB.
 *   • Idle timeout: 15 min (renewed on every authenticated request that
 *     calls `touchSession`).
 *   • Hard cap: 8 hours from creation. Cannot be extended.
 *   • Revocation: set `revoked_at` — we filter it out on every read.
 *
 * Cookie name: `fco_cc_session`. HttpOnly, Secure (in prod), SameSite=Strict.
 */

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const COOKIE_NAME = "fco_cc_session";
const IDLE_MS = 15 * 60 * 1000; // 15 minutes
const HARD_CAP_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface OwnerSession {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Create a fresh session row + return the cookie token. Caller is
 * responsible for setting the cookie header.
 */
export async function createSession(input: {
  ip: string | null;
  userAgent: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const token = newSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + HARD_CAP_MS);
  await admin.from("owner_sessions").insert({
    id: token,
    expires_at: expires.toISOString(),
    ip: input.ip,
    user_agent: input.userAgent,
  });
  return { token, expiresAt: expires };
}

/**
 * Validate a session by token. Returns the row if active (not revoked,
 * not idle-expired, not past hard cap). Otherwise null.
 *
 * If `touch` is true (default), we also bump `last_seen_at` — pass false
 * for read-only checks to avoid write amplification.
 */
export async function getSession(
  token: string,
  opts: { touch?: boolean } = {},
): Promise<OwnerSession | null> {
  if (!token) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("owner_sessions")
    .select("*")
    .eq("id", token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as OwnerSession;

  if (row.revoked_at) return null;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) return null;
  if (
    new Date(row.last_seen_at).getTime() + IDLE_MS <= now
  ) {
    // Idle expired — soft revoke so we don't keep checking it.
    await admin
      .from("owner_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", token);
    return null;
  }

  if (opts.touch !== false) {
    await admin
      .from("owner_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", token);
  }

  return row;
}

/** Revoke a single session (logout). */
export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  await admin
    .from("owner_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", token);
}

/** Revoke ALL active sessions — emergency lockout. */
export async function revokeAllSessions(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_sessions")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .is("revoked_at", null);
  return count ?? 0;
}

/** Read the cookie token from the current request. */
export async function readSessionToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Read + validate the current request's session (with touch).
 *
 * Wrapped in `React.cache` so multiple calls within the SAME render
 * (e.g. layout + page + audit logging) dedupe to ONE DB read/write.
 * Without this, parallel layout/page renders both hit the
 * idle-expiry branch and race on the soft-revoke, producing the
 * "sidebar hidden but page content visible" bug.
 */
export const getCurrentSession = cache(
  async function getCurrentSessionImpl(): Promise<OwnerSession | null> {
    const token = await readSessionToken();
    if (!token) return null;
    return getSession(token);
  },
);
