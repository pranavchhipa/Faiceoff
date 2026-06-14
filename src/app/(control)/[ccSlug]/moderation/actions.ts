"use server";

/**
 * Control Centre — moderation operator actions.
 *
 * Re-verifies the CC session (getCurrentSession) before doing anything, runs
 * with the admin (service-role) client, writes an audit row, notifies the
 * affected brand, and revalidates the moderation page. Mirrors the payouts /
 * disputes action structure exactly.
 *
 * Two actions for the pipeline-wreckage queue:
 *   • forceDiscardGeneration — kill a stuck / non-terminal gen and (for paid
 *     collab gens) refund the single-pool iteration EXACTLY like the brand-side
 *     /api/generations/[id]/discard route does. The status guard on the claim is
 *     the idempotency lock, so the refund runs at most once — no double-refund.
 *   • retryStuckGeneration — re-dispatch a gen that's wedged in the pipeline
 *     (compliance_check / generating / output_check) by flipping it back to
 *     'draft' and firing the same after() → runGenerationsBatch([id]) the
 *     generate route uses. runGeneration is idempotent (claims 'draft' only).
 *
 * ── Money movement (read this before changing) ──────────────────────────────
 * The ONLY money path here is the single-pool credit refund on force-discard,
 * copied verbatim from the brand discard route:
 *   1. brands.credits_remaining += 1            (global wallet)
 *   2. collab_sessions.gen_credits_used -= 1    (per-collab cap counter, floored)
 *   3. credit_transactions 'refund' row         (audit ledger)
 * It only fires for collab gens (collab_session_id present) that we actually
 * claimed (status went non-terminal → discarded in this call). Legacy
 * /api/campaigns/create gens never touched this pool, so they get no refund.
 * We do NOT touch escrow_ledger or wallet reservations — a stuck/failed gen
 * never reached approval, so there is nothing in escrow to claw back.
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";
import { logAudit } from "@/lib/cc/audit";
import { emitNotification } from "@/lib/notifications/emit";
import { runGenerationsBatch } from "@/lib/ai/run-generation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * Non-terminal statuses a force-discard is allowed to claim. Excludes the
 * terminal set (approved / rejected / failed / discarded) so an operator can
 * never discard — and accidentally refund — an already-settled generation.
 */
const FORCE_DISCARD_FROM = [
  "draft",
  "compliance_check",
  "generating",
  "output_check",
  "ready_for_brand_review",
  "ready_for_approval",
];

/**
 * Statuses a stuck gen can be re-dispatched from. These are exactly the "stuck"
 * states the moderation page surfaces (>24h wedged in the pipeline). We flip the
 * gen back to 'draft' — the only status runGeneration's atomic claim accepts.
 */
const RETRY_FROM = ["compliance_check", "generating", "output_check"];

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

/**
 * Force-discard a stuck / non-terminal generation.
 *
 * Fields (FormData): generation_id, cc_slug.
 *
 * Atomic claim: status (one of FORCE_DISCARD_FROM) → 'discarded'. The status
 * guard on the WHERE is the idempotency lock — a second call (or a race) claims
 * nothing, so the refund below runs at most once per gen and we never discard an
 * approved/rejected/failed gen.
 *
 * For collab gens we apply the SAME single-pool refund the brand discard route
 * does (credits_remaining +1, gen_credits_used -1, 'refund' ledger row). The
 * refund is best-effort: the status flip already succeeded, so a refund failure
 * is logged for manual reconcile but does not throw.
 */
export async function forceDiscardGeneration(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const generationId = String(formData.get("generation_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  if (!generationId) return;

  const admin = createAdminClient() as Admin;

  // ── Atomic claim: only flip from a non-terminal state → 'discarded' ──
  const { data: claimed } = await admin
    .from("generations")
    .update({ status: "discarded" })
    .eq("id", generationId)
    .in("status", FORCE_DISCARD_FROM)
    .select("id, brand_id, creator_id, collab_session_id, status")
    .maybeSingle();

  // Nothing claimed → already terminal or gone. No-op (idempotent, no refund).
  if (!claimed) {
    void logAudit({
      action: "moderation.force_discard.noop",
      sessionId: session.id,
      targetType: "generation",
      targetId: generationId,
      payload: { generationId, reason: "not in a discardable state" },
    });
    revalidatePath(`/${ccSlug}/moderation`);
    return;
  }

  const brandId: string | null = claimed.brand_id ?? null;
  const collabSessionId: string | null = claimed.collab_session_id ?? null;
  let creditRefunded = false;

  // ── Refund the single-pool iteration (collab gens only) ──
  // Mirrors /api/generations/[id]/discard exactly. Best-effort: the gen is
  // already discarded, so a refund failure is logged for manual reconcile.
  if (collabSessionId && brandId) {
    try {
      // 1. Refund global wallet (brands.credits_remaining += 1)
      const { data: brandRow } = await admin
        .from("brands")
        .select("credits_remaining")
        .eq("id", brandId)
        .maybeSingle();
      const currentCredits = (brandRow?.credits_remaining ?? 0) as number;
      const newBalance = currentCredits + 1;

      await admin
        .from("brands")
        .update({ credits_remaining: newBalance })
        .eq("id", brandId);

      // 2. Decrement the per-collab counter (gen_credits_used -= 1), floored at 0.
      const { data: sessionRow } = await admin
        .from("collab_sessions")
        .select("gen_credits_used")
        .eq("id", collabSessionId)
        .maybeSingle();
      const currentUsed = (sessionRow?.gen_credits_used ?? 0) as number;
      await admin
        .from("collab_sessions")
        .update({ gen_credits_used: Math.max(0, currentUsed - 1) })
        .eq("id", collabSessionId);

      // 3. Audit ledger row.
      await admin.from("credit_transactions").insert({
        brand_id: brandId,
        type: "refund",
        credits: 1,
        balance_after: newBalance,
        reference_type: "generation",
        reference_id: generationId,
        description: "Force-discarded by operator — iteration refunded",
      });

      creditRefunded = true;
    } catch (err) {
      // Soft fail — gen is discarded but refund needs manual reconcile.
      console.error(
        `[moderation/force-discard] credit refund failed for gen=${generationId}, manual reconcile needed`,
        err,
      );
    }
  }

  // ── Notify the brand ──
  const brandUserId = await loadBrandUserId(admin, brandId);
  if (brandUserId) {
    await emitNotification(admin, {
      userId: brandUserId,
      type: "system",
      title: "A generation was discarded by support",
      body: creditRefunded
        ? "We discarded a stuck generation and refunded 1 credit to your wallet."
        : "We discarded a stuck generation on your account.",
      href: "/brand/collabs",
    });
  }

  // ── Audit ──
  void logAudit({
    action: "moderation.force_discard",
    sessionId: session.id,
    targetType: "generation",
    targetId: generationId,
    payload: {
      generationId,
      brandId,
      collabSessionId,
      previousStatus: null, // claim already overwrote it; FORCE_DISCARD_FROM gate guarantees non-terminal
      creditRefunded,
    },
  });

  revalidatePath(`/${ccSlug}/moderation`);
}

/**
 * Retry a generation wedged in the pipeline.
 *
 * Fields (FormData): generation_id, cc_slug.
 *
 * Lower-risk choice (re-dispatch, NOT a dead-end 'failed' flip): the pipeline
 * orchestrator (runGeneration) is idempotent and only claims rows in 'draft'.
 * So we atomically flip the stuck gen (RETRY_FROM) back to 'draft', then fire
 * the SAME after() → runGenerationsBatch([id]) the generate route uses. If the
 * row isn't actually stuck (already moved on), the claim flips nothing and we
 * no-op without dispatching — no risk of resurrecting a completed gen.
 *
 * No money moves here: the credit was already spent at generate time and the
 * brand is owed the image, so re-running the pipeline is the correct remedy
 * (re-dispatch costs nothing extra).
 */
export async function retryStuckGeneration(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const generationId = String(formData.get("generation_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  if (!generationId) return;

  const admin = createAdminClient() as Admin;

  // ── Atomic claim: only flip a genuinely-stuck gen back to 'draft' ──
  const { data: claimed } = await admin
    .from("generations")
    .update({ status: "draft" })
    .eq("id", generationId)
    .in("status", RETRY_FROM)
    .select("id, brand_id, collab_session_id, status")
    .maybeSingle();

  if (!claimed) {
    // Not stuck anymore (or gone) — nothing to re-dispatch.
    void logAudit({
      action: "moderation.retry.noop",
      sessionId: session.id,
      targetType: "generation",
      targetId: generationId,
      payload: { generationId, reason: "not in a stuck state" },
    });
    revalidatePath(`/${ccSlug}/moderation`);
    return;
  }

  // ── Re-dispatch the pipeline (same path as /api/collabs/[id]/generate) ──
  after(async () => {
    try {
      await runGenerationsBatch([generationId]);
    } catch (err) {
      console.error("[moderation/retry] runGenerationsBatch failed", err);
    }
  });

  // ── Audit ──
  void logAudit({
    action: "moderation.retry_stuck",
    sessionId: session.id,
    targetType: "generation",
    targetId: generationId,
    payload: {
      generationId,
      brandId: claimed.brand_id ?? null,
      collabSessionId: claimed.collab_session_id ?? null,
      redispatched: true,
    },
  });

  revalidatePath(`/${ccSlug}/moderation`);
}
