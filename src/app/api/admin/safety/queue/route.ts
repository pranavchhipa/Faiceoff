// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/safety/queue — generations pending admin safety review
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

  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("generations")
    .select("*")
    .eq("status", "needs_admin_review")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[admin/safety/queue] GET error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
