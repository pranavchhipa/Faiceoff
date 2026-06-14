import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

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

// GET /api/creator/packages/[id] — public read of a single package (for request form)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient() as Admin;

  const { data, error } = await admin
    .from("creator_packages")
    .select("id, tier, price_paise, final_images, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ package: data });
}

// PATCH /api/creator/packages/[id] — update price, final_images, or is_active
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await getCreator(admin, user.id);
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  let body: { price_paise?: unknown; final_images?: unknown; is_active?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build update object from allowed fields
  const update: Record<string, unknown> = {};
  if (body.price_paise !== undefined) {
    if (typeof body.price_paise !== "number" || !Number.isInteger(body.price_paise) || body.price_paise < 150000) {
      return NextResponse.json({ error: "price_paise must be integer ≥ 150000" }, { status: 400 });
    }
    update.price_paise = body.price_paise;
  }
  if (body.final_images !== undefined) {
    if (typeof body.final_images !== "number" || !Number.isInteger(body.final_images) || body.final_images < 1 || body.final_images > 20) {
      return NextResponse.json({ error: "final_images must be integer 1–20" }, { status: 400 });
    }
    update.final_images = body.final_images;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be boolean" }, { status: 400 });
    }
    update.is_active = body.is_active;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Verification gate: an unverified creator can edit/deactivate a package but
  // cannot ACTIVATE one (expose it to brands) until they earn the gold tick.
  if (update.is_active === true && creator.is_verified !== true) {
    return NextResponse.json(
      {
        error: "verification_required",
        message: "Get verified (gold tick) before activating packages. Submit your Aadhaar + PAN from the dashboard.",
      },
      { status: 403 },
    );
  }

  const { data, error } = await admin
    .from("creator_packages")
    .update(update)
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select("id, tier, price_paise, final_images, is_active")
    .single();

  if (error) {
    console.error("[creator/packages PATCH]", error);
    return NextResponse.json({ error: "Failed to update package" }, { status: 500 });
  }

  return NextResponse.json({ package: data });
}

// DELETE /api/creator/packages/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const creator = await getCreator(admin, user.id);
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });

  const { error } = await admin
    .from("creator_packages")
    .delete()
    .eq("id", id)
    .eq("creator_id", creator.id);

  if (error) {
    console.error("[creator/packages DELETE]", error);
    return NextResponse.json({ error: "Failed to delete package" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
