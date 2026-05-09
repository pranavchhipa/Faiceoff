/**
 * POST /api/collabs/[id]/force-complete
 *
 * Brand-only escape hatch — closes an active collab early without
 * generating the remaining target images. Useful for:
 *  • Testing the completion flow end-to-end without burning credits.
 *  • Brands wanting to wrap up a collab they're satisfied with.
 *
 * What it does:
 *  • Sets `collab_sessions.status = 'completed'` (idempotent — no-op if
 *    already completed).
 *  • Returns the updated row.
 *  • License rows + escrow ledger entries already exist for each approved
 *    generation (created in the approval flow). Escrow release happens
 *    via the holding-period cron, independent of collab status. So no
 *    extra side-effects to fire here.
 *
 * Auth: caller must be the brand on this collab.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: collabId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve brand
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json(
      { error: "forbidden", reason: "brands_only" },
      { status: 403 },
    );
  }

  // Fetch collab and verify ownership
  const { data: session } = await admin
    .from("collab_sessions")
    .select("id, brand_id, status, approved_count, final_images_target")
    .eq("id", collabId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (session.brand_id !== brand.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (session.status === "completed") {
    return NextResponse.json({
      ok: true,
      already_completed: true,
      session_id: collabId,
    });
  }

  // Flip to completed
  const { data: updated, error: updateErr } = await admin
    .from("collab_sessions")
    .update({ status: "completed" })
    .eq("id", collabId)
    .select("id, status, approved_count, final_images_target")
    .single();

  if (updateErr) {
    console.error("[collabs/force-complete] update failed", updateErr);
    return NextResponse.json(
      { error: "db_error", message: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: updated,
  });
}
