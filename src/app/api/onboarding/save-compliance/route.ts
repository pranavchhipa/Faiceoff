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

  const { blocked_concepts } = await request.json();

  if (!Array.isArray(blocked_concepts) || blocked_concepts.length === 0) {
    return NextResponse.json(
      { error: "At least one blocked concept is required" },
      { status: 400 },
    );
  }

  if (blocked_concepts.length > 50) {
    return NextResponse.json(
      { error: "Maximum 50 blocked concepts allowed" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Get creator ID
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

  // Delete existing compliance vectors for this creator
  await admin
    .from("creator_compliance_vectors")
    .delete()
    .eq("creator_id", creator.id);

  // Insert blocked concepts (embedding will be generated later via background job)
  // For now, store a placeholder zero-vector so the row is valid
  const zeroEmbedding = new Array(1536).fill(0);

  const inserts = blocked_concepts.map((concept: string) => ({
    creator_id: creator.id,
    blocked_concept: concept.trim().toLowerCase(),
    embedding: JSON.stringify(zeroEmbedding),
  }));

  const { error: insertErr } = await admin
    .from("creator_compliance_vectors")
    .insert(inserts);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Advance onboarding step
  await admin
    .from("creators")
    .update({ onboarding_step: "consent" })
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
