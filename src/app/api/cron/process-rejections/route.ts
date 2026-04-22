// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/process-rejections
//
// Every-15-min cron. Processes side effects of auto-rejected approvals.
//
// The pg_cron function `auto_reject_expired_approvals` flips approval.status
// to 'auto_rejected'. This cron does the financial side effects:
//   1. Find auto_rejected approvals that haven't been refunded yet
//   2. Release brand's wallet reserve
//   3. Mark approval as processed (decided_at)
//
// Idempotency: only processes approvals where the corresponding generation
// hasn't already been refunded (checked via wallet_transactions).
//
// Protected by CRON_SECRET bearer token.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve, BillingError } from "@/lib/billing";

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/process-rejections] CRON_SECRET env var not set");
    return false;
  }
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`;
}

interface ApprovalRow {
  id: string;
  generation_id: string;
  status: string;
  decided_at: string | null;
}

interface GenerationRow {
  id: string;
  brand_id: string;
  cost_paise: number;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;

  // Fetch auto_rejected approvals that have not been decided (decided_at IS NULL)
  // as a proxy for "not yet processed by this cron"
  const { data: approvals, error: appErr } = await admin
    .from("approvals")
    .select("id, generation_id, status, decided_at")
    .eq("status", "auto_rejected")
    .is("decided_at", null)
    .order("updated_at", { ascending: true })
    .limit(100);

  if (appErr) {
    console.error("[cron/process-rejections] approvals query error:", appErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (approvals ?? []) as ApprovalRow[];

  let processed = 0;
  let refundedTotalPaise = 0;

  for (const approval of rows) {
    // Fetch generation to get brand_id and cost
    const { data: gen } = await admin
      .from("generations")
      .select("id, brand_id, cost_paise")
      .eq("id", approval.generation_id)
      .maybeSingle() as { data: GenerationRow | null };

    if (!gen) {
      console.warn(
        `[cron/process-rejections] no generation for approval ${approval.id} (gen_id=${approval.generation_id})`,
      );
      // Still mark decided so we don't retry
      await admin
        .from("approvals")
        .update({ decided_at: new Date().toISOString() })
        .eq("id", approval.id);
      processed++;
      continue;
    }

    // Idempotency: check if wallet already has an escrow_release for this generation
    const { data: existingRefund } = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_id", gen.id)
      .eq("type", "escrow_release")
      .maybeSingle();

    if (existingRefund) {
      // Already refunded — just mark decided
      await admin
        .from("approvals")
        .update({
          decided_at: new Date().toISOString(),
          feedback: "Auto-rejected after 48h",
        })
        .eq("id", approval.id);
      processed++;
      continue;
    }

    // Release wallet reserve
    if (gen.brand_id && gen.cost_paise) {
      try {
        await releaseReserve({
          brandId: gen.brand_id,
          amountPaise: gen.cost_paise,
          generationId: gen.id,
        });
        refundedTotalPaise += gen.cost_paise;
      } catch (err) {
        if (err instanceof BillingError) {
          // Might already be released — log and continue
          console.warn(
            `[cron/process-rejections] releaseReserve billing warn for approval ${approval.id}:`,
            err.message,
          );
        } else {
          console.error(
            `[cron/process-rejections] releaseReserve error for approval ${approval.id}:`,
            err,
          );
          // Skip marking as processed — will retry next tick
          continue;
        }
      }
    }

    // Mark approval as processed
    await admin
      .from("approvals")
      .update({
        decided_at: new Date().toISOString(),
        feedback: "Auto-rejected after 48h",
      })
      .eq("id", approval.id)
      .catch((err: unknown) => {
        console.error(
          `[cron/process-rejections] approval update error for ${approval.id}:`,
          err,
        );
      });

    processed++;
  }

  console.log(
    `[cron/process-rejections] processed=${processed} refunded_total_paise=${refundedTotalPaise}`,
  );

  return NextResponse.json({ processed, refunded_total_paise: refundedTotalPaise });
}
