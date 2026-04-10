import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STEPS = [
  "identity",
  "instagram",
  "categories",
  "compliance",
  "consent",
  "photos",
  "lora_review",
  "pricing",
  "complete",
] as const;

export async function POST(request: Request) {
  const { step } = await request.json();

  if (!step || !VALID_STEPS.includes(step)) {
    return NextResponse.json(
      { error: "Invalid onboarding step" },
      { status: 400 },
    );
  }

  // Get the authenticated user from session cookies
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client to bypass RLS for the update
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("creators")
    .update({ onboarding_step: step })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  // Sync display_name from auth metadata to users table
  const meta = user.user_metadata;
  if (meta?.full_legal_name || meta?.display_name) {
    await admin
      .from("users")
      .update({
        display_name: meta.full_legal_name ?? meta.display_name,
      })
      .eq("id", user.id);
  }

  return NextResponse.json({ success: true, step });
}
