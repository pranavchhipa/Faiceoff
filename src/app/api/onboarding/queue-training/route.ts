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
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Check if a LoRA model record already exists
  const { data: existing } = await admin
    .from("creator_lora_models")
    .select("id, training_status")
    .eq("creator_id", creator.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Already queued/training — return current status
    return NextResponse.json({
      success: true,
      lora_id: existing.id,
      training_status: existing.training_status,
    });
  }

  // Create new LoRA model record with status "queued"
  // In production, this would also trigger Replicate training via Inngest
  const { data: lora, error: insertErr } = await admin
    .from("creator_lora_models")
    .insert({
      creator_id: creator.id,
      training_status: "queued",
      version: 1,
    })
    .select("id, training_status")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // TODO: In production, trigger Inngest event for Replicate LoRA training
  // await inngest.send({ name: "lora/training.requested", data: { creator_id: creator.id, lora_id: lora.id } });

  return NextResponse.json({
    success: true,
    lora_id: lora.id,
    training_status: lora.training_status,
  });
}
