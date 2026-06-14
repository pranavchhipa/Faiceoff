"use server";

/**
 * Control Centre — manual creator payout actions.
 *
 * Creators request a payout (creator_payouts row, status 'requested', with the
 * available escrow rows locked against it). An operator pays them via RazorpayX
 * manually, then marks it paid here (records the UTR). Rejecting releases the
 * locked escrow back to the creator's available balance.
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

async function loadCreatorUserId(admin: Admin, creatorId: string): Promise<string | null> {
  const { data } = await admin
    .from("creators")
    .select("user_id")
    .eq("id", creatorId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Mark a payout as paid (operator already transferred via RazorpayX). */
export async function markPayoutPaid(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const payoutId = String(formData.get("payout_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const utr = String(formData.get("utr") ?? "").trim();
  if (!payoutId) return;

  const admin = createAdminClient() as Admin;

  const { data: payout } = await admin
    .from("creator_payouts")
    .select("id, creator_id, net_amount_paise, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return;
  if (payout.status === "success") return; // idempotent

  const nowIso = new Date().toISOString();
  await admin
    .from("creator_payouts")
    .update({
      status: "success",
      cf_transfer_id: utr || null,
      completed_at: nowIso,
    })
    .eq("id", payoutId);

  // On success the escrow rows stay linked to this payout (permanently
  // consumed) so the creator's available balance does not include them again.

  const userId = await loadCreatorUserId(admin, payout.creator_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "Payout sent ✓",
      body: `₹${(payout.net_amount_paise / 100).toLocaleString("en-IN")} has been transferred to your bank${utr ? ` (UTR ${utr})` : ""}.`,
      href: "/creator/earnings",
    });
  }

  void logAudit({
    action: "payout.mark_paid",
    sessionId: session.id,
    payload: { payoutId, creatorId: payout.creator_id, utr },
  });

  revalidatePath(`/${ccSlug}/payouts`);
}

/** Reject a payout — release the locked escrow back to available. */
export async function rejectPayout(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const payoutId = String(formData.get("payout_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!payoutId) return;

  const admin = createAdminClient() as Admin;

  const { data: payout } = await admin
    .from("creator_payouts")
    .select("id, creator_id, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout || payout.status === "success") return;

  const nowIso = new Date().toISOString();
  await admin
    .from("creator_payouts")
    .update({
      status: "failed",
      failure_reason: reason || "Payout could not be processed. Please check your bank details.",
      completed_at: nowIso,
    })
    .eq("id", payoutId);

  // Release the locked escrow rows → funds return to the creator's available pot.
  await admin
    .from("escrow_ledger")
    .update({ payout_id: null })
    .eq("payout_id", payoutId);

  const userId = await loadCreatorUserId(admin, payout.creator_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "Payout could not be processed",
      body: reason || "Please check your bank details and request again.",
      href: "/creator/earnings",
    });
  }

  void logAudit({
    action: "payout.reject",
    sessionId: session.id,
    payload: { payoutId, creatorId: payout.creator_id, reason },
  });

  revalidatePath(`/${ccSlug}/payouts`);
}
