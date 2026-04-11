import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/campaigns
 *
 * Returns campaigns for the authenticated user (brand or creator).
 * Uses admin client to bypass RLS on users table for display name reads.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const role = user.user_metadata?.role ?? "creator";

  let campaignsQuery = admin
    .from("campaigns")
    .select(
      `id, name, description, status, generation_count, max_generations,
       budget_paise, spent_paise, created_at, creator_id, brand_id`
    )
    .order("created_at", { ascending: false });

  if (role === "brand") {
    const { data: brandRow } = await admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (brandRow) {
      campaignsQuery = campaignsQuery.eq("brand_id", brandRow.id);
    } else {
      return NextResponse.json({ campaigns: [] });
    }
  } else {
    const { data: creatorRow } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (creatorRow) {
      campaignsQuery = campaignsQuery.eq("creator_id", creatorRow.id);
    } else {
      return NextResponse.json({ campaigns: [] });
    }
  }

  const { data: campaigns, error } = await campaignsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with display names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (campaigns ?? []).map(async (c: any) => {
      // Get creator display name
      const { data: creatorRow } = await admin
        .from("creators")
        .select("user_id")
        .eq("id", c.creator_id)
        .single();

      const { data: creatorUser } = creatorRow
        ? await admin
            .from("users")
            .select("display_name")
            .eq("id", creatorRow.user_id)
            .single()
        : { data: null };

      // Get brand display name
      const { data: brandRow } = await admin
        .from("brands")
        .select("user_id")
        .eq("id", c.brand_id)
        .single();

      const { data: brandUser } = brandRow
        ? await admin
            .from("users")
            .select("display_name")
            .eq("id", brandRow.user_id)
            .single()
        : { data: null };

      return {
        ...c,
        creator_display_name: creatorUser?.display_name ?? "Creator",
        brand_display_name: brandUser?.display_name ?? "Brand",
      };
    })
  );

  return NextResponse.json({ campaigns: enriched });
}
