// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verify/agreement/[id] — public Collaboration Agreement verification.
//
// PUBLIC endpoint — no authentication. Returns zero-PII agreement status for
// the public verify page + QR codes embedded in agreement PDFs. CDN-cached 60s.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { getPublicAgreementStatus } from "@/lib/agreements";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const status = await getPublicAgreementStatus(id);
    if (!status) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(status, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    console.error("[verify/agreement GET] error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
