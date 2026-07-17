/**
 * DELETE /api/creator/reference-photos/[id]
 *
 * Removes one of the creator's reference photos — deletes the storage
 * object and the DB row. If the deleted photo was the primary, promotes
 * the next most-recently-uploaded remaining photo to primary.
 *
 * Auth: only the creator who owns the photo can delete it.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(
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
    .select("id, creator_id, storage_path, is_primary")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (photo.creator_id !== creator.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Delete the storage object first (best-effort — don't block the DB
  // delete if the object is already gone).
  if (photo.storage_path) {
    const { error: storageErr } = await admin.storage
      .from("reference-photos")
      .remove([photo.storage_path]);
    if (storageErr) {
      console.error("[reference-photos delete] storage remove failed", storageErr);
    }
  }

  const del = await admin
    .from("creator_reference_photos")
    .delete()
    .eq("id", photoId);
  if (del.error) {
    console.error("[reference-photos delete] db delete failed", del.error);
    return NextResponse.json(
      { error: "db_error", message: del.error.message },
      { status: 500 },
    );
  }

  // If the deleted photo was primary, promote the next-newest remaining
  // photo so the creator always has exactly one primary (when any remain).
  if (photo.is_primary) {
    const { data: next } = await admin
      .from("creator_reference_photos")
      .select("id")
      .eq("creator_id", creator.id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      const promote = await admin
        .from("creator_reference_photos")
        .update({ is_primary: true })
        .eq("id", next.id);
      if (promote.error) {
        console.error("[reference-photos delete] re-promote failed", promote.error);
      }
    }
  }

  return NextResponse.json({ ok: true, photo_id: photoId });
}
