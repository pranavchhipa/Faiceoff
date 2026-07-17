// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/stuck-gens/[id]/retry
//
// Re-dispatches a stuck generation through the live Gemini pipeline: resets
// status to 'draft' (the pipeline's atomic claim only accepts draft→generating)
// and re-invokes runGeneration(). No credit/wallet change — this is a replay
// of the same already-billed attempt, not a new one.
//
// Previously resubmitted to Replicate — dead code against the live provider,
// which is Gemini (run-generation.ts). Replicate submission removed.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGeneration } from "@/lib/ai/run-generation";

const STUCK_STATUSES = ["generating", "compliance_check", "output_check", "draft"];

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

  // Fetch the stuck generation
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .select("id, status")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    console.error("[admin/stuck-gens/retry] gen fetch error:", genErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!gen) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  if (!STUCK_STATUSES.includes(gen.status)) {
    return NextResponse.json(
      { error: "generation_not_stuck", current_status: gen.status },
      { status: 409 },
    );
  }

  // Reset to 'draft' so runGeneration's atomic draft→generating claim accepts it.
  const { error: updateErr } = await admin
    .from("generations")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", generationId);

  if (updateErr) {
    console.error("[admin/stuck-gens/retry] status reset error:", updateErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  after(async () => {
    try {
      await runGeneration(generationId);
    } catch (err) {
      console.error(
        `[admin/stuck-gens/retry] runGeneration replay failed for gen=${generationId}`,
        err,
      );
    }
  });

  // Audit log
  await admin.from("audit_log").insert({
    actor_type: "admin",
    actor_id: user.id,
    action: "admin_stuck_gen_retry",
    resource_type: "generation",
    resource_id: generationId,
    meta: {},
  });

  return NextResponse.json({ status: "requeued" });
}
