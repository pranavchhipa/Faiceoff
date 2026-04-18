import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // --- Fetch generation ---
  // Note: base_image_url, upscaled_url, quality_scores, generation_attempts,
  // provider_prediction_id, and pipeline_version are from migration 00016
  // (v2 pipeline). src/types/supabase.ts is stale until we regenerate, so we
  // cast the row shape at the boundary — runtime select accepts these names.
  const { data: genRaw, error: genError } = await admin
    .from("generations")
    .select(
      `id, campaign_id, creator_id, brand_id, status, assembled_prompt,
       structured_brief, image_url, cost_paise, created_at, updated_at,
       base_image_url, upscaled_url, quality_scores, generation_attempts,
       provider_prediction_id, pipeline_version`,
    )
    .eq("id", id)
    .single();

  const gen = genRaw as unknown as
    | {
        id: string;
        campaign_id: string | null;
        creator_id: string;
        brand_id: string;
        status: string;
        assembled_prompt: string | null;
        structured_brief: Record<string, unknown> | null;
        image_url: string | null;
        cost_paise: number | null;
        created_at: string;
        updated_at: string;
        base_image_url: string | null;
        upscaled_url: string | null;
        quality_scores: Record<string, unknown> | null;
        generation_attempts: number | null;
        provider_prediction_id: string | null;
        pipeline_version: string | null;
      }
    | null;

  if (genError || !gen) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 },
    );
  }

  // --- Verify access: user must be the brand, creator, or admin ---
  const { data: userRow } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = userRow?.role === "admin";

  if (!isAdmin) {
    // Check if brand
    const { data: brand } = await admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Check if creator
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isBrandOwner = brand && gen.brand_id === brand.id;
    const isCreatorOwner = creator && gen.creator_id === creator.id;

    if (!isBrandOwner && !isCreatorOwner) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 },
      );
    }
  }

  // --- Fetch campaign name ---
  let campaign: { id: string; name: string } | null = null;
  if (gen.campaign_id) {
    const { data: campData } = await admin
      .from("campaigns")
      .select("id, name")
      .eq("id", gen.campaign_id)
      .single();
    if (campData) campaign = campData;
  }

  // --- Check if current user is the creator ---
  const { data: creatorRow } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isCreator = creatorRow?.id === gen.creator_id;

  // --- Fetch approval record ---
  const { data: approvalData } = await admin
    .from("approvals")
    .select("id, status, feedback, decided_at, expires_at, created_at")
    .eq("generation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    generation: { ...gen, campaign },
    approval: approvalData ?? null,
    is_creator: isCreator,
  });
}
