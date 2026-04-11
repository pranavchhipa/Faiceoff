import { NextResponse } from "next/server";
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
    const admin = createAdminClient();

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

      // Run ALL queries in parallel
      const [
        approvalsResult,
        walletResult,
        campaignsResult,
        categoriesResult,
        loraResult,
        photosResult,
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

        // Wallet balance
        Promise.resolve(
          admin
            .from("wallet_transactions")
            .select("balance_after_paise")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
          .then(({ data }) => data?.balance_after_paise ?? 0)
          .catch(() => 0),

        // Campaigns
        Promise.resolve(
          admin
            .from("campaigns")
            .select("id, status")
            .eq("creator_id", creator.id),
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

        // LoRA status (only if onboarding complete)
        isComplete
          ? Promise.resolve(
              admin
                .from("creator_lora_models")
                .select("training_status, creator_approved")
                .eq("creator_id", creator.id)
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle(),
            )
              .then(({ data }) => data)
              .catch(() => null)
          : Promise.resolve(null),

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
      ]);

      return NextResponse.json({
        role,
        creator,
        stats: {
          pendingApprovals: approvalsResult,
          walletBalance: walletResult,
          activeCampaigns: campaignsResult.active,
          totalCampaigns: campaignsResult.total,
        },
        categories: categoriesResult,
        loraStatus: loraResult,
        photoCount: photosResult,
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

      // Run brand queries in parallel
      const [campaignsResult, walletResult] = await Promise.all([
        Promise.resolve(
          admin
            .from("campaigns")
            .select("id, status, generation_count")
            .eq("brand_id", brand.id),
        )
          .then(({ data }) => {
            const campaigns = data ?? [];
            return {
              active: campaigns.filter((c) => c.status === "active").length,
              total: campaigns.length,
              generations: campaigns.reduce(
                (s, c) => s + (c.generation_count ?? 0),
                0,
              ),
            };
          })
          .catch(() => ({ active: 0, total: 0, generations: 0 })),

        Promise.resolve(
          admin
            .from("wallet_transactions")
            .select("balance_after_paise")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
          .then(({ data }) => data?.balance_after_paise ?? 0)
          .catch(() => 0),
      ]);

      return NextResponse.json({
        role,
        brand,
        stats: {
          activeCampaigns: campaignsResult.active,
          totalCampaigns: campaignsResult.total,
          totalGenerations: campaignsResult.generations,
          walletBalance: walletResult,
        },
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
