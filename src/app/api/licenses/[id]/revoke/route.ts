// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/revoke — creator revokes a license
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// Per spec: only creators can revoke licenses (not brands).
// Body: { reason: string }
//
// Calls `revokeLicense({ licenseId, reason, revokedByCreatorId })` which also
// validates that the calling creator is the one who licensed the generation.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeLicense, LicenseError } from "@/lib/licenses";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reason =
    typeof rawBody === "object" && rawBody !== null
      ? ((rawBody as { reason?: unknown }).reason as string | undefined)
      : undefined;

  if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
    return NextResponse.json(
      { error: "invalid_input", message: "`reason` (string, min 5 chars) is required" },
      { status: 400 },
    );
  }

  // ── 3. Resolve creator ───────────────────────────────────────────────────────
  const admin = createAdminClient() as any;
  const { data: creatorRow } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "creators_only" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // ── 4. Revoke via service (service validates creator ownership) ──────────────
  try {
    const updatedLicense = await revokeLicense({
      licenseId: id,
      reason: reason.trim(),
      revokedByCreatorId: creatorId,
    });

    return NextResponse.json({
      status: "revoked",
      revoked_at: updatedLicense.revoked_at,
    });
  } catch (err) {
    if (err instanceof LicenseError) {
      if (err.code === "LICENSE_NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (err.code === "REVOKE_FORBIDDEN") {
        return NextResponse.json(
          { error: "forbidden", message: err.message },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[licenses/[id]/revoke POST] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
