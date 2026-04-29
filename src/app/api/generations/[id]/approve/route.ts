/**
 * POST /api/generations/[id]/approve
 *
 * Creator action: approve or reject an image they've been asked to license.
 *
 * On APPROVE:
 *   1. Atomic status flip: ready_for_approval → approved
 *   2. Stamp approvals row (status, decided_at, feedback)
 *   3. spendWallet — move brand's reserved ₹ → spent (audit row written by RPC)
 *   4. Credit creator's escrow ledger (their share after platform commission)
 *
 * On REJECT:
 *   1. Atomic status flip: ready_for_approval → rejected
 *   2. Stamp approvals row
 *   3. releaseReserve — unlock brand's wallet ₹
 *   4. Refund 1 credit to brand
 *
 * Both paths are idempotent — second call sees status != ready_for_approval.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spendWallet, releaseReserve } from "@/lib/billing";

// Platform commission (creator gets 1 - this).
// Surface as env var so it can be tuned without redeploy.
const PLATFORM_COMMISSION =
  Number(process.env.PLATFORM_COMMISSION ?? "0.30") || 0.3;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: generationId } = await params;

  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Validate body ──
  let body: { action?: string; feedback?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, feedback } = body;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Verify creator owns this generation ──
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 403 },
    );
  }

  const targetStatus = action === "approve" ? "approved" : "rejected";

  // ── Atomic status flip — only proceeds if currently ready_for_approval ──
  const { data: claimed, error: claimErr } = await admin
    .from("generations")
    .update({ status: targetStatus })
    .eq("id", generationId)
    .eq("creator_id", creator.id)
    .eq("status", "ready_for_approval")
    .select(
      "id, brand_id, creator_id, cost_paise, structured_brief, image_url",
    )
    .maybeSingle();

  if (claimErr) {
    Sentry.captureException(claimErr, {
      tags: { route: "generations/approve", phase: "claim" },
      extra: { generation_id: generationId, action },
    });
    return NextResponse.json(
      { error: "Failed to update generation" },
      { status: 500 },
    );
  }

  if (!claimed) {
    // Either already decided, doesn't exist, or wrong owner — return current
    const { data: cur } = await admin
      .from("generations")
      .select("status")
      .eq("id", generationId)
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (!cur) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: false,
      message: `Generation is in ${cur.status}, cannot ${action}`,
      status: cur.status,
    });
  }

  const brandId = claimed.brand_id as string;
  const costPaise = (claimed.cost_paise as number) ?? 0;
  const now = new Date().toISOString();

  // ── Update approval row ──
  await admin
    .from("approvals")
    .update({
      status: targetStatus === "approved" ? "approved" : "rejected",
      feedback: feedback ?? null,
      decided_at: now,
    })
    .eq("generation_id", generationId)
    .eq("creator_id", creator.id);

  // ── Money flow ──
  if (action === "approve") {
    if (costPaise > 0) {
      try {
        await spendWallet({ brandId, amountPaise: costPaise, generationId });
      } catch (spendErr) {
        // Hard fail: status is already 'approved' but wallet didn't spend.
        // Capture for manual reconcile — do NOT roll back the approval since
        // the creator has already consented to the image being released.
        console.error(
          `[approve] spendWallet failed gen=${generationId}, manual reconcile needed`,
          spendErr,
        );
        Sentry.captureException(spendErr, {
          tags: { route: "generations/approve", phase: "spend_wallet" },
          extra: { generation_id: generationId, brand_id: brandId, costPaise },
        });
      }

      // Credit creator's escrow with their share (best-effort).
      try {
        const creatorShare = Math.round(
          costPaise * (1 - PLATFORM_COMMISSION),
        );
        const platformCut = costPaise - creatorShare;
        await admin.from("escrow_ledger").insert({
          creator_id: creator.id,
          brand_id: brandId,
          generation_id: generationId,
          type: "earn",
          amount_paise: creatorShare,
          metadata: {
            platform_cut_paise: platformCut,
            commission_pct: PLATFORM_COMMISSION,
          },
        });
      } catch (escrowErr) {
        console.warn(
          `[approve] escrow_ledger insert failed gen=${generationId}`,
          escrowErr,
        );
        Sentry.captureException(escrowErr, {
          tags: { route: "generations/approve", phase: "escrow_credit" },
          extra: { generation_id: generationId },
        });
      }
    }
    return NextResponse.json({ status: "approved" });
  }

  // ── Reject path: refund brand ──
  if (costPaise > 0) {
    try {
      await releaseReserve({
        brandId,
        amountPaise: costPaise,
        generationId,
      });
    } catch (releaseErr) {
      console.error(
        `[approve/reject] releaseReserve failed gen=${generationId}`,
        releaseErr,
      );
      Sentry.captureException(releaseErr, {
        tags: { route: "generations/approve", phase: "release_reserve" },
        extra: { generation_id: generationId, brand_id: brandId, costPaise },
      });
    }
  }

  // Refund the credit (best-effort RPC — if missing, manual reconcile)
  try {
    await admin.rpc("rollback_credit_for_generation", {
      p_brand_id: brandId,
      p_generation_id: generationId,
    });
  } catch (creditErr) {
    console.warn(
      `[approve/reject] rollback_credit_for_generation failed gen=${generationId}`,
      creditErr,
    );
  }

  return NextResponse.json({ status: "rejected" });
}
