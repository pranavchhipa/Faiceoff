// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payouts/list — paginated payout history for authenticated creator
// Query params: ?page=1&pageSize=20&status=requested|processing|success|failed
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPayouts, PayoutError } from "@/lib/payouts";
import type { PayoutStatus } from "@/lib/payouts";

const VALID_STATUSES: PayoutStatus[] = [
  "requested",
  "processing",
  "success",
  "failed",
  "reversed",
];

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;

  // ── Resolve creator ────────────────────────────────────────────────────────
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[payouts/list] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json({ error: "not_a_creator" }, { status: 403 });
  }

  // ── Parse query params ─────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20),
  );

  const statusParam = searchParams.get("status") as PayoutStatus | null;
  const status =
    statusParam && VALID_STATUSES.includes(statusParam)
      ? statusParam
      : undefined;

  // ── Fetch payouts ──────────────────────────────────────────────────────────
  try {
    const result = await listPayouts({
      creatorId: (creator as { id: string }).id,
      page,
      pageSize,
    });

    // Filter by status client-side if a valid status was provided.
    // listPayouts doesn't accept a status filter — apply post-fetch.
    const items = status
      ? result.payouts.filter((p) => p.status === status)
      : result.payouts;

    return NextResponse.json({
      items,
      total: status ? items.length : result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    if (err instanceof PayoutError) {
      console.error("[payouts/list] PayoutError", err.code, err.message);
      return NextResponse.json({ error: err.code }, { status: 500 });
    }
    console.error("[payouts/list] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
