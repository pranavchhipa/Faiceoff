/**
 * POST /api/creator/reference-photos/[id]/set-primary
 *
 * Mark one of the creator's reference photos as the primary (the photo
 * shown in Discovery cards + the brand-side discover page). Demotes any
 * existing primary on the same creator atomically.
 *
 * Auth: only the creator who owns the photo can change it.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: photoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve creator
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json(
      { error: "forbidden", reason: "not_a_creator" },
      { status: 403 },
    );
  }

  // Ensure the photo belongs to this creator
  const { data: photo } = await admin
    .from("creator_reference_photos")
    .select("id, creator_id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (photo.creator_id !== creator.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Demote all current primaries for this creator, then promote this one.
  // Two updates instead of a stored proc — fine for a low-traffic operation
  // and avoids a migration just for this.
  const demote = await admin
    .from("creator_reference_photos")
    .update({ is_primary: false })
    .eq("creator_id", creator.id)
    .eq("is_primary", true);
  if (demote.error) {
    console.error("[set-primary] demote failed", demote.error);
    return NextResponse.json(
      { error: "db_error", message: demote.error.message },
      { status: 500 },
    );
  }

  const promote = await admin
    .from("creator_reference_photos")
    .update({ is_primary: true })
    .eq("id", photoId);
  if (promote.error) {
    console.error("[set-primary] promote failed", promote.error);
    return NextResponse.json(
      { error: "db_error", message: promote.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, photo_id: photoId });
}
