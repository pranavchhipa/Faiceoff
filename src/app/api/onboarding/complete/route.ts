import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[complete] auth error:", authError?.message);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[complete] user:", user.id);

    const admin = createAdminClient();

    // Get creator record
    const { data: creator, error: creatorErr } = await admin
      .from("creators")
      .select("id, onboarding_step")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creatorErr) {
      console.error("[complete] creator query error:", creatorErr.message);
      return NextResponse.json(
        { error: creatorErr.message },
        { status: 500 },
      );
    }

    if (!creator) {
      console.error("[complete] no creator row for user:", user.id);
      return NextResponse.json(
        { error: "Creator profile not found" },
        { status: 404 },
      );
    }

    console.log("[complete] creator:", creator.id, "current step:", creator.onboarding_step);

    // Mark onboarding as complete
    const { error: updateErr } = await admin
      .from("creators")
      .update({
        onboarding_step: "complete",
        is_active: false,
      })
      .eq("id", creator.id);

    if (updateErr) {
      console.error("[complete] update error:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log("[complete] success — step set to complete");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[complete] unhandled:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
