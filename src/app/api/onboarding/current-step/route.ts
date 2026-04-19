import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/onboarding/current-step
 *
 * Returns the creator's current onboarding step. Self-heals when the
 * creator row is missing — this can happen if an earlier verify-otp
 * succeeded at auth level but the follow-up DB insert failed (network
 * blip, retry, etc). Without self-healing the user would bounce
 * between /dashboard/onboarding and /dashboard/onboarding/identity
 * forever because every form submit would 404.
 */
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

  // Check role — brands shouldn't be on this flow at all
  const { data: publicUser } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (publicUser?.role === "brand") {
    return NextResponse.json(
      { error: "Brands don't use the creator onboarding flow" },
      { status: 400 },
    );
  }

  // Fetch creator — maybeSingle so missing row is NOT an error
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("onboarding_step")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    // Real DB error — bubble up so the client can show a retry UI
    return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  }

  if (!creator) {
    // No creator row yet — self-heal. This means verify-otp either never
    // ran or its row-insertion path silently failed. Either way, create
    // the row now so every downstream form has a target to update.
    const { error: upsertErr } = await admin
      .from("creators")
      .upsert(
        { user_id: user.id, onboarding_step: "identity" },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      console.error("[current-step] self-heal upsert failed:", upsertErr.message);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Also make sure public.users exists for this auth user.
    await admin
      .from("users")
      .upsert(
        {
          id: user.id,
          email: user.email ?? "",
          role: "creator",
          display_name:
            user.user_metadata?.display_name ??
            user.email?.split("@")[0] ??
            "Creator",
        },
        { onConflict: "id" },
      );

    return NextResponse.json({ step: "identity" });
  }

  return NextResponse.json({ step: creator.onboarding_step });
}
