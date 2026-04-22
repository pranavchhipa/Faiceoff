// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vault — paginated list of brand's licensed generations (the vault)
// Task E13 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// Query params:
//   ?page=1         — 1-indexed page number (default 1)
//   ?pageSize=20    — items per page (default 20, max 100)
//   ?status=all|approved|pending|rejected (default 'all')
//   ?q=...          — free-text search in generation brief
//
// Access: brand users only (403 if no brands row for the authed user).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVaultImages, VaultError } from "@/lib/vault";

type VaultStatusFilter = "all" | "approved" | "pending" | "rejected";

const VALID_STATUSES: VaultStatusFilter[] = ["all", "approved", "pending", "rejected"];

export async function GET(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve brand ─────────────────────────────────────────────────────────
  const admin = createAdminClient() as any;
  const { data: brandRow } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brandRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "brands_only" },
      { status: 403 },
    );
  }
  const brandId = (brandRow as { id: string }).id;

  // ── 3. Parse query params ────────────────────────────────────────────────────
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20),
  );
  const rawStatus = url.searchParams.get("status") ?? "all";
  const status: VaultStatusFilter = VALID_STATUSES.includes(rawStatus as VaultStatusFilter)
    ? (rawStatus as VaultStatusFilter)
    : "all";
  const query = url.searchParams.get("q") ?? undefined;

  // ── 4. Call service ──────────────────────────────────────────────────────────
  try {
    const result = await listVaultImages({ brandId, page, pageSize, status, search: query });
    return NextResponse.json({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    if (err instanceof VaultError) {
      console.error("[vault GET] service error", err.code, err.message);
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 500 },
      );
    }
    console.error("[vault GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
