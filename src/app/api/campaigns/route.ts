import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/campaigns
 *
 * Returns campaigns for the authenticated user.
 *
 * Role detection is DB-backed (not user_metadata, which is often stale):
 * we look up whether the caller has a brands row vs a creators row.
 *
 * For creators, each campaign is enriched with collaboration-specific
 * fields so the "Collaborations" list card can show what actually
 * matters to a creator: how much they've earned, how many approvals
 * are pending, and a few recent thumbnails.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Resolve role from DB (source of truth) ───────────────────────
  const [{ data: brandRow }, { data: creatorRow }] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const isBrand = !!brandRow;
  const isCreator = !!creatorRow;

  if (!isBrand && !isCreator) {
    return NextResponse.json({ campaigns: [] });
  }

  // ── Fetch campaigns scoped to role ───────────────────────────────
  let campaignsQuery = admin
    .from("collab_sessions")
    .select(
      `id, name, description, status, generation_count, max_generations,
       budget_paise, spent_paise, created_at, creator_id, brand_id`
    )
    .order("created_at", { ascending: false });

  if (isBrand) {
    campaignsQuery = campaignsQuery.eq("brand_id", brandRow!.id);
  } else {
    campaignsQuery = campaignsQuery.eq("creator_id", creatorRow!.id);
  }

  const { data: campaigns, error } = await campaignsQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const campaignIds = campaigns.map((c) => c.id);

  // ── Batched enrichment lookups ───────────────────────────────────
  // One query each instead of N+1 per-card.
  const creatorIds = Array.from(new Set(campaigns.map((c) => c.creator_id)));
  const brandIds = Array.from(new Set(campaigns.map((c) => c.brand_id)));

  const [
    { data: creatorRows },
    { data: brandRows },
    { data: genRows },
  ] = await Promise.all([
    admin.from("creators").select("id, user_id").in("id", creatorIds),
    admin.from("brands").select("id, user_id").in("id", brandIds),
    // Pull generations once — used for thumbnails and as the scope for
    // earnings/approval lookups.
    admin
      .from("generations")
      .select("id, collab_session_id, image_url, created_at, status")
      .in("collab_session_id", campaignIds)
      .order("created_at", { ascending: false }),
  ]);

  const creatorUserIds = (creatorRows ?? []).map((r) => r.user_id);
  const brandUserIds = (brandRows ?? []).map((r) => r.user_id);
  const allUserIds = Array.from(
    new Set([...creatorUserIds, ...brandUserIds])
  );

  const { data: userRows } = await admin
    .from("users")
    .select("id, display_name")
    .in("id", allUserIds.length > 0 ? allUserIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameByUserId = new Map(
    (userRows ?? []).map((u) => [u.id, u.display_name ?? null])
  );
  const creatorUserIdById = new Map(
    (creatorRows ?? []).map((r) => [r.id, r.user_id])
  );
  const brandUserIdById = new Map(
    (brandRows ?? []).map((r) => [r.id, r.user_id])
  );

  // ── Creator-only enrichment (earnings, pending approvals, thumbs) ──
  let earningsByCampaign = new Map<string, number>();
  let pendingByCampaign = new Map<string, number>();
  const thumbsByCampaign = new Map<string, string[]>();

  // Always build thumbnails map (useful for both roles, but we only render
  // them for creators right now).
  for (const gen of genRows ?? []) {
    if (!gen.image_url) continue;
    const list = thumbsByCampaign.get(gen.collab_session_id) ?? [];
    if (list.length < 4) {
      list.push(gen.image_url);
      thumbsByCampaign.set(gen.collab_session_id, list);
    }
  }

  if (isCreator) {
    const genIds = (genRows ?? []).map((g) => g.id);
    const genToCampaign = new Map(
      (genRows ?? []).map((g) => [g.id, g.collab_session_id])
    );

    if (genIds.length > 0) {
      // Reads from wallet_transactions_archive — new earnings flow is moving
      // to escrow_ledger (Chunk D) but the archive still holds historical
      // settlements for display. Cast because the Supabase generated types
      // haven't been regenerated since migration 00027.
      const adminAny = admin as unknown as {
        from(table: string): {
          select(cols: string): {
            eq(col: string, val: string): {
              eq(col: string, val: string): {
                eq(col: string, val: string): {
                  in(col: string, vals: string[]): Promise<{
                    data: Array<{
                      amount_paise: number | null;
                      reference_id: string | null;
                    }> | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
      const [{ data: earnings }, { data: pendingApprovals }] =
        await Promise.all([
          // Creator earnings: credits on this creator's wallet referencing
          // these generations. `generation_earning` is what the legacy
          // pipeline wrote on approval. New writes go to escrow_ledger.
          adminAny
            .from("wallet_transactions_archive")
            .select("amount_paise, reference_id")
            .eq("user_id", user.id)
            .eq("direction", "credit")
            .eq("reference_type", "generation")
            .in("reference_id", genIds),
          admin
            .from("approvals")
            .select("generation_id")
            .eq("status", "pending")
            .in("generation_id", genIds),
        ]);

      earningsByCampaign = new Map();
      for (const row of earnings ?? []) {
        const campaignId = row.reference_id
          ? genToCampaign.get(row.reference_id)
          : undefined;
        if (!campaignId) continue;
        earningsByCampaign.set(
          campaignId,
          (earningsByCampaign.get(campaignId) ?? 0) + (row.amount_paise ?? 0)
        );
      }

      pendingByCampaign = new Map();
      for (const row of pendingApprovals ?? []) {
        const campaignId = genToCampaign.get(row.generation_id);
        if (!campaignId) continue;
        pendingByCampaign.set(
          campaignId,
          (pendingByCampaign.get(campaignId) ?? 0) + 1
        );
      }
    }
  }

  // Actual generation count per campaign — the campaigns.generation_count
  // column isn't incremented anywhere, so derive it from the rows we just
  // pulled. Without this, "New Generation" buttons show even after slots
  // are full.
  const genCountByCampaign = new Map<string, number>();
  for (const gen of genRows ?? []) {
    genCountByCampaign.set(
      gen.collab_session_id,
      (genCountByCampaign.get(gen.collab_session_id) ?? 0) + 1
    );
  }

  // ── Assemble response ────────────────────────────────────────────
  const enriched = campaigns.map((c) => {
    const creatorUserId = creatorUserIdById.get(c.creator_id);
    const brandUserId = brandUserIdById.get(c.brand_id);

    return {
      ...c,
      generation_count: genCountByCampaign.get(c.id) ?? 0,
      creator_display_name:
        (creatorUserId && nameByUserId.get(creatorUserId)) ?? "Creator",
      brand_display_name:
        (brandUserId && nameByUserId.get(brandUserId)) ?? "Brand",
      // Creator-only fields — harmlessly 0/[] for brands.
      earnings_paise: earningsByCampaign.get(c.id) ?? 0,
      pending_approval_count: pendingByCampaign.get(c.id) ?? 0,
      recent_thumbnails: thumbsByCampaign.get(c.id) ?? [],
    };
  });

  return NextResponse.json({ campaigns: enriched });
}
