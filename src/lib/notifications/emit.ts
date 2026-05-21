// ─────────────────────────────────────────────────────────────────────────────
// Notification emitter — server-side helper to push a row into the user's feed.
//
// Always called with the admin (service-role) client so it bypasses RLS.
// Never throws — a failed notification must not break the request that
// triggered it. Wrap call sites in after() when latency matters.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type NotificationType =
  | "collab_request"
  | "collab_accepted"
  | "collab_declined"
  | "payment_received"
  | "generation_ready"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "ticket_opened"
  | "ticket_reply"
  | "ticket_resolved"
  | "credits_granted"
  | "payout"
  | "system";

export interface EmitNotificationParams {
  /** Recipient auth user id */
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Optional deep link the bell row navigates to */
  href?: string | null;
}

/**
 * Insert a single notification. Returns true on success, false on failure
 * (logged, never thrown).
 */
export async function emitNotification(
  admin: Admin,
  params: EmitNotificationParams,
): Promise<boolean> {
  if (!params.userId) return false;
  try {
    const { error } = await admin.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      href: params.href ?? null,
    });
    if (error) {
      console.warn("[notifications] emit failed", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[notifications] emit threw", err);
    return false;
  }
}

/**
 * Emit the same notification to multiple users (e.g. broadcast). Best-effort.
 */
export async function emitNotificationMany(
  admin: Admin,
  userIds: string[],
  params: Omit<EmitNotificationParams, "userId">,
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;
  try {
    await admin.from("notifications").insert(
      unique.map((userId) => ({
        user_id: userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        href: params.href ?? null,
      })),
    );
  } catch (err) {
    console.warn("[notifications] emitMany threw", err);
  }
}
