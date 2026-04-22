// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/creator/blocked-categories — list creator's blocked categories
// POST /api/creator/blocked-categories — add a category to the blocklist
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_CATEGORIES = [
  "alcohol",
  "tobacco",
  "gambling",
  "political",
  "religious",
  "adult",
  "crypto",
  "weapons",
  "pharma",
] as const;

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

const BlockCategorySchema = z.object({
  category: z.enum(ALLOWED_CATEGORIES),
  reason: z.string().max(500).optional(),
});

interface BlockedCategoryRow {
  category: string;
  blocked_at: string;
  reason: string | null;
}

// ── Auth + creator resolve helper ──────────────────────────────────────────

async function resolveCreator(user: { id: string }, admin: any) {
  const { data: creator, error } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { creator: creator as { id: string } | null, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;

  const { creator, error: creatorErr } = await resolveCreator(user, admin);
  if (creatorErr) {
    console.error("[blocked-categories] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json({ error: "not_a_creator" }, { status: 403 });
  }

  const { data: rows, error: fetchErr } = await admin
    .from("creator_blocked_categories")
    .select("category, blocked_at, reason")
    .eq("creator_id", creator.id)
    .order("blocked_at", { ascending: true });

  if (fetchErr) {
    console.error("[blocked-categories] fetch failed", fetchErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const blocked = ((rows ?? []) as BlockedCategoryRow[]).map((r) => ({
    category: r.category,
    blocked_at: r.blocked_at,
    reason: r.reason,
  }));

  return NextResponse.json({ blocked });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BlockCategorySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { category, reason } = parsed.data;

  const admin = createAdminClient() as any;

  const { creator, error: creatorErr } = await resolveCreator(user, admin);
  if (creatorErr) {
    console.error("[blocked-categories] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json({ error: "not_a_creator" }, { status: 403 });
  }

  // Insert with ON CONFLICT DO NOTHING — idempotent if already blocked.
  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await admin
    .from("creator_blocked_categories")
    .upsert(
      {
        creator_id: creator.id,
        category,
        blocked_at: now,
        reason: reason ?? null,
      },
      { onConflict: "creator_id,category", ignoreDuplicates: true },
    )
    .select("category, blocked_at")
    .maybeSingle();

  if (insertErr) {
    console.error("[blocked-categories] insert failed", insertErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // If ignoreDuplicates swallowed the insert (already existed), return the
  // existing row so the caller still gets the expected shape.
  if (!inserted) {
    const { data: existing, error: existErr } = await admin
      .from("creator_blocked_categories")
      .select("category, blocked_at")
      .eq("creator_id", creator.id)
      .eq("category", category)
      .maybeSingle();

    if (existErr || !existing) {
      // Row exists but we can't read it back — return minimal shape.
      return NextResponse.json(
        { category, blocked_at: now },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        category: (existing as { category: AllowedCategory }).category,
        blocked_at: (existing as { blocked_at: string }).blocked_at,
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    {
      category: (inserted as { category: AllowedCategory }).category,
      blocked_at: (inserted as { blocked_at: string }).blocked_at,
    },
    { status: 201 },
  );
}
