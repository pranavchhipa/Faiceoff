import { NextResponse } from "next/server";
import { cachedJson } from "@/lib/http/cacheable";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = user.user_metadata?.role ?? "creator";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    if (role === "creator") {
      // Get creator profile first (needed for other queries)
      const { data: creator } = await admin
        .from("creators")
        .select(
          "id, onboarding_step, is_active, instagram_handle, bio, kyc_status",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (!creator) {
        return NextResponse.json({ role, creator: null });
      }

      const isComplete = creator.onboarding_step === "complete";

      // 8-week window for the earnings sparkline + approval-health ring.
      const WEEKS = 8;
      const sinceIso = new Date(
        Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Run ALL queries in parallel
      const [
        approvalsResult,
        walletResult,
        campaignsResult,
        categoriesResult,
        photosResult,
        earningsTxResult,
        approvalsAllResult,
      ] = await Promise.all([
        // Pending approvals
        Promise.resolve(
          admin
            .from("approvals")
            .select("id", { count: "exact", head: true })
            .eq("creator_id", creator.id)
            .eq("status", "pending"),
        )
          .then(({ count }) => count ?? 0)
          .catch(() => 0),

        // Wallet balance — reads wallet_transactions_archive
        // (migration 00027). Cast because Supabase types don't yet know
        // about the renamed table.
        Promise.resolve(
          (
            admin as unknown as {
              from(t: string): {
                select(c: string): {
                  eq(col: string, v: string): {
                    order(
                      col: string,
                      opts: { ascending: boolean },
                    ): {
                      limit(n: number): {
                        maybeSingle(): Promise<{
                          data: { balance_after_paise: number | null } | null;
                        }>;
                      };
                    };
                  };
                };
              };
            }
          )
            .from("wallet_transactions_archive")
            .select("balance_after_paise")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
          .then(({ data }) => data?.balance_after_paise ?? 0)
          .catch(() => 0),

        // Campaigns — only count NEW-flow collab_sessions (linked to a
        // collab_request from the current package-based model). Old
        // pre-Chunk-D sessions with collab_request_id IS NULL are stale
        // data from the legacy direct-start flow and shouldn't inflate the
        // creator's "active collabs" badge.
        Promise.resolve(
          admin
            .from("collab_sessions")
            .select("id, status, collab_request_id")
            .eq("creator_id", creator.id)
            .not("collab_request_id", "is", null),
        )
          .then(({ data }) => {
            const campaigns = data ?? [];
            return {
              active: campaigns.filter((c) => c.status === "active").length,
              total: campaigns.length,
            };
          })
          .catch(() => ({ active: 0, total: 0 })),

        // Categories (only if onboarding complete)
        isComplete
          ? Promise.resolve(
              admin
                .from("creator_categories")
                .select(
                  "category, price_per_generation_paise, subcategories",
                )
                .eq("creator_id", creator.id),
            )
              .then(({ data }) => data ?? [])
              .catch(() => [])
          : Promise.resolve([]),

        // Photo count (only if onboarding complete)
        isComplete
          ? Promise.resolve(
              admin
                .from("creator_reference_photos")
                .select("id", { count: "exact", head: true })
                .eq("creator_id", creator.id),
            )
              .then(({ count }) => count ?? 0)
              .catch(() => 0)
          : Promise.resolve(0),

        // Earnings credits over the last 8 weeks (for the activity chart).
        Promise.resolve(
          admin
            .from("wallet_transactions_archive")
            .select("amount_paise, direction, created_at")
            .eq("user_id", user.id)
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false })
            .limit(2000),
        )
          .then(
            ({ data }: { data: Array<{ amount_paise: number; direction: string; created_at: string }> | null }) =>
              data ?? [],
          )
          .catch(
            () => [] as Array<{ amount_paise: number; direction: string; created_at: string }>,
          ),

        // Approval decisions over the last 8 weeks (for the approval ring).
        Promise.resolve(
          admin
            .from("approvals")
            .select("status")
            .eq("creator_id", creator.id)
            .gte("created_at", sinceIso)
            .limit(2000),
        )
          .then(
            ({ data }: { data: Array<{ status: string }> | null }) => data ?? [],
          )
          .catch(() => [] as Array<{ status: string }>),
      ]);

      // Bucket credit transactions into WEEKS weekly earnings totals (paise).
      const cWeekMs = 7 * 24 * 60 * 60 * 1000;
      const cNow = Date.now();
      const earningsSeries = new Array(WEEKS).fill(0) as number[];
      for (const tx of earningsTxResult) {
        if (tx.direction !== "credit") continue;
        const weeksAgo = Math.floor(
          (cNow - new Date(tx.created_at).getTime()) / cWeekMs,
        );
        const idx = WEEKS - 1 - weeksAgo;
        if (idx >= 0 && idx < WEEKS)
          earningsSeries[idx] += tx.amount_paise ?? 0;
      }
      const cBreakdown = { approved: 0, pending: 0, rejected: 0 };
      for (const a of approvalsAllResult) {
        if (a.status === "approved") cBreakdown.approved += 1;
        else if (a.status === "pending") cBreakdown.pending += 1;
        else if (a.status === "rejected") cBreakdown.rejected += 1;
      }
      const cDecided = cBreakdown.approved + cBreakdown.rejected;
      const creatorApprovalRate =
        cDecided > 0
          ? Math.round((cBreakdown.approved / cDecided) * 100)
          : null;

      // Dashboard stats refresh frequency is bounded by the BalanceChip's
      // 60s poll. 15s browser cache + 60s SWR means tab switches within a
      // minute paint instantly from cache.
      return cachedJson({
        role,
        creator,
        stats: {
          pendingApprovals: approvalsResult,
          walletBalance: walletResult,
          activeCampaigns: campaignsResult.active,
          totalCampaigns: campaignsResult.total,
          approvalRate: creatorApprovalRate,
        },
        categories: categoriesResult,
        photoCount: photosResult,
        earningsSeries,
        approvalBreakdown: cBreakdown,
      });
    } else {
      // Brand
      const { data: brand } = await admin
        .from("brands")
        .select("id, company_name, gst_number, industry, is_verified")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!brand) {
        return NextResponse.json({ role, brand: null });
      }

      // Last 8 weeks window for the activity sparkline + approval ring.
      const WEEKS = 8;
      const sinceIso = new Date(
        Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Run brand queries in parallel
      const [campaignsResult, walletResult, generationsResult, genTotalResult] =
        await Promise.all([
        Promise.resolve(
          admin
            .from("collab_sessions")
            .select("id, status")
            .eq("brand_id", brand.id),
        )
          .then(({ data }) => {
            const campaigns = data ?? [];
            return {
              active: campaigns.filter((c) => c.status === "active").length,
              total: campaigns.length,
            };
          })
          .catch(() => ({ active: 0, total: 0 })),

        // Brand wallet balance — reads wallet_transactions_archive
        // (migration 00027). Cast because Supabase types don't yet know
        // about the renamed table.
        Promise.resolve(
          (
            admin as unknown as {
              from(t: string): {
                select(c: string): {
                  eq(col: string, v: string): {
                    order(
                      col: string,
                      opts: { ascending: boolean },
                    ): {
                      limit(n: number): {
                        maybeSingle(): Promise<{
                          data: { balance_after_paise: number | null } | null;
                        }>;
                      };
                    };
                  };
                };
              };
            }
          )
            .from("wallet_transactions_archive")
            .select("balance_after_paise")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
          .then(({ data }) => data?.balance_after_paise ?? 0)
          .catch(() => 0),

        // Recent generations (status + created_at) for the activity
        // sparkline and approval-health ring. Bounded to the 8-week window
        // and capped so a high-volume brand can't blow up the payload.
        Promise.resolve(
          admin
            .from("generations")
            .select("status, created_at")
            .eq("brand_id", brand.id)
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false })
            .limit(2000),
        )
          .then(({ data }) => (data ?? []) as Array<{ status: string; created_at: string }>)
          .catch(() => [] as Array<{ status: string; created_at: string }>),

        // Real all-time generation count (the collab_sessions.generation_count
        // column is not maintained, so summing it returned a misleading 0).
        Promise.resolve(
          admin
            .from("generations")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brand.id),
        )
          .then(({ count }: { count: number | null }) => count ?? 0)
          .catch(() => 0),
      ]);

      // Bucket the recent generations into WEEKS weekly counts (oldest →
      // newest) for the activity sparkline.
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const series = new Array(WEEKS).fill(0) as number[];
      const breakdown = { approved: 0, inReview: 0, needsFix: 0 };
      for (const g of generationsResult) {
        const t = new Date(g.created_at).getTime();
        const weeksAgo = Math.floor((now - t) / weekMs);
        const idx = WEEKS - 1 - weeksAgo;
        if (idx >= 0 && idx < WEEKS) series[idx] += 1;
        if (g.status === "approved") breakdown.approved += 1;
        else if (
          g.status === "ready_for_approval" ||
          g.status === "ready_for_brand_review"
        )
          breakdown.inReview += 1;
        else if (g.status === "rejected" || g.status === "failed")
          breakdown.needsFix += 1;
      }
      const decided = breakdown.approved + breakdown.needsFix;
      const approvalRate =
        decided > 0 ? Math.round((breakdown.approved / decided) * 100) : null;

      return cachedJson({
        role,
        brand,
        stats: {
          activeCampaigns: campaignsResult.active,
          totalCampaigns: campaignsResult.total,
          totalGenerations: genTotalResult,
          walletBalance: walletResult,
          approvalRate,
        },
        generationsSeries: series,
        approvalBreakdown: breakdown,
      });
    }
  } catch (err) {
    console.error("[dashboard/stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
