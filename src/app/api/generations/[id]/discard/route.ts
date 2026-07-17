/**
 * POST /api/generations/[id]/discard
 *
 * Brand action: image rejected at preview. A discarded gen must NOT consume a
 * paid package iteration — so we REFUND the single-pool credit that
 * /api/collabs/[id]/generate deducted at generate time.
 *
 * Atomic transition: ready_for_brand_review → discarded. The status guard on
 * the claim makes this idempotent — a second discard of an already-discarded
 * gen claims nothing and refunds nothing.
 *
 * Refund (mirrors generate-route deduction + run-generation refundCredit):
 *   1. brands.credits_remaining += 1   (global single-pool wallet)
 *   2. collab_sessions.gen_credits_used -= 1   (per-collab progress/cap counter)
 *   3. credit_transactions 'refund' row (audit ledger)
 *
 * Only collab gens (collab_session_id present) get the refund — the legacy
 * /api/campaigns/create path never deducted from this single pool.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  // The status guard is the idempotency lock — concurrent/duplicate discards
  // claim nothing, so the refund below runs at most once per gen.
  const { data: claimed, error: claimErr } = await admin
    .from("generations")
    .update({ status: "discarded" })
    .eq("id", id)
    .eq("brand_id", brand.id)
    .eq("status", "ready_for_brand_review")
    .select("id, brand_id, collab_session_id")
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

  const brandId = claimed.brand_id as string;
  const collabSessionId = claimed.collab_session_id as string | null;
  let creditRefunded = false;

  // ── Refund the single-pool iteration (collab gens only) ──
  // /api/collabs/[id]/generate deducted BOTH counters at generate time, so a
  // discard must restore BOTH. Best-effort — log + Sentry on failure, never
  // crash the discard (the status flip already succeeded).
  //
  // Uses the atomic add_credits_manual RPC (00038_admin_credit_rpcs.sql) —
  // a plain select-then-update here would lose an increment if a brand has
  // two generations discarded in quick succession, and writes the
  // credit_transactions ledger row with the correct column names
  // (amount_paise/balance_after_paise) plus built-in idempotency.
  if (collabSessionId) {
    try {
      // 1. Atomic credit refund + ledger row.
      await admin.rpc("add_credits_manual", {
        p_brand_id: brandId,
        p_credits: 1,
        p_bonus: 0,
        p_source: "brand_discard",
        p_reference_id: id,
      });

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

      creditRefunded = true;
    } catch (err) {
      // Soft fail — generation is discarded but refund needs manual reconcile.
      console.error(
        `[discard] credit refund failed for gen=${id}, manual reconcile needed`,
        err,
      );
      Sentry.captureException(err, {
        tags: { route: "generations/discard", phase: "credit_refund" },
        extra: {
          generation_id: id,
          brand_id: brandId,
          collab_session_id: collabSessionId,
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    status: "discarded",
    credit_refunded: creditRefunded,
  });
}
