// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/safety/[id]/approve
//
// Admin overrides Hive's rejection. Updates generation status to
// 'ready_for_approval' and creates a 48-hour approval record for the creator.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role !== "admin") return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: generationId } = await params;
  const admin = createAdminClient() as any;

  // Fetch the generation to confirm it exists and get creator_id
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .select("id, creator_id, campaign_id, status, image_url")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    console.error("[admin/safety/approve] gen fetch error:", genErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!gen) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  if (gen.status !== "needs_admin_review") {
    return NextResponse.json(
      { error: "generation_not_in_review", current_status: gen.status },
      { status: 409 },
    );
  }

  // Flip generation status to ready_for_approval
  const { error: updateErr } = await admin
    .from("generations")
    .update({ status: "ready_for_approval" })
    .eq("id", generationId);

  if (updateErr) {
    console.error("[admin/safety/approve] generation update error:", updateErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Create approval row with 48-hour expiry
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error: approvalErr } = await admin
    .from("approvals")
    .insert({
      generation_id: generationId,
      creator_id: gen.creator_id,
      status: "pending",
      expires_at: expiresAt,
    });

  if (approvalErr) {
    // If unique violation, approval already exists — not fatal
    if (approvalErr.code === "23505" || /unique/i.test(approvalErr.message)) {
      console.warn("[admin/safety/approve] approval already exists for gen", generationId);
    } else {
      console.error("[admin/safety/approve] approval insert error:", approvalErr);
      return NextResponse.json({ error: "approval_insert_failed" }, { status: 500 });
    }
  }

  // Audit log
  await admin.from("audit_log").insert({
    actor_type: "admin",
    actor_id: user.id,
    action: "admin_safety_approve",
    resource_type: "generation",
    resource_id: generationId,
    meta: { previous_status: "needs_admin_review" },
  });

  return NextResponse.json({ status: "admin_approved" });
}
