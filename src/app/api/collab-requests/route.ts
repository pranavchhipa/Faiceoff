import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/redis/rate-limiter";
import { track } from "@/lib/observability/analytics";
import { sendCreatorCollabRequest } from "@/lib/email/transactional";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const TIER_SCOPE: Record<string, { usage_scope: string; license_duration_days: number }> = {
  frame:   { usage_scope: "social_organic", license_duration_days: 90 },
  feature: { usage_scope: "social_paid",    license_duration_days: 180 },
  cover:   { usage_scope: "digital_full",   license_duration_days: 365 },
};

// POST /api/collab-requests — brand sends a request to creator
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 10 requests per user per hour
  const rl = await rateLimit(`collab-requests:${user.id}`, 10, "1 h");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const admin = createAdminClient() as Admin;

  // Resolve brand
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });

  let body: {
    package_id?: unknown;
    product_name?: unknown;
    product_image_url?: unknown;
    brief_one_liner?: unknown;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { package_id, product_name, product_image_url, brief_one_liner } = body;

  if (!package_id || typeof package_id !== "string") {
    return NextResponse.json({ error: "package_id required" }, { status: 400 });
  }
  if (!product_name || typeof product_name !== "string" || !product_name.trim()) {
    return NextResponse.json({ error: "product_name required" }, { status: 400 });
  }
  if (!product_image_url || typeof product_image_url !== "string") {
    return NextResponse.json({ error: "product_image_url required" }, { status: 400 });
  }
  if (!brief_one_liner || typeof brief_one_liner !== "string" || brief_one_liner.trim().length < 1 || brief_one_liner.length > 500) {
    return NextResponse.json({ error: "brief_one_liner required (1–500 chars)" }, { status: 400 });
  }

  // Load package (must be active)
  const { data: pkg } = await admin
    .from("creator_packages")
    .select("id, creator_id, tier, price_paise, final_images, is_active")
    .eq("id", package_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!pkg) return NextResponse.json({ error: "Package not found or inactive" }, { status: 404 });

  // Verify creator is live
  const { data: creator } = await admin
    .from("creators")
    .select("id, is_live, user_id")
    .eq("id", pkg.creator_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  if (!creator.is_live) return NextResponse.json({ error: "Creator is not accepting requests" }, { status: 400 });

  // Don't let brand request their own creator account.
  // Compare the AUTH user id (request sender) against the creator's user_id
  // — the previous check compared `pkg.creator_id` (creators table PK, a
  // separate UUID space) against `user.id` (auth.users.id), which never
  // matched and silently let dual-role users self-request.
  if (creator.user_id === user.id) {
    return NextResponse.json({ error: "Cannot request yourself" }, { status: 400 });
  }

  const tierMeta = TIER_SCOPE[pkg.tier as string] ?? TIER_SCOPE.frame;
  const gen_credits = (pkg.final_images as number) * 3;
  const expires_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h

  const { data: reqRow, error: insertErr } = await admin
    .from("collab_requests")
    .insert({
      brand_id: brand.id,
      creator_id: creator.id,
      package_id: pkg.id,
      package_tier: pkg.tier,
      package_price_paise: pkg.price_paise,
      final_images: pkg.final_images,
      gen_credits,
      usage_scope: tierMeta.usage_scope,
      license_duration_days: tierMeta.license_duration_days,
      product_name: (product_name as string).trim(),
      product_image_url: product_image_url as string,
      brief_one_liner: (brief_one_liner as string).trim(),
      expires_at,
    })
    .select("id")
    .single();

  if (insertErr || !reqRow) {
    console.error("[collab-requests POST]", insertErr);
    return NextResponse.json({
      error: "Failed to create request",
      detail: insertErr?.message ?? insertErr?.code ?? "unknown",
    }, { status: 500 });
  }

  track("collab_request_created", {
    request_id: reqRow.id,
    brand_id: brand.id,
    creator_id: creator.id,
    package_tier: pkg.tier,
    price_paise: pkg.price_paise,
  }, user.id);

  // Fire-and-forget: notify creator by email
  after(async () => {
    try {
      const [creatorUserRes, brandRes] = await Promise.all([
        admin.from("users").select("email, display_name").eq("id", creator.user_id).maybeSingle(),
        admin.from("brands").select("company_name").eq("id", brand.id).maybeSingle(),
      ]);
      const creatorUser = creatorUserRes.data;
      const brandData = brandRes.data;
      if (creatorUser && brandData) {
        await sendCreatorCollabRequest({
          to: creatorUser.email,
          creatorName: creatorUser.display_name ?? "Creator",
          brandName: brandData.company_name ?? "Brand",
          productName: (product_name as string).trim(),
          packageTier: pkg.tier as string,
          pricePaise: pkg.price_paise as number,
          requestId: reqRow.id,
        });
      }
    } catch (err) {
      console.error("[collab-requests] notification failed", err);
    }
  });

  return NextResponse.json({ request_id: reqRow.id }, { status: 201 });
}
