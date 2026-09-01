/**
 * GET /api/cron/auto-approve
 *
 * Vercel-scheduled cron — runs once daily (Vercel Hobby tier caps custom
 * crons at once/day — see vercel.json; was hourly before that constraint).
 * Practical effect: a creator's silent non-response can delay auto-approval
 * by up to ~24h instead of ~1h — acceptable on Hobby, revisit on Pro.
 * Finds approval rows where:
 *   • status = 'pending'
 *   • expires_at < now()
 * and runs the same flow as a creator-clicked approve: escrow credit,
 * license issuance.
 *
 * Why auto-approve (not auto-reject):
 *   The 48h window is creator's veto opportunity. Silence = consent. Brands
 *   need predictable delivery; we can't have campaigns hang forever because
 *   a creator went on vacation.
 *
 * Auth:
 *   Vercel cron jobs are called with header `Authorization: Bearer $CRON_SECRET`.
 *   We reject anything else so this isn't a public refund-creator-time DoS.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueLicense } from "@/lib/licenses";
import {
  PLATFORM_COMMISSION_RATE,
  GST_ON_COMMISSION_RATE,
} from "@/lib/billing";

export const runtime = "nodejs";
export const maxDuration = 60;

// Process at most this many in a single run so we never starve the function.
const BATCH_SIZE = 50;

export async function GET(req: Request) {
  // ── Auth: only Vercel cron OR explicit cron secret ──
  // Fails CLOSED. A missing CRON_SECRET used to skip this check entirely,
  // leaving the endpoint public — anyone could force-approve every expired
  // approval, moving creator shares into escrow and issuing licences.
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/auto-approve] CRON_SECRET env var not set — refusing to run");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  // ── Expire stale collab requests (72h TTL, no creator response) ──
  // The brand is never charged for an un-accepted request (payment happens only
  // after acceptance), so this is pure status hygiene — it clears the brand's
  // "pending" list and stops the creator from accepting a long-dead request.
  try {
    await admin
      .from("collab_requests")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", now);
  } catch (e) {
    console.warn("[cron/auto-approve] collab_requests expiry sweep failed", e);
  }

  // ── Recover generations stuck mid-pipeline (>30 min) ──
  // The Gemini path is synchronous (~1-2 min worst case). A crash between
  // claim and terminal status used to leave the row 'generating' FOREVER —
  // studio spinners never resolved and the deducted credit was never
  // returned. Flip to failed + refund; rollback RPC is idempotent.
  try {
    const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuck } = await admin
      .from("generations")
      .select("id, brand_id")
      .in("status", ["generating", "compliance_check", "output_check"])
      .lt("updated_at", stuckCutoff)
      .limit(50);
    for (const g of (stuck ?? []) as Array<{ id: string; brand_id: string }>) {
      const { data: flipped } = await admin
        .from("generations")
        .update({ status: "failed", updated_at: now })
        .eq("id", g.id)
        .in("status", ["generating", "compliance_check", "output_check"])
        .select("id")
        .maybeSingle();
      if (!flipped) continue; // finished/claimed in the meantime
      const { error: rbErr } = await admin.rpc("rollback_credit_for_generation", {
        p_brand_id: g.brand_id,
        p_generation_id: g.id,
      });
      if (rbErr) {
        console.error(
          `[cron/auto-approve] stuck-gen refund failed gen=${g.id}: ${rbErr.message}`,
        );
      } else {
        console.log(`[cron/auto-approve] recovered stuck gen=${g.id} (failed + refunded)`);
      }
    }
  } catch (e) {
    console.warn("[cron/auto-approve] stuck-generation sweep failed", e);
  }

  // ── Find expired pending approvals ──
  const { data: expired, error: queryErr } = await admin
    .from("approvals")
    .select(
      `
      id, generation_id, creator_id, brand_id, expires_at,
      generations!approvals_generation_id_fkey (
        id, brand_id, creator_id, cost_paise, structured_brief, status,
        collab_session_id
      )
      `,
    )
    .eq("status", "pending")
    .lt("expires_at", now)
    .limit(BATCH_SIZE);

  if (queryErr) {
    Sentry.captureException(queryErr, {
      tags: { route: "cron/auto-approve", phase: "query" },
    });
    return NextResponse.json(
      { ok: false, error: queryErr.message },
      { status: 500 },
    );
  }

  const candidates = expired ?? [];
  let processed = 0;
  const failures: string[] = [];

  for (const row of candidates) {
    const gen = row.generations as
      | {
          id: string;
          brand_id: string;
          creator_id: string;
          cost_paise: number;
          structured_brief: Record<string, unknown> | null;
          status: string;
          collab_session_id: string | null;
        }
      | null;
    if (!gen || gen.status !== "ready_for_approval") {
      // Out of sync — skip
      continue;
    }

    try {
      // 1. Atomically flip approval status (idempotency guard)
      const { data: claimed } = await admin
        .from("approvals")
        .update({
          status: "approved",
          decided_at: now,
          feedback: "Auto-approved after 48h window",
        })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) continue; // raced with creator action

      // 2. Generation status → approved
      await admin
        .from("generations")
        .update({ status: "approved", updated_at: now })
        .eq("id", gen.id);

      // 2b. Increment collab_sessions.approved_count + auto-complete —
      // mirrors the manual approve route. Without this, an auto-approved
      // final image left the collab 'active' forever with an undercounted
      // approved_count (state-machine hole).
      if (gen.collab_session_id) {
        try {
          const { data: sess } = await admin
            .from("collab_sessions")
            .select("approved_count, final_images_target, status")
            .eq("id", gen.collab_session_id)
            .maybeSingle();
          if (sess) {
            const newCount = (sess.approved_count ?? 0) + 1;
            const isComplete =
              sess.final_images_target && newCount >= sess.final_images_target;
            await admin
              .from("collab_sessions")
              .update({
                approved_count: newCount,
                ...(isComplete ? { status: "completed" } : {}),
              })
              .eq("id", gen.collab_session_id);
          }
        } catch (err) {
          console.error("[cron/auto-approve] approved_count increment failed", err);
        }
      }

      // 3. Escrow credit + platform revenue + license
      if (gen.cost_paise > 0) {
        const creatorShare = Math.round(
          gen.cost_paise * (1 - PLATFORM_COMMISSION_RATE),
        );
        const commission = Math.round(gen.cost_paise * PLATFORM_COMMISSION_RATE);
        const gst = Math.round(commission * GST_ON_COMMISSION_RATE);
        const holdingUntil = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        await admin.from("escrow_ledger").insert({
          creator_id: gen.creator_id,
          generation_id: gen.id,
          amount_paise: creatorShare,
          holding_until: holdingUntil,
          type: "release_per_image",
        });

        // 4. Platform revenue
        await admin.from("platform_revenue_ledger").insert({
          generation_id: gen.id,
          amount_paise: commission,
          gst_paise: gst,
          source: "auto_approval_commission",
        });

        // 5. License (best-effort)
        const brief = gen.structured_brief ?? {};
        const scope = (brief.scope as string) ?? "digital";
        const isExclusive = Boolean(brief.exclusive ?? false);
        try {
          await issueLicense({
            generationId: gen.id,
            brandId: gen.brand_id,
            creatorId: gen.creator_id,
            scope: scope as
              | "digital"
              | "digital_print"
              | "digital_print_packaging",
            isExclusive,
            amountPaidPaise: gen.cost_paise,
            creatorSharePaise: creatorShare,
            platformSharePaise: commission,
          });
        } catch (licenseErr) {
          // Non-fatal — license can be re-issued by admin
          Sentry.captureException(licenseErr, {
            tags: { route: "cron/auto-approve", phase: "license" },
            extra: { generation_id: gen.id },
          });
        }
      }
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${row.id}: ${msg}`);
      Sentry.captureException(err, {
        tags: { route: "cron/auto-approve", phase: "row" },
        extra: { approval_id: row.id, generation_id: gen.id },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    processed,
    failures,
  });
}
