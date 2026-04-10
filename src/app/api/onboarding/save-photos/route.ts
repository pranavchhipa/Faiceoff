import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storage_paths } = await request.json();

  if (!Array.isArray(storage_paths) || storage_paths.length === 0) {
    return NextResponse.json(
      { error: "At least one photo path is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Get creator record
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // Insert photo records
  const inserts = storage_paths.map((path: string) => ({
    creator_id: creator.id,
    storage_path: path,
  }));

  const { error: insertErr } = await admin
    .from("creator_reference_photos")
    .insert(inserts);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, creator_id: creator.id });
}
