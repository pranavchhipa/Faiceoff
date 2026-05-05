import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/observability/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/collab-requests/[id]/accept — creator accepts request
// Effect: status → accepted, chat conversation created, brand notified
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  // Resolve creator
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  // Load request
  const { data: req, error: reqErr } = await admin
    .from("collab_requests")
    .select("id, status, brand_id, creator_id, expires_at, package_tier, package_price_paise, product_name")
    .eq("id", id)
    .maybeSingle();

  if (reqErr || !req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.creator_id !== creator.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${req.status}` }, { status: 400 });
  }
  if (new Date(req.expires_at) < new Date()) {
    return NextResponse.json({ error: "Request has expired" }, { status: 400 });
  }

  // Transition to accepted
  await admin
    .from("collab_requests")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .eq("id", id);

  // Auto-create chat conversation (idempotent — unique constraint on brand_id+creator_id)
  await admin
    .from("conversations")
    .upsert(
      { brand_id: req.brand_id, creator_id: creator.id },
      { onConflict: "brand_id,creator_id", ignoreDuplicates: true }
    );

  track("collab_request_accepted", {
    request_id: req.id,
    brand_id: req.brand_id,
    creator_id: creator.id,
    package_tier: req.package_tier,
  }, user.id);

  // Fire-and-forget: notify brand
  after(async () => {
    try {
      console.log(`[collab-requests/accept] notify brand ${req.brand_id} to pay for request ${req.id}`);
      // TODO: sendBrandRequestAccepted email via transactional.ts
    } catch (err) {
      console.error("[collab-requests/accept] notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, status: "accepted" });
}
