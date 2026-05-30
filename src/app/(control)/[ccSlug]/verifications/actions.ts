"use server";

/**
 * Control Centre — creator verification operator actions.
 *
 * Re-verifies the CC session, runs with the admin client, writes an audit row,
 * and notifies the creator. Approve sets the gold tick + unlocks payouts;
 * reject records a reason the creator sees on /creator/verify.
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

/** Approve → gold tick + KYC verified + notify. */
export async function approveVerification(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const verificationId = String(formData.get("verification_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  if (!verificationId) return;

  const admin = createAdminClient() as Admin;

  const { data: ver } = await admin
    .from("creator_verifications")
    .select("id, creator_id, status")
    .eq("id", verificationId)
    .maybeSingle();
  if (!ver) return;

  const nowIso = new Date().toISOString();

  await admin
    .from("creator_verifications")
    .update({
      status: "verified",
      reviewed_by: session.id.slice(0, 12),
      reviewed_at: nowIso,
      rejection_reason: null,
      updated_at: nowIso,
    })
    .eq("id", verificationId);

  // Gold tick + unlock payouts.
  await admin
    .from("creators")
    .update({ is_verified: true, kyc_status: "verified" })
    .eq("id", ver.creator_id);

  const userId = await loadCreatorUserId(admin, ver.creator_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "You're verified ✓",
      body: "Your gold tick is live. You now stand out in discovery and can withdraw earnings.",
      href: "/creator/verify",
    });
  }

  void logAudit({
    action: "verification.approve",
    sessionId: session.id,
    payload: { verificationId, creatorId: ver.creator_id },
  });

  revalidatePath(`/${ccSlug}/verifications`);
  revalidatePath(`/${ccSlug}/verifications/${verificationId}`);
}

/** Reject → record reason + notify, leave is_verified false. */
export async function rejectVerification(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const verificationId = String(formData.get("verification_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!verificationId) return;

  const admin = createAdminClient() as Admin;

  const { data: ver } = await admin
    .from("creator_verifications")
    .select("id, creator_id")
    .eq("id", verificationId)
    .maybeSingle();
  if (!ver) return;

  const nowIso = new Date().toISOString();

  await admin
    .from("creator_verifications")
    .update({
      status: "rejected",
      reviewed_by: session.id.slice(0, 12),
      reviewed_at: nowIso,
      rejection_reason: reason || "Documents could not be verified. Please resubmit clear copies.",
      updated_at: nowIso,
    })
    .eq("id", verificationId);

  // Roll KYC back so the payout gate reflects the rejection.
  await admin
    .from("creators")
    .update({ is_verified: false, kyc_status: "rejected" })
    .eq("id", ver.creator_id);

  const userId = await loadCreatorUserId(admin, ver.creator_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "Verification needs another look",
      body: reason || "Please re-check your documents and resubmit.",
      href: "/creator/verify",
    });
  }

  void logAudit({
    action: "verification.reject",
    sessionId: session.id,
    payload: { verificationId, creatorId: ver.creator_id, reason },
  });

  revalidatePath(`/${ccSlug}/verifications`);
  revalidatePath(`/${ccSlug}/verifications/${verificationId}`);
}
