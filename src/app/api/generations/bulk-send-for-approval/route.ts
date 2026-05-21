/**
 * POST /api/generations/bulk-send-for-approval
 *
 * Brand action: send multiple ready_for_brand_review images to the creator
 * for approval in one shot. Body: { generation_ids: string[] }.
 *
 * For each gen the brand owns AND that is currently ready_for_brand_review:
 *   - flip status → ready_for_approval
 *   - insert an approval row (48h expiry from now)
 * Then send ONE summary email to the creator (not one per image).
 *
 * Returns { sent, skipped, total } so the UI can report partial success.
 */

import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCreatorApprovalRequest } from "@/lib/email/transactional";
import { emitNotification } from "@/lib/notifications/emit";

const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { generation_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.generation_ids) || body.generation_ids.length === 0) {
    return NextResponse.json({ error: "generation_ids required" }, { status: 400 });
  }
  const ids = body.generation_ids.filter(
    (x): x is string => typeof x === "string",
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid generation ids" }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 403 });
  }

  // Load the candidate gens that this brand owns + are in review state.
  const { data: candidates } = await admin
    .from("generations")
    .select("id, creator_id, brand_id, status, collab_session_id")
    .in("id", ids)
    .eq("brand_id", brand.id)
    .eq("status", "ready_for_brand_review");

  const eligible = (candidates ?? []) as Array<{
    id: string;
    creator_id: string;
    brand_id: string;
    collab_session_id: string | null;
  }>;

  if (eligible.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: ids.length,
      total: ids.length,
      message: "No images were in a sendable state.",
    });
  }

  const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString();
  let sent = 0;
  const sentGenIds: string[] = [];
  let creatorId: string | null = null;

  for (const gen of eligible) {
    // Atomic flip per gen (guards against races / double-send)
    const { data: claimed } = await admin
      .from("generations")
      .update({ status: "ready_for_approval" })
      .eq("id", gen.id)
      .eq("brand_id", brand.id)
      .eq("status", "ready_for_brand_review")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { error: apprErr } = await admin.from("approvals").insert({
      generation_id: gen.id,
      creator_id: gen.creator_id,
      brand_id: gen.brand_id,
      status: "pending",
      expires_at: expiresAt,
    });
    if (apprErr) {
      // Roll back the flip for this gen and skip
      await admin
        .from("generations")
        .update({ status: "ready_for_brand_review" })
        .eq("id", gen.id);
      Sentry.captureException(apprErr, {
        tags: { route: "generations/bulk-send-for-approval", phase: "approval_insert" },
        extra: { generation_id: gen.id },
      });
      continue;
    }
    sent += 1;
    sentGenIds.push(gen.id);
    creatorId = gen.creator_id;
  }

  // Notify creator — one email + one in-app notification summarizing the batch.
  if (sent > 0 && creatorId) {
    after(async () => {
      try {
        const { data: creatorRow } = await admin
          .from("creators")
          .select("user_id")
          .eq("id", creatorId)
          .maybeSingle();
        const { data: brandRow } = await admin
          .from("brands")
          .select("company_name")
          .eq("id", brand.id)
          .maybeSingle();
        const creatorUserId = creatorRow?.user_id as string | undefined;
        const brandName = brandRow?.company_name ?? "A brand";

        if (creatorUserId) {
          // In-app notification
          await emitNotification(admin, {
            userId: creatorUserId,
            type: "approval_requested",
            title: `${sent} image${sent > 1 ? "s" : ""} need your approval`,
            body: `${brandName} sent ${sent} image${sent > 1 ? "s" : ""} for your review.`,
            href: "/creator/approvals",
          });

          // Email (best-effort, single summary)
          const { data: cu } = await admin
            .from("users")
            .select("email, display_name")
            .eq("id", creatorUserId)
            .maybeSingle();
          if (cu?.email) {
            await sendCreatorApprovalRequest({
              to: cu.email,
              creatorName: cu.display_name ?? "creator",
              brandName,
              productName: `${sent} new image${sent > 1 ? "s" : ""}`,
              generationId: sentGenIds[0],
              expiresInHours: 48,
            });
          }
        }
      } catch (err) {
        console.warn("[bulk-send-for-approval] notify failed", err);
      }
    });
  }

  return NextResponse.json({
    sent,
    skipped: ids.length - sent,
    total: ids.length,
    status: "ready_for_approval",
  });
}
