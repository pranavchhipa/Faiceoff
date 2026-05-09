/**
 * Control Centre audit logger.
 *
 * Every authenticated CC action — including views — should call `logAudit`.
 * Failures here MUST NOT break the action: we log to console and swallow.
 * The audit table is append-only; we never UPDATE or DELETE from it.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  /** Required: short verb describing the action, e.g. "user.ban" / "money.refund". */
  action: string;
  /** Optional: kind of object touched, e.g. "user", "collab", "license". */
  targetType?: string;
  /** Optional: id of the touched object. */
  targetId?: string;
  /** Optional: extra context (request body, before/after snapshot). */
  payload?: unknown;
  /** Optional: session id (will fall back to "unknown"). */
  sessionId?: string | null;
  /** Optional: ip + UA from headers. */
  ip?: string | null;
  userAgent?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    await admin.from("owner_audit_log").insert({
      session_id: entry.sessionId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      payload: entry.payload ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch (err) {
    console.error("[cc/audit] log failed", err, entry);
  }
}

/**
 * Convenience: extract IP + UA from a Next.js Request and log.
 */
export async function logAuditFromRequest(
  req: Request,
  sessionId: string | null,
  partial: Omit<AuditEntry, "ip" | "userAgent" | "sessionId">,
): Promise<void> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent");
  await logAudit({
    ...partial,
    sessionId,
    ip,
    userAgent,
  });
}
