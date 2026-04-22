// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/stuck-gens/[id]/refund
//
// Marks a stuck generation as failed and refunds the brand's wallet reserve.
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

  // Fetch the generation
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .select("id, brand_id, cost_paise, status")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    console.error("[admin/stuck-gens/refund] gen fetch error:", genErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!gen) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  if (gen.status !== "processing") {
    return NextResponse.json(
      { error: "generation_not_processing", current_status: gen.status },
      { status: 409 },
    );
  }

  // Flip to failed
  const { error: updateErr } = await admin
    .from("generations")
    .update({ status: "failed" })
    .eq("id", generationId);

  if (updateErr) {
    console.error("[admin/stuck-gens/refund] generation update error:", updateErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Release wallet reserve
  if (gen.brand_id && gen.cost_paise) {
    try {
      await releaseReserve({
        brandId: gen.brand_id,
        amountPaise: gen.cost_paise,
        generationId,
      });
    } catch (err) {
      if (err instanceof BillingError) {
        console.warn("[admin/stuck-gens/refund] releaseReserve billing warn (non-fatal):", err.message);
      } else {
        console.error("[admin/stuck-gens/refund] releaseReserve unexpected error:", err);
      }
    }
  }

  // Refund 1 credit — stuck gen is a system failure, not brand's fault
  if (gen.brand_id) {
    await admin.rpc("add_credits_manual", {
      p_brand_id: gen.brand_id,
      p_credits: 1,
      p_bonus: 0,
      p_source: "admin_stuck_gen_refund",
      p_reference_id: generationId,
    }).catch((err: unknown) => {
      console.warn(
        "[admin/stuck-gens/refund] credit refund RPC failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  // Audit log
  await admin.from("audit_log").insert({
    actor_type: "admin",
    actor_id: user.id,
    action: "admin_stuck_gen_refund",
    resource_type: "generation",
    resource_id: generationId,
    meta: { refunded_paise: gen.cost_paise ?? 0 },
  });

  return NextResponse.json({ status: "refunded" });
}
