/**
 * GET /api/cron/auto-approve
 *
 * Vercel-scheduled cron — runs every hour. Finds approval rows where:
 *   • status = 'pending'
 *   • expires_at < now()
 * and runs the same flow as a creator-clicked approve: spendWallet, escrow
 * credit, license issuance.
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
import { spendWallet } from "@/lib/billing";
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
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  // ── Find expired pending approvals ──
  const { data: expired, error: queryErr } = await admin
    .from("approvals")
    .select(
      `
      id, generation_id, creator_id, brand_id, expires_at,
      generations!approvals_generation_id_fkey (
        id, brand_id, creator_id, cost_paise, structured_brief, status
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

      // 3. Spend wallet
      if (gen.cost_paise > 0) {
        await spendWallet({
          brandId: gen.brand_id,
          amountPaise: gen.cost_paise,
          generationId: gen.id,
        });

        // 4. Escrow credit
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

        // 5. Platform revenue
        await admin.from("platform_revenue_ledger").insert({
          generation_id: gen.id,
          amount_paise: commission,
          gst_paise: gst,
          source: "auto_approval_commission",
        });

        // 6. License (best-effort)
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
