"use server";

/**
 * Control Centre — collab session operator actions.
 *
 * Re-verifies the CC session (getCurrentSession) before doing anything, runs
 * with the admin (service-role) client, writes an audit row, and notifies BOTH
 * parties (the brand + the creator on the collab). Mirrors the payouts /
 * disputes action structure exactly.
 *
 * ── Money movement (read this before changing) ──────────────────────────────
 * These actions ONLY flip collab_sessions.status. They deliberately do NOT
 * move any money:
 *
 *  • Force-complete → 'completed'. Per-generation escrow rows + license rows
 *    already exist (created in the approval flow). Escrow RELEASE happens via
 *    the holding-period cron, independent of collab status — so completing a
 *    collab fires no extra money side-effect. This matches the brand-facing
 *    /api/collabs/[id]/force-complete endpoint exactly.
 *  • Cancel → 'cancelled'. A cancellation MAY warrant refunding the brand for
 *    unspent generation slots, but clawing money back safely (wallet reserve
 *    vs. already-released escrow) is not a flow that exists yet. See the TODO
 *    below. We move no money here — operator handles any refund manually (e.g.
 *    via the support grant-credits remediation) until that flow is designed.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";
import { logAudit } from "@/lib/cc/audit";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function requireOperator() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/** brands.id → brands.user_id (the brand's auth user for notifications). */
async function loadBrandUserId(admin: Admin, brandId: string | null): Promise<string | null> {
  if (!brandId) return null;
  const { data } = await admin
    .from("brands")
    .select("user_id")
    .eq("id", brandId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** creators.id → creators.user_id (the creator's auth user for notifications). */
async function loadCreatorUserId(admin: Admin, creatorId: string | null): Promise<string | null> {
  if (!creatorId) return null;
  const { data } = await admin
    .from("creators")
    .select("user_id")
    .eq("id", creatorId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Force-complete a collab — operator closes an active collab early.
 *
 * Fields (FormData): collab_session_id, cc_slug.
 *
 * Sets collab_sessions.status='completed' (guarded WHERE status='active', so
 * it's a no-op on an already-terminal collab). No money moves here — escrow
 * release is handled by the holding-period cron independent of collab status.
 * Notifies both the brand and the creator.
 */
export async function forceCompleteCollab(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const collabId = String(formData.get("collab_session_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  if (!collabId) return;

  const admin = createAdminClient() as Admin;

  const { data: collab } = await admin
    .from("collab_sessions")
    .select("id, brand_id, creator_id, status")
    .eq("id", collabId)
    .maybeSingle();
  if (!collab) return;
  // Idempotent: only complete a still-active collab.
  if (collab.status !== "active") return;

  const nowIso = new Date().toISOString();
  // Guard the transition in the WHERE clause so concurrent flips can't race.
  await admin
    .from("collab_sessions")
    .update({ status: "completed", updated_at: nowIso })
    .eq("id", collabId)
    .eq("status", "active");

  const brandUserId = await loadBrandUserId(admin, collab.brand_id);
  const creatorUserId = await loadCreatorUserId(admin, collab.creator_id);

  if (brandUserId) {
    await emitNotification(admin, {
      userId: brandUserId,
      type: "system",
      title: "Your collab was marked complete by support.",
      body: "A Faiceoff support operator closed this collab. Any approved generations remain in your vault.",
      href: "/brand/collabs",
    });
  }
  if (creatorUserId) {
    await emitNotification(admin, {
      userId: creatorUserId,
      type: "system",
      title: "Your collab was marked complete by support.",
      body: "A Faiceoff support operator closed this collab. Approved generations are settled per the normal escrow schedule.",
      href: "/creator/collaborations",
    });
  }

  void logAudit({
    action: "collab.force_complete",
    sessionId: session.id,
    targetType: "collab_session",
    targetId: collabId,
    payload: { collabId, brandId: collab.brand_id, creatorId: collab.creator_id, fromStatus: collab.status },
  });

  revalidatePath(`/${ccSlug}/collabs`);
}

/**
 * Cancel a collab — operator terminates an active collab.
 *
 * Fields (FormData): collab_session_id, cc_slug, reason.
 *
 * Sets collab_sessions.status='cancelled' (guarded WHERE status IN ('active')).
 * No money moves here — see the file header. If a cancellation needs a refund,
 * the operator issues it manually (support grant-credits) until the safe
 * reversal flow exists. Notifies both parties with the reason.
 *
 * TODO(cancel refund): when a collab is cancelled with unspent generation
 * slots, the brand should be refunded for the un-generated images. That needs
 * the same escrow-aware reversal mechanics the disputes refund TODO calls for —
 * wire both together once designed.
 */
export async function cancelCollab(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const collabId = String(formData.get("collab_session_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!collabId) return;

  const admin = createAdminClient() as Admin;

  const { data: collab } = await admin
    .from("collab_sessions")
    .select("id, brand_id, creator_id, status")
    .eq("id", collabId)
    .maybeSingle();
  if (!collab) return;
  // Only an active collab can be cancelled.
  if (collab.status !== "active") return;

  const nowIso = new Date().toISOString();
  await admin
    .from("collab_sessions")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("id", collabId)
    .in("status", ["active"]);

  const reasonSuffix = reason ? ` Reason: ${reason}` : "";
  const brandUserId = await loadBrandUserId(admin, collab.brand_id);
  const creatorUserId = await loadCreatorUserId(admin, collab.creator_id);

  if (brandUserId) {
    await emitNotification(admin, {
      userId: brandUserId,
      type: "system",
      title: "Your collab was cancelled by support.",
      body: `A Faiceoff support operator cancelled this collab.${reasonSuffix}`,
      href: "/brand/collabs",
    });
  }
  if (creatorUserId) {
    await emitNotification(admin, {
      userId: creatorUserId,
      type: "system",
      title: "Your collab was cancelled by support.",
      body: `A Faiceoff support operator cancelled this collab.${reasonSuffix}`,
      href: "/creator/collaborations",
    });
  }

  void logAudit({
    action: "collab.cancel",
    sessionId: session.id,
    targetType: "collab_session",
    targetId: collabId,
    payload: { collabId, brandId: collab.brand_id, creatorId: collab.creator_id, fromStatus: collab.status, reason },
  });

  revalidatePath(`/${ccSlug}/collabs`);
}
