// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stuck-gens
//
// Lists generations stuck in 'processing' status for more than 5 minutes.
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

export async function GET(_req: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin2 = createAdminClient() as any;

  // Generations stuck in any in-flight pipeline status for > 5 minutes.
  // 'processing' was the legacy status name; current statuses are
  // generating / compliance_check / output_check (per migration 00009).
  // Including all so admin can triage anywhere the pipeline got stuck.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const STUCK_STATUSES = [
    "generating",
    "compliance_check",
    "output_check",
    "processing",
    "draft",
  ];

  const { data, error } = await admin2
    .from("generations")
    .select(
      "id, status, brand_id, creator_id, cost_paise, created_at, updated_at, image_url, structured_brief",
    )
    .in("status", STUCK_STATUSES)
    .lt("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[admin/stuck-gens] GET error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
