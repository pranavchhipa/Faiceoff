// ─────────────────────────────────────────────────────────────────────────────
// expire-licenses — daily cron, 1 AM IST
// Ref plan Task 30
// ─────────────────────────────────────────────────────────────────────────────
//
// Scans license_requests where status='active' AND expires_at < now(). For
// each, calls the commit_expiry_refund PL/pgSQL procedure (migration 00029)
// which:
//   • Calculates remaining slots × release_per_image_paise + residual
//   • Refunds that amount to the brand's credits balance via credit_transactions
//   • Transitions license_requests.status → 'expired'
//
// Design:
//   • Errors in one refund must NOT crash the whole job. We collect errors,
//     log at end, and the cron returns cleanly. Inngest retries only on a
//     thrown exception, which we deliberately avoid for partial failures.
//   • Each refund is its own `step.run(...)`. Inngest makes each step durable
//     + individually retryable, and the function-level `retries: 3` applies
//     only to the fetch step itself.
//   • Cap at 500 expired rows per run. Pathological backlog of expired
//     licenses won't hammer the DB in a single run — the next tick 24h later
//     catches the rest. In steady state we expect <10 per day.
//
// CRON TIMEZONE NOTE: Inngest crons run in UTC by default (there is no way
// to specify a timezone in the function definition as of v4). For 1 AM IST
// (UTC+5:30), the cron string must be `30 19 * * *` — 7:30 PM UTC the
// previous day. If the Inngest dashboard / env ever exposes a timezone
// override, this can be simplified back to `0 1 * * *`. Do NOT change the
// schedule without verifying the dashboard "Next scheduled run" matches
// what you expect in Asia/Kolkata.
// ─────────────────────────────────────────────────────────────────────────────

import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_EXPIRIES_PER_RUN = 500;

// ── Narrowed admin shape ────────────────────────────────────────────────────

export interface ExpireLicensesAdmin {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        lt(col: string, val: string): {
          limit(n: number): Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  rpc(
    name: "commit_expiry_refund",
    params: { p_license_request_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

// Minimal subset of Inngest's `step` object we actually use. Lets tests pass
// a trivial passthrough without pulling in the Inngest runtime.
export interface MinimalStep {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

export interface MinimalLogger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export interface ExpireLicensesResult {
  expired_count: number;
  refunded: number;
  errors: Array<{ id: string; error: string }>;
}

// ── Core logic (pure — testable without Inngest runtime) ────────────────────

/**
 * Fetch + refund loop. Extracted so tests can exercise this without building
 * a fake Inngest function environment.
 */
export async function runExpireLicenses(args: {
  admin: ExpireLicensesAdmin;
  step: MinimalStep;
  logger: MinimalLogger;
  now?: () => Date;
}): Promise<ExpireLicensesResult> {
  const { admin, step, logger } = args;
  const now = args.now ?? (() => new Date());

  const expired = await step.run("fetch-expired", async () => {
    const { data, error } = await admin
      .from("license_requests")
      .select("id")
      .eq("status", "active")
      .lt("expires_at", now().toISOString())
      .limit(MAX_EXPIRIES_PER_RUN);
    if (error) throw new Error(`fetch-expired failed: ${error.message}`);
    return data ?? [];
  });

  if (expired.length === 0) {
    logger.info("[expire-licenses] No expired licenses to refund");
    return { expired_count: 0, refunded: 0, errors: [] };
  }

  logger.info(`[expire-licenses] Found ${expired.length} expired license(s)`);

  let refunded = 0;
  const errors: Array<{ id: string; error: string }> = [];

  // Each refund is its own step.run → Inngest persists progress so a later
  // crash doesn't re-refund the ones that already succeeded.
  for (const row of expired) {
    try {
      await step.run(`refund-${row.id}`, async () => {
        const { error } = await admin.rpc("commit_expiry_refund", {
          p_license_request_id: row.id,
        });
        if (error) {
          throw new Error(
            `commit_expiry_refund failed for ${row.id}: ${error.message}`,
          );
        }
      });
      refunded += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ id: row.id, error: message });
      // Continue — one bad row shouldn't block the others. Inngest's retry
      // machinery already fired inside step.run for transient errors.
    }
  }

  if (errors.length > 0) {
    logger.error(
      `[expire-licenses] ${errors.length} refund(s) failed out of ${expired.length}`,
      { errors },
    );
  }

  return { expired_count: expired.length, refunded, errors };
}

// ── Inngest registration ─────────────────────────────────────────────────────

export const expireLicenses = inngest.createFunction(
  {
    id: "license/expire-licenses",
    retries: 3,
    // 1 AM IST = 7:30 PM UTC the previous day. Inngest crons are UTC-only.
    // See module-level TIMEZONE NOTE above.
    triggers: [{ cron: "30 19 * * *" }],
  },
  async ({ step, logger }) => {
    const admin = createAdminClient() as unknown as ExpireLicensesAdmin;
    return runExpireLicenses({
      admin,
      step: step as unknown as MinimalStep,
      logger: logger as unknown as MinimalLogger,
    });
  },
);
