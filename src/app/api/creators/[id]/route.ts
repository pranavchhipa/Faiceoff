import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

if (!process.env.R2_PUBLIC_URL && process.env.NODE_ENV !== "test") {
  console.warn("[creators] R2_PUBLIC_URL not set — hero photo URLs will be relative and may not render");
}

/**
 * GET /api/creators/:id
 *
 * Returns a single active creator's profile with categories.
 * Uses admin client to bypass RLS on users table.
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

  const { data, error } = await admin
    .from("creators")
    .select(
      `
      id,
      bio,
      instagram_handle,
      instagram_followers,
      kyc_status,
      user_id,
      users!inner (
        display_name,
        avatar_url
      ),
      creator_categories (
        id,
        category,
        subcategories,
        price_per_generation_paise,
        is_active
      )
    `
    )
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Creator not found or is no longer available." },
      { status: 404 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const creator = {
    id: d.id,
    bio: d.bio,
    instagram_handle: d.instagram_handle,
    instagram_followers: d.instagram_followers,
    kyc_status: d.kyc_status,
    display_name: d.users?.display_name ?? "Creator",
    avatar_url: d.users?.avatar_url ?? null,
    categories: (d.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => ({
        id: cc.id,
        category: cc.category,
        subcategories: cc.subcategories,
        price_per_generation_paise: cc.price_per_generation_paise,
        is_active: cc.is_active,
      })),
  };

  // Hero photo
  const { data: heroPhoto } = await admin
    .from("creator_reference_photos")
    .select("storage_path")
    .eq("creator_id", id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = process.env.R2_PUBLIC_URL ?? "";
  const heroPhotoUrl = heroPhoto?.storage_path
    ? base
      ? `${base}/${heroPhoto.storage_path}`
      : heroPhoto.storage_path
    : (creator.avatar_url ?? null);

  // Gallery: up to 8 most recent approved generations for this creator
  const { data: gens } = await admin
    .from("generations")
    .select("id, delivery_url, status, created_at")
    .eq("creator_id", id)
    .eq("status", "approved")
    .not("delivery_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);

  const gallery = (gens ?? [])
    .map((g: { delivery_url: string | null }) => g.delivery_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  // Exact approval count — independent of the 8-row gallery slice so the
  // stat reflects the creator's full history, not just the loaded thumbnails.
  const { count: approvalCount } = await admin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", id)
    .eq("status", "approved");

  // Average approval duration (hours): from approvals table
  // Uses the gallery slice (8 rows) for a quick estimate — sufficient for display.
  let avgApprovalMs: number | null = null;
  if ((approvalCount ?? 0) > 0) {
    const genIds = (gens ?? []).map((g) => g.id);
    const { data: approvals } = await admin
      .from("approvals")
      .select("generation_id, status, decided_at, created_at")
      .in("generation_id", genIds)
      .eq("status", "approved");
    const durations: number[] = [];
    for (const a of approvals ?? []) {
      if (!a.decided_at) continue;
      const d =
        new Date(a.decided_at).getTime() - new Date(a.created_at).getTime();
      if (d >= 0 && Number.isFinite(d)) durations.push(d);
    }
    if (durations.length > 0) {
      avgApprovalMs =
        durations.reduce((s, x) => s + x, 0) / durations.length;
    }
  }

  const stats = {
    followers: creator.instagram_followers ?? null,
    approval_count: approvalCount ?? 0,
    avg_approval_hours:
      avgApprovalMs !== null
        ? Math.round(avgApprovalMs / (1000 * 60 * 60))
        : null,
    approval_rate: null as number | null,
    rating: null as number | null,
  };

  return NextResponse.json({
    creator: { ...creator, hero_photo_url: heroPhotoUrl },
    gallery,
    stats,
  });
}
