// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/packs — list all packs (including inactive)
// POST /api/admin/packs — create or update a pack (UpsertPackInput)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePacks, upsertPack } from "@/lib/billing";
import type { UpsertPackInput } from "@/lib/billing";

// ── Auth helper ───────────────────────────────────────────────────────────────

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

// ── GET — all packs (admin sees inactive too) ─────────────────────────────────

export async function GET(_req: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // getActivePacks only returns is_active=true — for admin we want all packs
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("credit_packs_catalog")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[admin/packs] GET error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ packs: data ?? [] });
}

// ── POST — create / update pack ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Partial<UpsertPackInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.code || !body.display_name) {
    return NextResponse.json(
      { error: "code and display_name are required" },
      { status: 400 },
    );
  }

  try {
    await upsertPack(body as UpsertPackInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/packs] POST upsertPack error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Fetch the newly upserted pack to return it
  const admin = createAdminClient() as any;
  const { data: pack } = await admin
    .from("credit_packs_catalog")
    .select("*")
    .eq("code", body.code)
    .maybeSingle();

  return NextResponse.json({ pack }, { status: 201 });
}
