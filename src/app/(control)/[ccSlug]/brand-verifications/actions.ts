"use server";

/**
 * Control Centre — brand verification operator actions.
 *
 * Re-verifies the CC session, runs with the admin client, writes an audit row,
 * and notifies the brand. Approve marks the brand verified (unblocks
 * collaborating with creators); reject records a reason the brand sees.
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

async function loadBrandUserId(admin: Admin, brandId: string): Promise<string | null> {
  const { data } = await admin
    .from("brands")
    .select("user_id")
    .eq("id", brandId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Approve → brand verified + notify. */
export async function approveBrandVerification(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const verificationId = String(formData.get("verification_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  if (!verificationId) return;

  const admin = createAdminClient() as Admin;

  const { data: ver } = await admin
    .from("brand_verifications")
    .select("id, brand_id, status")
    .eq("id", verificationId)
    .maybeSingle();
  if (!ver) return;

  const nowIso = new Date().toISOString();

  await admin
    .from("brand_verifications")
    .update({
      status: "verified",
      reviewed_by: session.id.slice(0, 12),
      reviewed_at: nowIso,
      rejection_reason: null,
      updated_at: nowIso,
    })
    .eq("id", verificationId);

  // Mark the brand verified — unblocks collaborating with creators.
  await admin
    .from("brands")
    .update({ is_verified: true })
    .eq("id", ver.brand_id);

  const userId = await loadBrandUserId(admin, ver.brand_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "Your brand is verified ✓",
      body: "Your brand is verified ✓ — you can now collaborate with creators.",
      href: "/brand/verify",
    });
  }

  void logAudit({
    action: "brand_verification.approve",
    sessionId: session.id,
    payload: { verificationId, brandId: ver.brand_id },
  });

  revalidatePath(`/${ccSlug}/brand-verifications`);
  revalidatePath(`/${ccSlug}/brand-verifications/${verificationId}`);
}

/** Reject → record reason + notify, leave is_verified false. */
export async function rejectBrandVerification(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const verificationId = String(formData.get("verification_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!verificationId) return;

  const admin = createAdminClient() as Admin;

  const { data: ver } = await admin
    .from("brand_verifications")
    .select("id, brand_id")
    .eq("id", verificationId)
    .maybeSingle();
  if (!ver) return;

  const nowIso = new Date().toISOString();

  await admin
    .from("brand_verifications")
    .update({
      status: "rejected",
      reviewed_by: session.id.slice(0, 12),
      reviewed_at: nowIso,
      rejection_reason: reason || "Business details could not be verified. Please resubmit accurate GST/PAN details.",
      updated_at: nowIso,
    })
    .eq("id", verificationId);

  // Roll verification back so the collab gate reflects the rejection.
  await admin
    .from("brands")
    .update({ is_verified: false })
    .eq("id", ver.brand_id);

  const userId = await loadBrandUserId(admin, ver.brand_id);
  if (userId) {
    await emitNotification(admin, {
      userId,
      type: "system",
      title: "Brand verification needs another look",
      body: reason || "Please re-check your GST/PAN and company details and resubmit.",
      href: "/brand/verify",
    });
  }

  void logAudit({
    action: "brand_verification.reject",
    sessionId: session.id,
    payload: { verificationId, brandId: ver.brand_id, reason },
  });

  revalidatePath(`/${ccSlug}/brand-verifications`);
  revalidatePath(`/${ccSlug}/brand-verifications/${verificationId}`);
}
