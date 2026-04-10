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

  const { instagram_handle, bio } = await request.json();

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

  // Clean handle (strip leading @)
  const cleanHandle =
    typeof instagram_handle === "string" && instagram_handle.startsWith("@")
      ? instagram_handle.slice(1)
      : instagram_handle || null;

  // Update instagram handle and bio
  const { error: updateErr } = await admin
    .from("creators")
    .update({
      instagram_handle: cleanHandle,
      bio: bio || null,
    })
    .eq("id", creator.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
