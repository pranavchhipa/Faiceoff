"use server";

/**
 * Control Centre — dispute resolution operator actions.
 *
 * Re-verifies the CC session (getCurrentSession) before doing anything, runs
 * with the admin (service-role) client, writes an audit row, and notifies BOTH
 * parties (the brand + the creator on the disputed generation). Mirrors the
 * payouts / brand-verifications action structure exactly.
 *
 * ── Money movement (read this before changing) ──────────────────────────────
 * A dispute is raised AFTER a generation already moved through the pipeline, so
 * by resolution time the generation is typically terminal (approved → escrow
 * released to the creator + license issued, OR rejected → wallet reserve
 * already released). There is no live wallet reservation to `releaseReserve`,
 * and clawing escrow back from a creator who has been paid is NOT safe to
 * automate. So we do NOT touch escrow_ledger / wallet reservations here.
 *
 * For a 'refund' outcome we use the ONE established, safe money path in the
 * Control Centre: grant the brand back credits (mirrors
 * grantCreditsForTicket — increments brands.credits_remaining + best-effort
 * ledger row). We refund 1 credit per disputed generation (the per-generation
 * unit cost). 'no_action' moves no money. See the TODO below for the full
 * escrow-aware refund that a future iteration should wire once the reversal
 * mechanics are designed.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";
import { logAudit } from "@/lib/cc/audit";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Credits returned to the brand on a 'refund' outcome (per-generation unit). */
const DISPUTE_REFUND_CREDITS = 1;

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
 * Resolve a dispute.
 *
 * Fields (FormData): dispute_id, cc_slug, outcome ('refund' | 'no_action'),
 * resolution_notes.
 *
 * Sets disputes.status to the matching value allowed by the 00011 check
 * constraint — 'resolved_refund' or 'resolved_no_action' — plus resolution_notes
 * + resolved_at. (The disputes table has NO resolved_by column, so we record the
 * operator in the audit log instead.) For 'refund' we credit the brand back
 * DISPUTE_REFUND_CREDITS via the safe credits path; 'no_action' moves no money.
 * Either way we notify both the brand and the creator.
 */
export async function resolveDispute(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const disputeId = String(formData.get("dispute_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const outcomeRaw = String(formData.get("outcome") ?? "");
  const notes = String(formData.get("resolution_notes") ?? "").trim();
  if (!disputeId) return;

  const outcome: "refund" | "no_action" = outcomeRaw === "refund" ? "refund" : "no_action";
  const newStatus = outcome === "refund" ? "resolved_refund" : "resolved_no_action";

  const admin = createAdminClient() as Admin;

  // Load the dispute + the generation it points at so we know who to refund /
  // notify. brand_id + creator_id are denormalised on generations (00009).
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, generation_id, raised_by, status")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute) return;

  // Idempotent: don't re-resolve / double-refund an already-terminal dispute.
  if (["resolved_refund", "resolved_no_action", "closed"].includes(dispute.status)) return;

  const { data: gen } = await admin
    .from("generations")
    .select("id, brand_id, creator_id")
    .eq("id", dispute.generation_id)
    .maybeSingle();

  const brandId: string | null = gen?.brand_id ?? null;
  const creatorId: string | null = gen?.creator_id ?? null;

  const nowIso = new Date().toISOString();

  // ── 1. Flip the dispute to its resolved state ──────────────────────────────
  await admin
    .from("disputes")
    .update({
      status: newStatus,
      resolution_notes: notes || null,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", disputeId);

  // ── 2. Money (refund outcome only) ─────────────────────────────────────────
  // Safe path: grant the brand back credits (same mechanism as the support
  // grant-credits remediation). We deliberately do NOT touch escrow_ledger or
  // wallet reservations — see the file header.
  //
  // TODO(escrow-aware refund): when the generation is still APPROVED with escrow
  // held (within the 7-day holding window) a full refund should clawback the
  // creator's escrow row + refund the brand's wallet reservation atomically.
  // Until that reversal flow is designed, we issue a credit goodwill refund.
  let refundedCredits = 0;
  if (outcome === "refund" && brandId) {
    const { data: brand } = await admin
      .from("brands")
      .select("id, credits_remaining")
      .eq("id", brandId)
      .maybeSingle();
    if (brand) {
      const newBalance = (brand.credits_remaining ?? 0) + DISPUTE_REFUND_CREDITS;
      await admin
        .from("brands")
        .update({ credits_remaining: newBalance })
        .eq("id", brand.id);
      refundedCredits = DISPUTE_REFUND_CREDITS;

      // Best-effort ledger row (schema may differ across envs — non-fatal).
      try {
        await admin.from("credit_transactions").insert({
          brand_id: brand.id,
          delta: DISPUTE_REFUND_CREDITS,
          balance_after: newBalance,
          reason: "dispute_refund",
          reference_type: "dispute",
          reference_id: disputeId,
        });
      } catch {
        // ledger schema mismatch — balance already updated, non-fatal
      }
    }
  }

  // ── 3. Notify both parties ─────────────────────────────────────────────────
  const brandUserId = await loadBrandUserId(admin, brandId);
  const creatorUserId = await loadCreatorUserId(admin, creatorId);

  if (brandUserId) {
    await emitNotification(admin, {
      userId: brandUserId,
      type: "system",
      title: outcome === "refund" ? "Your dispute was resolved — refund issued" : "Your dispute was reviewed",
      body:
        outcome === "refund"
          ? `We resolved your dispute and credited ${refundedCredits} credit${refundedCredits === 1 ? "" : "s"} back to your account.${notes ? ` Note: ${notes}` : ""}`
          : `We reviewed your dispute and no further action was taken.${notes ? ` Note: ${notes}` : ""}`,
      href: "/brand/collabs",
    });
  }

  if (creatorUserId) {
    await emitNotification(admin, {
      userId: creatorUserId,
      type: "system",
      title: "A dispute on your generation was resolved",
      body:
        outcome === "refund"
          ? `A dispute involving one of your generations was resolved in the brand's favour (credit refund).${notes ? ` Note: ${notes}` : ""}`
          : `A dispute involving one of your generations was reviewed — no action taken.${notes ? ` Note: ${notes}` : ""}`,
      href: "/creator/collaborations",
    });
  }

  // ── 4. Audit ───────────────────────────────────────────────────────────────
  void logAudit({
    action: "dispute.resolve",
    sessionId: session.id,
    targetType: "dispute",
    targetId: disputeId,
    payload: {
      disputeId,
      generationId: dispute.generation_id,
      outcome,
      status: newStatus,
      brandId,
      creatorId,
      refundedCredits,
    },
  });

  revalidatePath(`/${ccSlug}/disputes`);
  revalidatePath(`/${ccSlug}/disputes/${disputeId}`);
}
