// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/list — paginated list of per-generation licenses
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE: This route is for the NEW `licenses` table (Chunk E, migration 00032).
// The OLD request-based system lives at /api/licenses/listings (plural).
// Do NOT confuse the two.
//
// Query params:
//   ?page=1         — 1-indexed page number (default 1)
//   ?pageSize=20    — items per page (default 20, max 100)
//   ?status=active|expired|revoked — filter by license status (optional)
//
// Access: brand or creator. Route detects which and calls the appropriate
// service function. Admins are not explicitly handled (no admin-only use case
// in the spec for this endpoint).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listBrandLicenses,
  listCreatorLicenses,
  LicenseError,
} from "@/lib/licenses";
import type { LicenseStatus } from "@/lib/licenses";

const VALID_STATUSES: LicenseStatus[] = ["active", "expired", "revoked"];

export async function GET(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve caller role (brand OR creator) ────────────────────────────────
  const admin = createAdminClient() as any;
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const brandId = (brandRes.data as { id?: string } | null)?.id;
  const creatorId = (creatorRes.data as { id?: string } | null)?.id;

  if (!brandId && !creatorId) {
    return NextResponse.json(
      { error: "forbidden", reason: "no_profile" },
      { status: 403 },
    );
  }

  // ── 3. Parse query params ────────────────────────────────────────────────────
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20),
  );
  const rawStatus = url.searchParams.get("status") ?? "";
  const status: LicenseStatus | undefined = VALID_STATUSES.includes(rawStatus as LicenseStatus)
    ? (rawStatus as LicenseStatus)
    : undefined;

  // ── 4. Call service based on role (brand takes precedence if user has both) ──
  try {
    if (brandId) {
      const result = await listBrandLicenses({ brandId, status, page, pageSize });
      return NextResponse.json({
        items: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    } else {
      // Creator path
      const result = await listCreatorLicenses({
        creatorId: creatorId!,
        status,
        page,
        pageSize,
      });
      return NextResponse.json({
        items: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    }
  } catch (err) {
    if (err instanceof LicenseError) {
      console.error("[licenses/list GET] service error", err.code, err.message);
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[licenses/list GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
