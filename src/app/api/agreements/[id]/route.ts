import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgreementWithParties, buildAgreementTerms } from "@/lib/agreements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/agreements/[id] — full agreement detail, gated to the parties.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const agreement = await getAgreementWithParties(admin, id);
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Authorize — caller must be the brand or creator on the agreement.
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isBrand = brandRes.data?.id === agreement.brand_id;
  const isCreator = creatorRes.data?.id === agreement.creator_id;
  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const terms = buildAgreementTerms({
    package_tier: agreement.package_tier,
    package_price_paise: agreement.package_price_paise,
    final_images: agreement.final_images,
    usage_scope: agreement.usage_scope,
    license_duration_days: agreement.license_duration_days,
    product_name: agreement.product_name,
  });

  return NextResponse.json({
    agreement,
    terms,
    role: isBrand ? "brand" : "creator",
  });
}
