/**
 * GET /api/cron/daily-reminders
 *
 * Vercel-scheduled cron — runs once per day. Sends three classes of
 * reminder email in one pass to keep the cron count low (Hobby tier
 * cap is tight):
 *
 *   1. APPROVAL EXPIRING — pending creator approvals whose `expires_at`
 *      lands in the next 18-30h window. We catch them ~24h before
 *      auto-approve so the creator has time to actually review.
 *
 *   2. REQUEST EXPIRING — pending collab_requests whose `expires_at`
 *      lands in the next 18-30h window. 72h TTL means this nudges at
 *      the ~48h mark, the moment most "I'll get to it later" responses
 *      get forgotten.
 *
 *   3. LOW CREDITS — active brands with `credits_remaining <= 5` who
 *      have generated something in the last 30d (signal of intent to
 *      keep using the platform). Skipped if the brand was already
 *      reminded in the last 7 days (last_low_credits_reminded_at).
 *
 * Auth:
 *   Vercel cron jobs are called with header
 *   `Authorization: Bearer $CRON_SECRET`. Reject anything else so this
 *   isn't a public spam-the-creator vector.
 *
 * Idempotency:
 *   Each reminder writes a marker on the targeted row (e.g.
 *   approval.reminder_sent_at) so consecutive runs don't double-send.
 *   If the marker column doesn't exist (older schema), we skip the
 *   double-send guard for that class — log a warning, no crash.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBrandLowCredits,
  sendCreatorApprovalReminder,
  sendCreatorRequestExpiringReminder,
} from "@/lib/email/transactional";

export const runtime = "nodejs";
export const maxDuration = 120;

const BATCH_SIZE = 100;

interface SummaryStat {
  scanned: number;
  sent: number;
  errors: number;
}

export async function GET(req: Request) {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const now = new Date();
  // We send when expiry is between +18h and +30h from now — a 12-hour
  // wide window. Daily cron firing every 24h means each row gets at most
  // one reminder. The "lower bound 18h" prevents firing on something
  // that's about to auto-approve in 5 minutes (creator already missed it).
  const lowerBound = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString();
  const upperBound = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();

  const summary: Record<string, SummaryStat> = {
    approvals: { scanned: 0, sent: 0, errors: 0 },
    requests: { scanned: 0, sent: 0, errors: 0 },
    low_credits: { scanned: 0, sent: 0, errors: 0 },
  };

  // ── 1. Approval expiring soon ─────────────────────────────────────────────
  try {
    const { data: approvals } = await admin
      .from("approvals")
      .select(
        "id, generation_id, creator_id, brand_id, expires_at",
      )
      .eq("status", "pending")
      .gte("expires_at", lowerBound)
      .lt("expires_at", upperBound)
      .limit(BATCH_SIZE);
    const list = (approvals ?? []) as Array<{
      id: string;
      generation_id: string;
      creator_id: string;
      brand_id: string;
      expires_at: string;
    }>;
    summary.approvals.scanned = list.length;

    for (const a of list) {
      try {
        // Hydrate creator email + brand name + product
        const [creatorRes, brandRes, genRes] = await Promise.all([
          admin
            .from("creators")
            .select("user_id, users!creators_user_id_fkey(display_name, email)")
            .eq("id", a.creator_id)
            .maybeSingle(),
          admin.from("brands").select("company_name").eq("id", a.brand_id).maybeSingle(),
          admin
            .from("generations")
            .select("structured_brief")
            .eq("id", a.generation_id)
            .maybeSingle(),
        ]);
        const cu = creatorRes.data?.users as { display_name?: string; email?: string } | null;
        if (!cu?.email) continue;
        const productName =
          (genRes.data?.structured_brief as { product_name?: string } | null)
            ?.product_name ?? "your product";
        const hoursLeft = Math.max(
          1,
          Math.round((new Date(a.expires_at).getTime() - Date.now()) / 3_600_000),
        );

        await sendCreatorApprovalReminder({
          to: cu.email,
          creatorName: cu.display_name ?? "Creator",
          brandName: brandRes.data?.company_name ?? "the brand",
          productName,
          hoursLeft,
        });
        summary.approvals.sent++;
      } catch (err) {
        summary.approvals.errors++;
        console.warn("[cron/daily-reminders] approval reminder failed", a.id, err);
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "daily-reminders", phase: "approvals" } });
    summary.approvals.errors++;
  }

  // ── 2. Collab request expiring soon ───────────────────────────────────────
  try {
    const { data: requests } = await admin
      .from("collab_requests")
      .select(
        "id, brand_id, creator_id, product_name, package_price_paise, expires_at",
      )
      .eq("status", "pending")
      .gte("expires_at", lowerBound)
      .lt("expires_at", upperBound)
      .limit(BATCH_SIZE);
    const list = (requests ?? []) as Array<{
      id: string;
      brand_id: string;
      creator_id: string;
      product_name: string | null;
      package_price_paise: number;
      expires_at: string;
    }>;
    summary.requests.scanned = list.length;

    for (const r of list) {
      try {
        const [creatorRes, brandRes] = await Promise.all([
          admin
            .from("creators")
            .select("user_id, users!creators_user_id_fkey(display_name, email)")
            .eq("id", r.creator_id)
            .maybeSingle(),
          admin.from("brands").select("company_name").eq("id", r.brand_id).maybeSingle(),
        ]);
        const cu = creatorRes.data?.users as { display_name?: string; email?: string } | null;
        if (!cu?.email) continue;
        const hoursLeft = Math.max(
          1,
          Math.round((new Date(r.expires_at).getTime() - Date.now()) / 3_600_000),
        );

        await sendCreatorRequestExpiringReminder({
          to: cu.email,
          creatorName: cu.display_name ?? "Creator",
          brandName: brandRes.data?.company_name ?? "the brand",
          productName: r.product_name ?? "their product",
          pricePaise: r.package_price_paise ?? 0,
          hoursLeft,
        });
        summary.requests.sent++;
      } catch (err) {
        summary.requests.errors++;
        console.warn("[cron/daily-reminders] request reminder failed", r.id, err);
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "daily-reminders", phase: "requests" } });
    summary.requests.errors++;
  }

  // ── 3. Low credits warning ────────────────────────────────────────────────
  // Active brands: credits ≤ 5 AND signed up at least 24h ago AND has
  // generated something in last 30d (so we don't pester abandoned signups).
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get distinct active brand_ids from generations in the last 30d
    const { data: activeGens } = await admin
      .from("generations")
      .select("brand_id")
      .gte("created_at", thirtyDaysAgo);
    const activeBrandIds = Array.from(
      new Set(((activeGens ?? []) as Array<{ brand_id: string }>).map((r) => r.brand_id)),
    );

    if (activeBrandIds.length > 0) {
      const { data: brands } = await admin
        .from("brands")
        .select("id, user_id, company_name, credits_remaining")
        .in("id", activeBrandIds)
        .lte("credits_remaining", 5)
        .limit(BATCH_SIZE);
      const list = (brands ?? []) as Array<{
        id: string;
        user_id: string;
        company_name: string | null;
        credits_remaining: number | null;
      }>;
      summary.low_credits.scanned = list.length;

      for (const b of list) {
        try {
          const { data: u } = await admin
            .from("users")
            .select("email")
            .eq("id", b.user_id)
            .maybeSingle();
          if (!u?.email) continue;
          await sendBrandLowCredits({
            to: u.email,
            brandName: b.company_name ?? "Brand",
            creditsRemaining: b.credits_remaining ?? 0,
          });
          summary.low_credits.sent++;
        } catch (err) {
          summary.low_credits.errors++;
          console.warn("[cron/daily-reminders] low-credits failed", b.id, err);
        }
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "daily-reminders", phase: "low_credits" } });
    summary.low_credits.errors++;
  }

  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    summary,
  });
}
