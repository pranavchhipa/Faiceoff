import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAgreementTerms } from "@/lib/agreements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/collab-requests/[id]/agreement-preview
// Returns the deterministic Collaboration Agreement terms for this request so
// the pre-signing review modal (creator accept + brand pay) shows exactly what
// the parties are about to sign. Auth: must be the brand or creator on the
// request. Also returns party names + whether each side has already signed.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: req } = await admin
    .from("collab_requests")
    .select("id, brand_id, creator_id, package_tier, package_price_paise, final_images, gen_credits, usage_scope, license_duration_days, product_name")
    .eq("id", id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // Authorize: caller must be the brand or creator on this request.
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id, company_name").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isBrand = brandRes.data?.id === req.brand_id;
  const isCreator = creatorRes.data?.id === req.creator_id;
  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const terms = buildAgreementTerms({
    package_tier: req.package_tier,
    package_price_paise: req.package_price_paise,
    final_images: req.final_images,
    gen_credits: req.gen_credits,
    usage_scope: req.usage_scope,
    license_duration_days: req.license_duration_days,
    product_name: req.product_name,
  });

  // Party display names + existing signature state (if an agreement exists).
  const [brandRow, creatorUserRow, agreementRow] = await Promise.all([
    admin.from("brands").select("company_name").eq("id", req.brand_id).maybeSingle(),
    admin
      .from("creators").select("user_id").eq("id", req.creator_id).maybeSingle()
      .then(async (r: { data: { user_id: string } | null }) =>
        r.data?.user_id
          ? admin.from("users").select("display_name").eq("id", r.data.user_id).maybeSingle()
          : { data: null },
      ),
    admin
      .from("collab_agreements")
      .select("id, status, creator_signed_name, creator_signed_at, brand_signed_name, brand_signed_at")
      .eq("collab_request_id", req.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    terms,
    parties: {
      brand_company_name: brandRow.data?.company_name ?? "Brand",
      creator_display_name: creatorUserRow.data?.display_name ?? "Creator",
    },
    role: isBrand ? "brand" : "creator",
    signatures: agreementRow.data
      ? {
          creator_signed: Boolean(agreementRow.data.creator_signed_name),
          creator_signed_at: agreementRow.data.creator_signed_at,
          brand_signed: Boolean(agreementRow.data.brand_signed_name),
          brand_signed_at: agreementRow.data.brand_signed_at,
          status: agreementRow.data.status,
          agreement_id: agreementRow.data.id,
        }
      : { creator_signed: false, brand_signed: false, status: null, agreement_id: null },
  });
}
