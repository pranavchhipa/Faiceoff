import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/observability/analytics";

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
    .select("id, status, brand_id, creator_id, package_tier")
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
      console.log(`[collab-requests/decline] notify brand ${req.brand_id} of decline on request ${req.id}`);
      // TODO: sendBrandRequestDeclined email via transactional.ts
    } catch (err) {
      console.error("[collab-requests/decline] notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, status: "declined" });
}
