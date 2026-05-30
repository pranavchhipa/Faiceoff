// POST /api/onboarding/save-compliance
//
// Creator picks the content categories they'll never appear in. We write these
// to `creator_blocked_categories` — the table the live 3-layer compliance check
// actually reads (Layer 1 keyword + Layer 3 LLM). Categories are constrained to
// the 9 enforceable values the keyword detector understands.
//
// (The old implementation wrote freeform text + zero-vectors to
// `creator_compliance_vectors`, which nothing enforced — that's been removed.)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// Must match the Category union in src/lib/compliance/category-mapping.ts —
// these are the only values the keyword detector + LLM layer enforce.
const ENFORCEABLE = [
  "alcohol",
  "tobacco",
  "gambling",
  "political",
  "religious",
  "adult",
  "gun",
  "crypto",
  "drugs",
] as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { categories?: unknown }).categories;
  const categories = Array.isArray(raw)
    ? Array.from(
        new Set(
          raw
            .filter((c): c is string => typeof c === "string")
            .map((c) => c.trim().toLowerCase())
            .filter((c) => (ENFORCEABLE as readonly string[]).includes(c)),
        ),
      )
    : [];

  // Blocking nothing is a valid choice — the creator is open to all categories.

  const admin = createAdminClient() as Admin;

  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (creatorErr || !creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
  }

  // Replace the creator's blocklist with the new selection.
  await admin.from("creator_blocked_categories").delete().eq("creator_id", creator.id);

  if (categories.length > 0) {
    const now = new Date().toISOString();
    // Columns are exactly (creator_id, category, blocked_at) — no `reason`.
    const inserts = categories.map((category) => ({
      creator_id: creator.id,
      category,
      blocked_at: now,
    }));
    const { error: insertErr } = await admin
      .from("creator_blocked_categories")
      .insert(inserts);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  await admin
    .from("creators")
    .update({ onboarding_step: "consent" })
    .eq("user_id", user.id);

  return NextResponse.json({ success: true, blocked: categories });
}
