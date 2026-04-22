// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/admin/packs/[code] — partial update a pack
// DELETE /api/admin/packs/[code] — soft-delete (set is_active=false)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertPack, deactivatePack, getPackByCode } from "@/lib/billing";
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

// ── PATCH — partial update ────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { code } = await params;

  let updates: Partial<UpsertPackInput>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Merge code from URL with body updates
  const input = { code, ...updates } as UpsertPackInput;

  // Ensure required fields are present by fetching existing pack first
  let existing: UpsertPackInput;
  try {
    existing = await getPackByCode(code as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }

  const merged: UpsertPackInput = { ...existing, ...input };

  try {
    await upsertPack(merged);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/packs/[code]] PATCH error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const { data: pack } = await admin
    .from("credit_packs_catalog")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  return NextResponse.json({ pack });
}

// ── DELETE — soft-delete ──────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { code } = await params;

  try {
    await deactivatePack(code as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/packs/[code]] DELETE error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ deactivated: true, code });
}
