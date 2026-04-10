import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: generationId } = await params;

  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Validate body ---
  let body: { action?: string; feedback?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { action, feedback } = body;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // --- Verify user is the creator assigned to this generation ---
  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (creatorError || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 403 },
    );
  }

  const { data: generation, error: genError } = await admin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("creator_id", creator.id)
    .single();

  if (genError || !generation) {
    return NextResponse.json(
      { error: "Generation not found or you are not the assigned creator" },
      { status: 404 },
    );
  }

  // --- Only allow approval/rejection of generations ready for approval ---
  if (generation.status !== "ready_for_approval") {
    return NextResponse.json(
      { error: "Generation is not ready for approval" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    // Update generation status
    const { error: updateGenError } = await admin
      .from("generations")
      .update({ status: "approved" })
      .eq("id", generationId);

    if (updateGenError) {
      return NextResponse.json(
        { error: "Failed to update generation" },
        { status: 500 },
      );
    }

    // Update approval row
    const { error: approvalError } = await admin
      .from("approvals")
      .update({
        status: "approved",
        feedback: feedback ?? null,
        decided_at: now,
      })
      .eq("generation_id", generationId)
      .eq("creator_id", creator.id);

    if (approvalError) {
      return NextResponse.json(
        { error: "Failed to update approval" },
        { status: 500 },
      );
    }

    // Trigger approved event
    await inngest.send({
      name: "generation/approved",
      data: { generation_id: generationId },
    });

    return NextResponse.json({ status: "approved" });
  }

  // --- Reject ---
  const { error: updateGenError } = await admin
    .from("generations")
    .update({ status: "rejected" })
    .eq("id", generationId);

  if (updateGenError) {
    return NextResponse.json(
      { error: "Failed to update generation" },
      { status: 500 },
    );
  }

  const { error: approvalError } = await admin
    .from("approvals")
    .update({
      status: "rejected",
      feedback: feedback ?? null,
      decided_at: now,
    })
    .eq("generation_id", generationId)
    .eq("creator_id", creator.id);

  if (approvalError) {
    return NextResponse.json(
      { error: "Failed to update approval" },
      { status: 500 },
    );
  }

  await inngest.send({
    name: "generation/rejected",
    data: { generation_id: generationId },
  });

  return NextResponse.json({ status: "rejected" });
}
