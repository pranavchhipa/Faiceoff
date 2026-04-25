/**
 * POST /api/generations/[id]/send-for-approval
 *
 * Brand action: image looks good, send to creator for final approval.
 *
 * Atomic transition: ready_for_brand_review → ready_for_approval.
 * Inserts the approval row with 48h expiry from THIS moment (not from gen time).
 *
 * Idempotent — second call sees status != ready_for_brand_review and exits.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Verify brand ownership ──
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 403 });
  }

  // ── Atomic claim: only flip if currently ready_for_brand_review ──
  const { data: claimed, error: claimErr } = await admin
    .from("generations")
    .update({ status: "ready_for_approval" })
    .eq("id", id)
    .eq("brand_id", brand.id)
    .eq("status", "ready_for_brand_review")
    .select("id, creator_id, brand_id")
    .maybeSingle();

  if (claimErr) {
    Sentry.captureException(claimErr, {
      tags: { route: "generations/send-for-approval", phase: "claim" },
      extra: { generation_id: id, brand_id: brand.id },
    });
    return NextResponse.json(
      { error: "Failed to send for approval" },
      { status: 500 },
    );
  }

  if (!claimed) {
    // Already sent, doesn't exist, or wrong owner — return current state
    const { data: current } = await admin
      .from("generations")
      .select("status")
      .eq("id", id)
      .eq("brand_id", brand.id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: false,
      message: `Generation is in ${current.status}, cannot send for approval`,
      status: current.status,
    });
  }

  // ── Insert approval row (48h expiry from now) ──
  const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString();
  const { error: apprErr } = await admin.from("approvals").insert({
    generation_id: id,
    creator_id: claimed.creator_id,
    brand_id: claimed.brand_id,
    status: "pending",
    expires_at: expiresAt,
  });

  if (apprErr) {
    // Roll back the status flip so we don't have orphan ready_for_approval
    await admin
      .from("generations")
      .update({ status: "ready_for_brand_review" })
      .eq("id", id);
    Sentry.captureException(apprErr, {
      tags: { route: "generations/send-for-approval", phase: "approval_insert" },
      extra: { generation_id: id },
    });
    return NextResponse.json(
      { error: "Failed to create approval record" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "ready_for_approval",
    expires_at: expiresAt,
  });
}
