import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/campaigns/:id
 *
 * Returns a campaign with creator/brand display names and all generations.
 * Uses admin client to bypass RLS on users table for cross-user display name reads.
 *
 * HOT PATH: the campaign detail page polls this every 4s while a generation
 * is running — independent lookups are batched (3 round-trip times instead
 * of the old 7 sequential awaits).
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

  // Stale Supabase types — collab_sessions (renamed from campaigns in 00025)
  // isn't in the generated types yet. Cast at boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Batch 1: campaign + caller's DB role. The role must come from the DB —
  // user_metadata is CLIENT-MUTABLE (supabase.auth.updateUser) and was
  // previously trusted here, letting any user grant themselves admin access
  // to arbitrary campaigns.
  const [campRes, roleRes] = await Promise.all([
    admin
      .from("collab_sessions")
      .select(
        `
      id, name, description, status, budget_paise, spent_paise,
      generation_count, max_generations, created_at,
      creator_id, brand_id
    `
      )
      .eq("id", id)
      .single(),
    admin.from("users").select("role").eq("id", user.id).single(),
  ]);

  const campaign = campRes.data;
  if (campRes.error || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Batch 2: participant rows + generations (independent given campaign).
  const [brandRowRes, creatorRowRes, gensRes] = await Promise.all([
    admin
      .from("brands")
      .select("id, user_id")
      .eq("id", campaign.brand_id)
      .single(),
    admin
      .from("creators")
      .select("id, user_id")
      .eq("id", campaign.creator_id)
      .single(),
    admin
      .from("generations")
      .select(
        "id, status, assembled_prompt, structured_brief, image_url, cost_paise, created_at, replicate_prediction_id"
      )
      .eq("collab_session_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const brandRow = brandRowRes.data;
  const creatorRow = creatorRowRes.data;
  const generations = gensRes.data ?? [];

  const isBrand = brandRow?.user_id === user.id;
  const isCreator = creatorRow?.user_id === user.id;
  const isAdmin = roleRes.data?.role === "admin";

  if (!isBrand && !isCreator && !isAdmin) {
    return NextResponse.json(
      { error: "You do not have access to this campaign" },
      { status: 403 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generationIds = (generations as any[]).map((g: { id: string }) => g.id);

  // Batch 3: display names + creator-only enrichment, all independent.
  // Earnings read the archive (renamed in migration 00027). New earnings
  // flow for Chunk D will live in escrow_ledger + platform_revenue_ledger.
  const [creatorUserRes, brandUserRes, earningsRes, pendingRes] =
    await Promise.all([
      creatorRow
        ? admin
            .from("users")
            .select("display_name, avatar_url")
            .eq("id", creatorRow.user_id)
            .single()
        : Promise.resolve({ data: null }),
      brandRow
        ? admin
            .from("users")
            .select("display_name, avatar_url")
            .eq("id", brandRow.user_id)
            .single()
        : Promise.resolve({ data: null }),
      isCreator && generationIds.length > 0
        ? admin
            .from("wallet_transactions_archive")
            .select("amount_paise")
            .eq("user_id", user.id)
            .eq("direction", "credit")
            .eq("reference_type", "generation")
            .in("reference_id", generationIds)
        : Promise.resolve({ data: null }),
      isCreator && generationIds.length > 0
        ? admin
            .from("approvals")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .in("generation_id", generationIds)
        : Promise.resolve({ count: 0 }),
    ]);

  const earningsPaise = (
    (earningsRes.data ?? []) as Array<{ amount_paise: number | null }>
  ).reduce((acc, row) => acc + (row.amount_paise ?? 0), 0);
  const pendingApprovalCount = pendingRes.count ?? 0;

  return NextResponse.json({
    campaign: {
      ...campaign,
      generation_count: generations.length,
      creator_display_name: creatorUserRes.data?.display_name ?? "Creator",
      brand_display_name: brandUserRes.data?.display_name ?? "Brand",
      earnings_paise: earningsPaise,
      pending_approval_count: pendingApprovalCount,
    },
    generations,
  });
}
