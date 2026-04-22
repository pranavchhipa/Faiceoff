// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/creator/blocked-categories/[category] — remove a blocked category
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
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

function isAllowedCategory(val: string): val is AllowedCategory {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(val);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Validate category param ────────────────────────────────────────────────
  const { category } = await params;

  if (!isAllowedCategory(category)) {
    return NextResponse.json(
      {
        error: "invalid_category",
        message: `Category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
        allowed: ALLOWED_CATEGORIES,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as any;

  // ── Resolve creator ────────────────────────────────────────────────────────
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[blocked-categories/delete] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json({ error: "not_a_creator" }, { status: 403 });
  }

  // ── Delete blocked category ────────────────────────────────────────────────
  const { error: deleteErr } = await admin
    .from("creator_blocked_categories")
    .delete()
    .eq("creator_id", (creator as { id: string }).id)
    .eq("category", category);

  if (deleteErr) {
    console.error("[blocked-categories/delete] delete failed", deleteErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ removed: category }, { status: 200 });
}
