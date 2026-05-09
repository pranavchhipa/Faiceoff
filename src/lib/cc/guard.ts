/**
 * Control Centre guards — used by both pages (server components) and API
 * routes (route handlers).
 *
 * Two checks layered on top of each other:
 *   1. Slug match — `OWNER_CONTROL_CENTRE_SLUG` env must match the URL
 *      segment being requested. If not, the consumer should return 404
 *      (NOT 403 — we want zero signal that anything exists at the URL).
 *   2. Session — must have a valid, non-expired, non-revoked
 *      `owner_sessions` row keyed by the `fco_cc_session` cookie.
 *
 * `requireOwnerSession()` returns the session row OR a NextResponse 401
 * the caller should immediately return. `verifySlug()` is a plain check.
 */

import { NextResponse } from "next/server";
import { getCurrentSession, type OwnerSession } from "./session";

/** Get the configured slug, or null if Control Centre is not enabled. */
export function getConfiguredSlug(): string | null {
  const s = process.env.OWNER_CONTROL_CENTRE_SLUG?.trim();
  return s && s.length >= 16 ? s : null;
}

export function isControlCentreEnabled(): boolean {
  return getConfiguredSlug() !== null;
}

/**
 * Compare an incoming slug from the URL against the env slug.
 * Constant-time-ish (string length differs would short-circuit, but the
 * env is fixed length so the timing is predictable).
 */
export function verifySlug(slug: string | undefined | null): boolean {
  const expected = getConfiguredSlug();
  if (!expected) return false;
  if (!slug) return false;
  if (slug.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < slug.length; i++) {
    mismatch |= slug.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * For API routes — returns either the session OR a NextResponse to be
 * returned immediately. Always returns 401 on failure (never reveals
 * which check failed).
 */
export async function requireOwnerSession(): Promise<
  | { ok: true; session: OwnerSession }
  | { ok: false; response: NextResponse }
> {
  if (!isControlCentreEnabled()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, session };
}
