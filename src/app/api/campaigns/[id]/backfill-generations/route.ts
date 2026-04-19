import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import type { Json } from "@/types/supabase";

/**
 * POST /api/campaigns/:id/backfill-generations
 *
 * Recovery endpoint. Some historic campaigns ended up with
 * `generation_count < max_generations` even though the brand's wallet
 * was escrowed for the full budget (happens when the atomic RPC wasn't
 * available yet, or the loop partially failed). This rebuilds the
 * missing draft rows and dispatches Inngest events so the pipeline runs
 * for the remaining slots. Does NOT re-debit the wallet — the money is
 * already held in escrow.
 *
 * Only the owning brand can call this. Idempotent: computes missing rows
 * from the live table each time.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: campaign_id } = await params;

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load campaign + verify brand ownership
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json(
      { error: "Brand profile not found" },
      { status: 403 },
    );
  }

  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .select("id, brand_id, creator_id, status, max_generations, budget_paise")
    .eq("id", campaign_id)
    .eq("brand_id", brand.id)
    .maybeSingle();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found or not owned by you" },
      { status: 404 },
    );
  }

  if (campaign.status !== "active") {
    return NextResponse.json(
      { error: "Campaign is not active" },
      { status: 400 },
    );
  }

  // Count existing rows — use count head query so we don't pull payloads.
  const { count: existingCount } = await admin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign_id);

  const current = existingCount ?? 0;
  const missing = campaign.max_generations - current;
  if (missing <= 0) {
    return NextResponse.json({
      created: 0,
      message: "Campaign already has all generations",
    });
  }

  // Re-use the brief from the first existing generation so the backfill
  // rows carry the same creative direction. Without this we can't run the
  // pipeline.
  const { data: firstGen } = await admin
    .from("generations")
    .select("structured_brief, cost_paise")
    .eq("campaign_id", campaign_id)
    .limit(1)
    .maybeSingle();
  const brief = (firstGen?.structured_brief ?? null) as Json | null;

  if (!brief) {
    return NextResponse.json(
      {
        error:
          "No structured_brief available on existing generations. Cannot backfill.",
      },
      { status: 400 },
    );
  }

  // Per-gen cost: take it from the existing gen row we already fetched,
  // otherwise derive from campaign budget and max_generations.
  const fallbackCost =
    campaign.max_generations > 0
      ? Math.floor(campaign.budget_paise / campaign.max_generations)
      : null;
  const costPaise = firstGen?.cost_paise ?? fallbackCost;
  if (!costPaise || costPaise <= 0) {
    return NextResponse.json(
      { error: "Could not determine per-generation cost" },
      { status: 400 },
    );
  }

  // Batch insert missing rows, then dispatch Inngest events.
  const rows = Array.from({ length: missing }, () => ({
    campaign_id: campaign.id,
    brand_id: campaign.brand_id,
    creator_id: campaign.creator_id,
    structured_brief: brief as Json,
    status: "draft" as const,
    cost_paise: costPaise,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("generations")
    .insert(rows)
    .select("id");

  if (insertError || !inserted) {
    Sentry.captureException(insertError, {
      tags: { route: "campaigns/backfill-generations" },
      extra: { campaign_id, missing },
    });
    return NextResponse.json(
      { error: "Failed to insert backfill rows" },
      { status: 500 },
    );
  }

  await inngest.send(
    inserted.map((g) => ({
      name: "generation/created" as const,
      data: { generation_id: g.id },
    })),
  );

  return NextResponse.json({
    created: inserted.length,
    generation_ids: inserted.map((g) => g.id),
  });
}
