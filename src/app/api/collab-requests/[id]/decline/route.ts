import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/observability/analytics";
import { sendBrandRequestDeclined } from "@/lib/email/transactional";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/collab-requests/[id]/decline — creator declines request
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  let body: { reason?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  const { data: req } = await admin
    .from("collab_requests")
    .select("id, status, brand_id, creator_id, package_tier, product_name")
    .eq("id", id)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.creator_id !== creator.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${req.status}` }, { status: 400 });
  }

  await admin
    .from("collab_requests")
    .update({ status: "declined", decline_reason: reason, decided_at: new Date().toISOString() })
    .eq("id", id);

  track("collab_request_declined", {
    request_id: req.id,
    brand_id: req.brand_id,
    creator_id: creator.id,
    package_tier: req.package_tier,
  }, user.id);

  after(async () => {
    try {
      const [creatorUserRes, brandRes] = await Promise.all([
        admin.from("users").select("display_name").eq("id", user.id).maybeSingle(),
        admin.from("brands").select("company_name, user_id").eq("id", req.brand_id).maybeSingle(),
      ]);
      const creatorUser = creatorUserRes.data;
      const brandData = brandRes.data;
      if (!brandData) return;
      const { data: brandUser } = await admin
        .from("users").select("email, display_name").eq("id", brandData.user_id).maybeSingle();
      if (brandUser) {
        await sendBrandRequestDeclined({
          to: brandUser.email,
          brandName: brandUser.display_name ?? brandData.company_name ?? "Brand",
          creatorName: creatorUser?.display_name ?? "Creator",
          productName: req.product_name as string,
          reason,
        });
      }
    } catch (err) {
      console.error("[collab-requests/decline] notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, status: "declined" });
}
