// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/tds-quarterly-reminder
//
// Daily check. Only runs on the 1st day of each quarter (Jan 1, Apr 1,
// Jul 1, Oct 1). Finds creators with TDS withheld in the prior quarter and
// inserts audit log entries (future: Form 16A email).
//
// Protected by CRON_SECRET bearer token.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/tds-quarterly-reminder] CRON_SECRET env var not set");
    return false;
  }
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`;
}

/** Returns true if today is the first day of a quarter. */
function isFirstDayOfQuarter(): boolean {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr, 6=Jul, 9=Oct
  const day = now.getDate();
  return [0, 3, 6, 9].includes(month) && day === 1;
}

/** Returns the prior quarter's date range as ISO strings. */
function getPriorQuarterRange(): { start: string; end: string } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Quarter of prior period
  const currentQuarterStart = month - (month % 3);
  const priorQuarterStart = currentQuarterStart - 3;

  let startYear = year;
  let startMonth = priorQuarterStart;

  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }

  const start = new Date(startYear, startMonth, 1).toISOString();
  const end = new Date(year, currentQuarterStart, 1).toISOString();

  return { start, end };
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isFirstDayOfQuarter()) {
    return NextResponse.json({ skipped: true });
  }

  const { start, end } = getPriorQuarterRange();
  const admin = createAdminClient() as any;

  // Find distinct creators who had TDS withheld in the prior quarter
  const { data: tdsRows, error: tdsErr } = await admin
    .from("tds_ledger")
    .select("creator_id, amount_paise")
    .gte("created_at", start)
    .lt("created_at", end);

  if (tdsErr) {
    console.error("[cron/tds-quarterly-reminder] tds_ledger query error:", tdsErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Group by creator_id
  const creatorTotals = new Map<string, number>();
  for (const row of (tdsRows ?? []) as { creator_id: string; amount_paise: number }[]) {
    creatorTotals.set(
      row.creator_id,
      (creatorTotals.get(row.creator_id) ?? 0) + row.amount_paise,
    );
  }

  let emailedCount = 0;

  for (const [creatorId, totalPaise] of creatorTotals) {
    // Insert audit_log entry (future: trigger email about Form 16A)
    await admin
      .from("audit_log")
      .insert({
        actor_type: "system",
        action: "tds_quarterly_reminder",
        resource_type: "creator",
        resource_id: creatorId,
        meta: {
          quarter_start: start,
          quarter_end: end,
          total_tds_paise: totalPaise,
          note: "Form 16A reminder — email delivery pending implementation",
        },
      })
      .catch((err: unknown) => {
        console.error(
          `[cron/tds-quarterly-reminder] audit log insert for creator ${creatorId}:`,
          err,
        );
      });

    emailedCount++;
  }

  console.log(
    `[cron/tds-quarterly-reminder] quarter=${start}–${end} emailed_count=${emailedCount}`,
  );

  return NextResponse.json({ ran: true, emailed_count: emailedCount });
}
