import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET so it can be called directly from browser address bar
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        error: "Not logged in",
        authError: authError?.message,
      });
    }

    const admin = createAdminClient();

    // Check current state
    const { data: creator, error: readErr } = await admin
      .from("creators")
      .select("id, onboarding_step, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({
        error: "DB read failed",
        detail: readErr.message,
      });
    }

    if (!creator) {
      return NextResponse.json({
        error: "No creator row found",
        user_id: user.id,
      });
    }

    const before = {
      id: creator.id,
      onboarding_step: creator.onboarding_step,
      is_active: creator.is_active,
    };

    // Force update to complete
    const { error: updateErr } = await admin
      .from("creators")
      .update({ onboarding_step: "complete", is_active: false })
      .eq("id", creator.id);

    if (updateErr) {
      return NextResponse.json({
        error: "Update failed",
        detail: updateErr.message,
        before,
      });
    }

    // Verify
    const { data: after } = await admin
      .from("creators")
      .select("onboarding_step, is_active")
      .eq("id", creator.id)
      .single();

    return NextResponse.json({
      success: true,
      before,
      after,
      message: "Onboarding marked complete. Refresh dashboard now.",
    });
  } catch (err) {
    return NextResponse.json({
      error: "Crash",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
