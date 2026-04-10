import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get creator's current onboarding step
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("onboarding_step")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    // No creator row yet -- start at identity
    return NextResponse.json({ step: null });
  }

  return NextResponse.json({ step: creator.onboarding_step });
}
