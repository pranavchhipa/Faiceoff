import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const TIER_SCOPE = {
  frame: { usage_scope: "social_organic", license_duration_days: 90 },
  feature: { usage_scope: "social_paid", license_duration_days: 180 },
  cover: { usage_scope: "digital_full", license_duration_days: 365 },
} as const;

async function getCreator(
  admin: Admin,
  userId: string,
): Promise<{ id: string; is_verified: boolean } | null> {
  const { data } = await admin
    .from("creators")
    .select("id, is_verified")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, is_verified: data.is_verified === true };
}

// GET /api/creator/packages — list own packages
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await getCreator(admin, user.id);
  if (!creator) return NextResponse.json({ packages: [] });

  const { data, error } = await admin
    .from("creator_packages")
    .select("id, tier, price_paise, final_images, is_active, created_at, updated_at")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[creator/packages GET]", error);
    return NextResponse.json({ error: "Failed to load packages" }, { status: 500 });
  }

  const packages = (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    gen_credits: (p.final_images as number) * 3,
    ...(TIER_SCOPE[p.tier as keyof typeof TIER_SCOPE] ?? {}),
  }));

  return NextResponse.json({ packages });
}

// POST /api/creator/packages — create or upsert a package
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await getCreator(admin, user.id);
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  // Verification gate: a creator must earn the gold tick (Aadhaar + PAN review)
  // before they can publish licensing packages.
  if (creator.is_verified !== true) {
    return NextResponse.json(
      {
        error: "verification_required",
        message: "Get verified (gold tick) before publishing packages. Submit your Aadhaar + PAN from the dashboard.",
      },
      { status: 403 },
    );
  }

  let body: { tier?: unknown; price_paise?: unknown; final_images?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tier, price_paise, final_images } = body;

  if (!tier || !["frame", "feature", "cover"].includes(tier as string)) {
    return NextResponse.json({ error: "tier must be frame, feature, or cover" }, { status: 400 });
  }
  if (typeof price_paise !== "number" || !Number.isInteger(price_paise) || price_paise < 150000) {
    return NextResponse.json({ error: "price_paise must be integer ≥ 150000 (₹1,500)" }, { status: 400 });
  }
  if (typeof final_images !== "number" || !Number.isInteger(final_images) || final_images < 1 || final_images > 20) {
    return NextResponse.json({ error: "final_images must be integer 1–20" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("creator_packages")
    .upsert(
      { creator_id: creator.id, tier, price_paise, final_images, is_active: true },
      { onConflict: "creator_id,tier" }
    )
    .select("id, tier, price_paise, final_images, is_active")
    .single();

  if (error) {
    console.error("[creator/packages POST]", error);
    return NextResponse.json({ error: "Failed to save package" }, { status: 500 });
  }

  return NextResponse.json({
    package: {
      ...data,
      gen_credits: (data.final_images as number) * 3,
      ...(TIER_SCOPE[data.tier as keyof typeof TIER_SCOPE] ?? {}),
    },
  }, { status: 201 });
}
