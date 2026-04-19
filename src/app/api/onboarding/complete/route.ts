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

    // Mark onboarding as complete and make the creator discoverable.
    //
    // Historic bug: this route used to set `is_active: false` because the
    // old pipeline required a creator-approved LoRA model before they
    // could be licensed by brands. With the pipeline now using reference
    // photos as face anchors directly (see lib/ai/pipeline-router.ts),
    // there's no "wait for training" gate — completing onboarding means
    // the creator is ready. Leaving this as `false` silently black-holed
    // every new signup: they'd never appear in /api/creators, brands
    // couldn't build campaigns against them, and generations would fail
    // the `is_active = true` filter in /api/generations/create.
    //
    // (save-categories already sets is_active=true earlier in the flow,
    // but we re-assert it here so a creator who re-completes onboarding
    // — e.g. via force-complete — ends up active.)
    const { error: updateErr } = await admin
      .from("creators")
      .update({
        onboarding_step: "complete",
        is_active: true,
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
