import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCertUrl } from "@/lib/licenses/cert-storage";
import { getAgreementForSession } from "@/lib/agreements/service";

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

  // HOT PATH: the studio mounts + refetches this after every action. All
  // independent lookups are batched — the old version ran ~10 sequential
  // round trips; this runs 3 batches.

  // Batch 1 — caller identity (auth gate) + everything keyed off the session.
  const [
    { data: brand },
    { data: creator },
    { data: conv },
    { data: generations },
    creatorRowRes,
    brandRowRes,
    requestRes,
    agreement,
  ] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
    admin
      .from("conversations")
      .select("id")
      .eq("brand_id", session.brand_id)
      .eq("creator_id", session.creator_id)
      .maybeSingle(),
    admin
      .from("generations")
      .select("id, status, image_url, cost_paise, created_at, structured_brief")
      .eq("collab_session_id", id)
      .not("status", "in", "(discarded)")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("creators").select("user_id, instagram_handle").eq("id", session.creator_id).maybeSingle(),
    admin.from("brands").select("user_id, company_name").eq("id", session.brand_id).maybeSingle(),
    session.collab_request_id
      ? admin.from("collab_requests").select("product_image_url, brief_one_liner").eq("id", session.collab_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getAgreementForSession(admin, id),
  ]);

  const isBrand = brand?.id === session.brand_id;
  const isCreator = creator?.id === session.creator_id;

  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const approvedGenIds = (generations ?? [])
    .filter((g: { status: string }) => g.status === "approved")
    .map((g: { id: string }) => g.id);

  // Batch 2 — rows dependent on batch-1 results.
  const [licensesRes, creatorUserRes, brandUserRes] = await Promise.all([
    approvedGenIds.length > 0
      ? admin
          .from("licenses")
          .select("id, generation_id, scope, issued_at, expires_at, status, cert_url, amount_paid_paise, creator_share_paise")
          .in("generation_id", approvedGenIds)
          .order("issued_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    creatorRowRes.data?.user_id
      ? admin
          .from("users")
          .select("display_name, avatar_url")
          .eq("id", creatorRowRes.data.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    brandRowRes.data?.user_id
      ? admin
          .from("users")
          .select("avatar_url")
          .eq("id", brandRowRes.data.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const creator_name: string | null = creatorUserRes.data?.display_name ?? null;
  const creator_avatar_url: string | null = creatorUserRes.data?.avatar_url ?? null;
  const creator_handle: string | null = creatorRowRes.data?.instagram_handle ?? null;
  const brand_avatar_url: string | null = brandUserRes.data?.avatar_url ?? null;

  return NextResponse.json({
    session,
    role: isBrand ? "brand" : "creator",
    agreement,
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
    licenses: (licensesRes.data ?? []).map(
      (l: { id: string; cert_url: string | null }) => ({
        ...l,
        // Old rows stored the S3-endpoint URL which fails with Auth in
        // browsers. Rewrite to the public CDN URL on read so the UI never
        // sees a broken link.
        cert_url: normalizeCertUrl(l.cert_url, l.id),
      }),
    ),
  });
}
