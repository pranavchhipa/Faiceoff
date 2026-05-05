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

  return NextResponse.json({
    session,
    role: isBrand ? "brand" : "creator",
    conversation_id: conv?.id ?? null,
    generations: generations ?? [],
  });
}
