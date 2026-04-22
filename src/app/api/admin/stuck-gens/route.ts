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

  const admin = createAdminClient() as any;

  // Generations that have been in 'processing' for > 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("generations")
    .select("*")
    .eq("status", "processing")
    .lt("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[admin/stuck-gens] GET error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
