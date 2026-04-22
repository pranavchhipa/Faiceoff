// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/safety/[id]/reject
//
// Admin final-rejects a generation that needed safety review. Refunds the
// brand's wallet reserve AND restores 1 credit (admin caught it, not creator's
// fault, so credit is returned).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve, BillingError } from "@/lib/billing";

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

  // Fetch generation
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .select("id, brand_id, cost_paise, status")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    console.error("[admin/safety/reject] gen fetch error:", genErr);
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

  // Flip generation to rejected
  const { error: updateErr } = await admin
    .from("generations")
    .update({ status: "rejected" })
    .eq("id", generationId);

  if (updateErr) {
    console.error("[admin/safety/reject] generation update error:", updateErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Refund wallet reserve (brand gets their INR back)
  if (gen.brand_id && gen.cost_paise) {
    try {
      await releaseReserve({
        brandId: gen.brand_id,
        amountPaise: gen.cost_paise,
        generationId,
      });
    } catch (err) {
      if (err instanceof BillingError) {
        console.warn("[admin/safety/reject] releaseReserve billing error (non-fatal):", err.message);
      } else {
        console.error("[admin/safety/reject] releaseReserve unexpected error:", err);
      }
    }
  }

  // Refund 1 credit — admin caught the bad content, brand shouldn't lose credit
  // We insert directly since addCredits requires a top-up reference; use admin RPC
  if (gen.brand_id) {
    const { error: creditRefundErr } = await admin.rpc("add_credits_manual", {
      p_brand_id: gen.brand_id,
      p_credits: 1,
      p_bonus: 0,
      p_source: "admin_safety_reject",
      p_reference_id: generationId,
    }).catch(() => ({ error: { message: "rpc_not_available" } }));

    if (creditRefundErr) {
      // Fallback: log in audit if RPC doesn't exist yet
      console.warn(
        "[admin/safety/reject] credit refund RPC failed (non-fatal, log only):",
        creditRefundErr.message,
      );
    }
  }

  // Audit log
  await admin.from("audit_log").insert({
    actor_type: "admin",
    actor_id: user.id,
    action: "admin_safety_reject",
    resource_type: "generation",
    resource_id: generationId,
    meta: { refunded_paise: gen.cost_paise ?? 0 },
  });

  return NextResponse.json({ status: "rejected" });
}
