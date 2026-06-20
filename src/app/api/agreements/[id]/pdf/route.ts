import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { regenerateAgreementPDF, normalizeAgreementUrl } from "@/lib/agreements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/agreements/[id]/pdf — redirect to the signed Collaboration Agreement
// PDF in R2. Party-gated. If the PDF hasn't been rendered yet (rare — render is
// deferred at payment), regenerate it on demand before redirecting.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: row } = await admin
    .from("collab_agreements")
    .select("id, brand_id, creator_id, status, pdf_url")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Authorize.
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isBrand = brandRes.data?.id === row.brand_id;
  const isCreator = creatorRes.data?.id === row.creator_id;
  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // The PDF only exists once both parties have signed (status active).
  if (row.status !== "active") {
    return NextResponse.json(
      { error: "not_ready", message: "The agreement is awaiting the brand's signature." },
      { status: 409 },
    );
  }

  let url = normalizeAgreementUrl(row.pdf_url, row.id);
  if (!url) {
    // Deferred render hasn't completed (or failed) — generate on demand.
    url = await regenerateAgreementPDF(admin, row.id);
  }
  if (!url) {
    return NextResponse.json(
      { error: "pdf_unavailable", message: "Couldn't produce the agreement PDF. Try again shortly." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(url);
}
