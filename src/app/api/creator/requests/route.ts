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
    .select("id, status, package_tier, package_price_paise, final_images, product_name, product_image_url, brief_one_liner, expires_at, created_at, brand_id")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[creator/requests]", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }

  // Enrich with brand display names — one embedded query instead of the old
  // brands→users two-step (brands.user_id FK makes users(display_name)
  // embeddable; same pattern as src/lib/cc/overview.ts).
  const brandIds = [...new Set((rows ?? []).map((r: { brand_id: string }) => r.brand_id))];
  const brandNames: Record<string, string> = {};
  if (brandIds.length > 0) {
    const { data: brands } = await admin
      .from("brands")
      .select("id, company_name, user:users(display_name)")
      .in("id", brandIds);

    for (const b of (brands ?? []) as Array<{
      id: string;
      company_name: string | null;
      user: { display_name: string | null } | null;
    }>) {
      brandNames[b.id] = b.company_name ?? b.user?.display_name ?? "Brand";
    }
  }

  const requests = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    brand_display_name: brandNames[r.brand_id as string] ?? "Brand",
  }));

  return NextResponse.json({ requests });
}
