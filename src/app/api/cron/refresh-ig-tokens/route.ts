import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCreatorInstagram } from "@/lib/instagram/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * GET /api/cron/refresh-ig-tokens
 *
 * Daily cron that:
 *   1. Finds all connected creators (instagram_verified = true)
 *   2. Refreshes long-lived tokens that expire within 14 days
 *   3. Resyncs profile + insights for every connected creator
 *
 * Auth: Bearer token must match CRON_SECRET env var (Vercel-supplied).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: creators, error } = await admin
    .from("creators")
    .select(
      "id, instagram_user_id, instagram_access_token, instagram_token_expires_at, instagram_verified",
    )
    .eq("instagram_verified", true);

  if (error) {
    console.error("[cron/refresh-ig-tokens] query failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    creator_id: string;
    ok: boolean;
    refreshed?: boolean;
    error?: string;
  }> = [];

  // Process serially to avoid hammering Meta's API. The total set is small
  // (one row per connected creator). If this grows past ~100 we can batch.
  for (const c of creators ?? []) {
    try {
      const r = await syncCreatorInstagram(admin, c, {
        refreshIfWithinDays: 14,
      });
      results.push({
        creator_id: c.id,
        ok: r.ok,
        refreshed: r.tokenRefreshed,
        error: r.error,
      });
    } catch (err) {
      results.push({
        creator_id: c.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    refreshed: results.filter((r) => r.refreshed).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
