import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/observability/analytics";
import { sendBrandRequestAccepted } from "@/lib/email/transactional";
import { emitNotification } from "@/lib/notifications/emit";
import {
  createDraftAgreementOnAccept,
  clientIpFromHeaders,
  sanitizeSignatureName,
} from "@/lib/agreements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/collab-requests/[id]/accept — creator accepts request
// Effect: status → accepted, Collaboration Agreement drafted + creator-signed,
//         chat conversation created, brand notified.
// Body: { signed_name } — the creator's typed electronic signature (required;
//        accepting = signing the master Collaboration Agreement).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Electronic signature — required. Accepting a request signs the agreement.
  let body: Record<string, unknown> = {};
  try { body = await request.json().catch(() => ({})); } catch { /* ok */ }
  const signedName = sanitizeSignatureName(body.signed_name);
  if (!signedName) {
    return NextResponse.json(
      { error: "signature_required", message: "Type your full name to sign the agreement." },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as Admin;

  // Resolve creator
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  // Load request (incl. full package snapshot for the agreement)
  const { data: req, error: reqErr } = await admin
    .from("collab_requests")
    .select("id, status, brand_id, creator_id, expires_at, package_tier, package_price_paise, final_images, gen_credits, usage_scope, license_duration_days, product_name")
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

  // Draft the Collaboration Agreement + capture the creator's signature.
  // Synchronous (must exist before the brand can pay). Non-throwing.
  await createDraftAgreementOnAccept({
    admin,
    request: {
      id: req.id,
      brand_id: req.brand_id,
      creator_id: req.creator_id,
      package_tier: req.package_tier,
      package_price_paise: req.package_price_paise,
      final_images: req.final_images,
      gen_credits: req.gen_credits,
      usage_scope: req.usage_scope,
      license_duration_days: req.license_duration_days,
      product_name: req.product_name,
    },
    creatorSignedName: signedName,
    creatorSignedIp: clientIpFromHeaders(request.headers),
  });

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

  // Fire-and-forget: notify brand to complete payment
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
        await sendBrandRequestAccepted({
          to: brandUser.email,
          brandName: brandUser.display_name ?? brandData.company_name ?? "Brand",
          creatorName: creatorUser?.display_name ?? "Creator",
          productName: req.product_name as string,
          pricePaise: req.package_price_paise as number,
          requestId: req.id,
        });
      }
      // In-app notification to the brand → pay to unlock
      await emitNotification(admin, {
        userId: brandData.user_id,
        type: "collab_accepted",
        title: `${creatorUser?.display_name ?? "Creator"} accepted your request`,
        body: `Pay to unlock the collab for "${req.product_name}".`,
        href: "/brand/requests",
      });
    } catch (err) {
      console.error("[collab-requests/accept] notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, status: "accepted" });
}
