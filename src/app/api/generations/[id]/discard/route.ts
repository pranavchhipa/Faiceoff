/**
 * POST /api/generations/[id]/discard
 *
 * Brand action: image rejected at preview, full refund (decision Q2=A).
 *
 * Atomic transition: ready_for_brand_review → discarded.
 * Refunds the cost_paise via releaseReserve + rollbackCreditSafe (same path
 * the failure handler in run-generation.ts uses).
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve } from "@/lib/billing";

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
    .update({ status: "discarded" })
    .eq("id", id)
    .eq("brand_id", brand.id)
    .eq("status", "ready_for_brand_review")
    .select("id, brand_id, cost_paise")
    .maybeSingle();

  if (claimErr) {
    Sentry.captureException(claimErr, {
      tags: { route: "generations/discard", phase: "claim" },
      extra: { generation_id: id },
    });
    return NextResponse.json(
      { error: "Failed to discard" },
      { status: 500 },
    );
  }

  if (!claimed) {
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
      message: `Cannot discard — generation is in ${current.status}`,
      status: current.status,
    });
  }

  const cost = (claimed.cost_paise as number) ?? 0;
  let refunded = false;

  // ── Refund (Q2=A: full refund on discard) ──
  if (cost > 0) {
    try {
      await releaseReserve({
        brandId: claimed.brand_id as string,
        amountPaise: cost,
        generationId: id,
      });
      refunded = true;
    } catch (err) {
      // Soft fail — generation is discarded but refund needs manual reconcile.
      console.error(
        `[discard] releaseReserve failed for gen=${id}, manual reconcile needed`,
        err,
      );
      Sentry.captureException(err, {
        tags: { route: "generations/discard", phase: "release_reserve" },
        extra: { generation_id: id, brand_id: claimed.brand_id, cost },
      });
    }

    try {
      await admin.rpc("rollback_credit_for_generation", {
        p_brand_id: claimed.brand_id,
        p_generation_id: id,
      });
    } catch (err) {
      console.warn(
        `[discard] rollback_credit_for_generation RPC missing — manual reconcile gen=${id}`,
        err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    status: "discarded",
    refund_paise: refunded ? cost : 0,
  });
}
