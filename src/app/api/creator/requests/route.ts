import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/creator/requests — list all collab requests for authenticated creator
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) return NextResponse.json({ requests: [] });

  const { data: rows, error } = await admin
    .from("collab_requests")
    .select("id, status, package_tier, package_price_paise, final_images, product_name, brief_one_liner, expires_at, created_at, brand_id")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[creator/requests]", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }

  // Enrich with brand display names
  const brandIds = [...new Set((rows ?? []).map((r: { brand_id: string }) => r.brand_id))];
  const brandNames: Record<string, string> = {};
  if (brandIds.length > 0) {
    const { data: brands } = await admin
      .from("brands")
      .select("id, user_id, company_name")
      .in("id", brandIds);

    const userIds = (brands ?? []).map((b: { user_id: string }) => b.user_id);
    const { data: brandUsers } = userIds.length > 0
      ? await admin.from("users").select("id, display_name").in("id", userIds)
      : { data: [] };

    const userNameById: Record<string, string> = {};
    for (const u of brandUsers ?? []) userNameById[u.id] = u.display_name;

    for (const b of brands ?? []) {
      brandNames[b.id] = b.company_name ?? userNameById[b.user_id] ?? "Brand";
    }
  }

  const requests = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    brand_display_name: brandNames[r.brand_id as string] ?? "Brand",
  }));

  return NextResponse.json({ requests });
}
