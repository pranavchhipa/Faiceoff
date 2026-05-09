import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/collabs/[id] — full collab session state for workspace
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: session, error } = await admin
    .from("collab_sessions")
    .select(`
      id, name, description, status, created_at,
      brand_id, creator_id,
      budget_paise, max_generations,
      package_tier, package_price_paise, final_images_target,
      approved_count, gen_credits_total, gen_credits_used,
      usage_scope, license_expires_at, collab_request_id
    `)
    .eq("id", id)
    .maybeSingle();

  if (error || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Auth: must be brand or creator on this session
  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

  const isBrand = brand?.id === session.brand_id;
  const isCreator = creator?.id === session.creator_id;

  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch conversation id for this pair
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("brand_id", session.brand_id)
    .eq("creator_id", session.creator_id)
    .maybeSingle();

  // Fetch generations for this session
  const { data: generations } = await admin
    .from("generations")
    .select("id, status, image_url, cost_paise, created_at, structured_brief")
    .eq("collab_session_id", id)
    .not("status", "in", "(discarded)")
    .order("created_at", { ascending: false })
    .limit(100);

  // Enrich with creator + brand profile + collab_request snapshot + licenses
  const approvedGenIds = (generations ?? [])
    .filter((g: { status: string }) => g.status === "approved")
    .map((g: { id: string }) => g.id);

  const [creatorRowRes, brandRowRes, requestRes, licensesRes] = await Promise.all([
    admin.from("creators").select("user_id, instagram_handle").eq("id", session.creator_id).maybeSingle(),
    admin.from("brands").select("user_id, company_name").eq("id", session.brand_id).maybeSingle(),
    session.collab_request_id
      ? admin.from("collab_requests").select("product_image_url, brief_one_liner").eq("id", session.collab_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    approvedGenIds.length > 0
      ? admin
          .from("licenses")
          .select("id, generation_id, scope, issued_at, expires_at, status, cert_url, amount_paid_paise, creator_share_paise")
          .in("generation_id", approvedGenIds)
          .order("issued_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  let creator_name: string | null = null;
  let creator_avatar_url: string | null = null;
  let creator_handle: string | null = null;
  if (creatorRowRes.data?.user_id) {
    const { data: cu } = await admin
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", creatorRowRes.data.user_id)
      .maybeSingle();
    creator_name = cu?.display_name ?? null;
    creator_avatar_url = cu?.avatar_url ?? null;
    creator_handle = creatorRowRes.data.instagram_handle ?? null;
  }

  // Brand avatar — pull from the brand-owner's user row
  let brand_avatar_url: string | null = null;
  if (brandRowRes.data?.user_id) {
    const { data: bu } = await admin
      .from("users")
      .select("avatar_url")
      .eq("id", brandRowRes.data.user_id)
      .maybeSingle();
    brand_avatar_url = bu?.avatar_url ?? null;
  }

  return NextResponse.json({
    session,
    role: isBrand ? "brand" : "creator",
    conversation_id: conv?.id ?? null,
    generations: generations ?? [],
    creator: {
      name: creator_name,
      avatar_url: creator_avatar_url,
      handle: creator_handle,
    },
    brand: {
      company_name: brandRowRes.data?.company_name ?? null,
      avatar_url: brand_avatar_url,
    },
    request: requestRes.data
      ? {
          product_image_url: requestRes.data.product_image_url ?? null,
          brief_one_liner: requestRes.data.brief_one_liner ?? null,
        }
      : null,
    licenses: licensesRes.data ?? [],
  });
}
