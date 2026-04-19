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
  const body = await request.json();
  const { step, kyc_document_url, kyc_status, gender } = body;

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

  // Build the update payload
  const updatePayload: {
    onboarding_step: string;
    kyc_document_url?: string;
    kyc_status?: "not_started" | "pending" | "approved" | "rejected";
    gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
  } = { onboarding_step: step };

  // Add KYC fields if provided (from identity step)
  if (kyc_document_url) {
    updatePayload.kyc_document_url = kyc_document_url;
  }
  if (kyc_status && ["not_started", "pending", "approved", "rejected"].includes(kyc_status)) {
    updatePayload.kyc_status = kyc_status as "not_started" | "pending" | "approved" | "rejected";
  }
  if (gender && ["male", "female", "non_binary", "prefer_not_to_say"].includes(gender)) {
    updatePayload.gender = gender as "male" | "female" | "non_binary" | "prefer_not_to_say";
  }

  // Use admin client to bypass RLS for the update
  const admin = createAdminClient();
  // Cast: the `gender` column was added in migration 00018 but types
  // haven't been regenerated yet. Safe because update-step is the only
  // writer and we've validated the enum above.
  const { error: updateError } = await admin
    .from("creators")
    .update(updatePayload as never)
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
