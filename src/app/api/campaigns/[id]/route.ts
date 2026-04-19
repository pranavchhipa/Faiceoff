import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/campaigns/:id
 *
 * Returns a campaign with creator/brand display names and all generations.
 * Uses admin client to bypass RLS on users table for cross-user display name reads.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch campaign with related data
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .select(
      `
      id, name, description, status, budget_paise, spent_paise,
      generation_count, max_generations, created_at,
      creator_id, brand_id
    `
    )
    .eq("id", id)
    .single();

  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Verify user has access (is the brand or creator)
  const { data: brandRow } = await admin
    .from("brands")
    .select("id, user_id")
    .eq("id", campaign.brand_id)
    .single();

  const { data: creatorRow } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("id", campaign.creator_id)
    .single();

  const isBrand = brandRow?.user_id === user.id;
  const isCreator = creatorRow?.user_id === user.id;
  const isAdmin = user.user_metadata?.role === "admin";

  if (!isBrand && !isCreator && !isAdmin) {
    return NextResponse.json(
      { error: "You do not have access to this campaign" },
      { status: 403 }
    );
  }

  // Get display names from users table (bypasses RLS)
  const { data: creatorUser } = creatorRow
    ? await admin
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", creatorRow.user_id)
        .single()
    : { data: null };

  const { data: brandUser } = brandRow
    ? await admin
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", brandRow.user_id)
        .single()
    : { data: null };

  // Fetch generations for this campaign
  const { data: generations } = await admin
    .from("generations")
    .select(
      "id, status, assembled_prompt, structured_brief, image_url, cost_paise, created_at, replicate_prediction_id"
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  const generationIds = (generations ?? []).map((g) => g.id);

  // ── Creator-only enrichment ──────────────────────────────────────
  // Pull earnings + pending approval count scoped to this campaign so
  // the creator's collaboration detail page can show real numbers
  // without running its own queries.
  let earningsPaise = 0;
  let pendingApprovalCount = 0;

  if (isCreator && generationIds.length > 0) {
    const [{ data: earnings }, { count: pendingCount }] = await Promise.all([
      admin
        .from("wallet_transactions")
        .select("amount_paise")
        .eq("user_id", user.id)
        .eq("direction", "credit")
        .eq("reference_type", "generation")
        .in("reference_id", generationIds),
      admin
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .in("generation_id", generationIds),
    ]);

    earningsPaise = (earnings ?? []).reduce(
      (acc, row) => acc + (row.amount_paise ?? 0),
      0
    );
    pendingApprovalCount = pendingCount ?? 0;
  }

  return NextResponse.json({
    campaign: {
      ...campaign,
      generation_count: generations?.length ?? 0,
      creator_display_name: creatorUser?.display_name ?? "Creator",
      brand_display_name: brandUser?.display_name ?? "Brand",
      earnings_paise: earningsPaise,
      pending_approval_count: pendingApprovalCount,
    },
    generations: generations ?? [],
  });
}
