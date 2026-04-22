// ─────────────────────────────────────────────────────────────────────────────
// License request state machine — allowed transitions + validation helper
// Ref spec §4.2 LICENSE_REQUEST
//
//   DRAFT → REQUESTED → ACCEPTED → ACTIVE → COMPLETED
//                    ↘ REJECTED  ↘ EXPIRED (pro-rata refund)
//                                 ↘ CANCELLED (dispute resolved)
//
// Used before any UPDATE on `license_requests.status` to reject illegal
// transitions (e.g. rejecting an already-active license, re-accepting after
// rejection). All status strings match the DB check constraint in migration
// 00021_create_license_system.sql.
// ─────────────────────────────────────────────────────────────────────────────

export const LICENSE_STATES = [
  "draft",
  "requested",
  "accepted",
  "active",
  "rejected",
  "expired",
  "cancelled",
  "completed",
] as const;

export type LicenseState = (typeof LICENSE_STATES)[number];

/**
 * Map of allowed next states, keyed by current state. Terminal states
 * (rejected/expired/cancelled/completed) have no outgoing edges.
 *
 * Note: `accepted` is an ephemeral step — the accept route sets status to
 * 'accepted' *before* calling commit_license_acceptance, which flips to
 * 'active'. We list the transition so the flip is legal.
 */
const LICENSE_TRANSITIONS: Record<LicenseState, readonly LicenseState[]> = {
  draft: ["requested", "cancelled"],
  requested: ["accepted", "rejected", "cancelled"],
  accepted: ["active", "cancelled"],
  active: ["expired", "completed", "cancelled"],
  rejected: [],
  expired: [],
  cancelled: [],
  completed: [],
};

/**
 * Whether `from → to` is a legal state transition.
 *
 * Returns false for unknown states, same-state transitions (idempotency is
 * handled at the procedure layer, not here), and transitions out of terminal
 * states.
 */
export function canTransition(from: LicenseState, to: LicenseState): boolean {
  const nextStates = LICENSE_TRANSITIONS[from];
  if (!nextStates) return false;
  return nextStates.includes(to);
}

/**
 * Validate a transition; throw if not allowed. Use at the top of accept/reject
 * route handlers to fail fast before starting any DB writes.
 */
export function assertTransition(
  from: LicenseState,
  to: LicenseState,
  context?: string,
): void {
  if (!canTransition(from, to)) {
    const prefix = context ? `${context}: ` : "";
    throw new Error(
      `${prefix}illegal license state transition ${from} → ${to}`,
    );
  }
}

/**
 * Terminal states — no further transitions possible. Useful for UI badges
 * and the daily-expiry cron (skip terminals).
 */
export const TERMINAL_LICENSE_STATES = new Set<LicenseState>([
  "rejected",
  "expired",
  "cancelled",
  "completed",
]);

export function isTerminal(state: LicenseState): boolean {
  return TERMINAL_LICENSE_STATES.has(state);
}
