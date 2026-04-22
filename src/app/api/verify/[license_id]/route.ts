// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verify/[license_id] — public license verification (no auth)
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// PUBLIC endpoint — no authentication required.
// Returns zero-PII license status for public certificate verification.
// Links from QR codes embedded in license PDFs.
//
// Response is cached at the CDN level for 60 seconds (Cache-Control header).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { getPublicLicenseStatus, LicenseError } from "@/lib/licenses";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ license_id: string }> },
) {
  const { license_id } = await ctx.params;

  try {
    const status = await getPublicLicenseStatus(license_id);

    return NextResponse.json(status, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    if (err instanceof LicenseError) {
      if (err.code === "LICENSE_NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      console.error("[verify/[license_id] GET] service error", err.code, err.message);
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[verify/[license_id] GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
