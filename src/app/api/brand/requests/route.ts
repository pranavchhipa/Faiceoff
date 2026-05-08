import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/brand/requests — all collab requests sent by this brand (all statuses)
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brand) return NextResponse.json({ requests: [] });

  const { data: rows, error } = await admin
    .from("collab_requests")
    .select("id, status, package_tier, package_price_paise, final_images, product_name, product_image_url, brief_one_liner, creator_id, expires_at, decided_at, paid_at, collab_session_id, created_at")
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[brand/requests GET]", error);
    return NextResponse.json({ error: error.message, requests: [] }, { status: 500 });
  }

  // Enrich with creator names
  const creatorIds = [...new Set((rows ?? []).map((r: { creator_id: string }) => r.creator_id))];
  const creatorNameMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: cRows } = await admin.from("creators").select("id, user_id").in("id", creatorIds);
    const cUserIds = (cRows ?? []).map((c: { user_id: string }) => c.user_id);
    if (cUserIds.length > 0) {
      const { data: cUsers } = await admin.from("users").select("id, display_name").in("id", cUserIds);
      const cuMap: Record<string, string> = {};
      for (const u of cUsers ?? []) cuMap[u.id] = u.display_name;
      for (const c of cRows ?? []) creatorNameMap[c.id] = cuMap[c.user_id] ?? "Creator";
    }
  }

  const requests = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    creator_name: creatorNameMap[r.creator_id as string] ?? "Creator",
  }));

  return NextResponse.json({ requests });
}
