import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get creator record
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, onboarding_step")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // Mark onboarding as complete and deactivate pending review
  const { error: updateErr } = await admin
    .from("creators")
    .update({
      onboarding_step: "complete",
      is_active: false,
    })
    .eq("id", creator.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
