import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/creator/go-live — toggle creators.is_live
// Validates: onboarding_step = 'complete' + at least 1 active package
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, onboarding_step, is_live")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr || !creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });
  }

  let body: { is_live?: unknown };
  try { body = await request.json(); } catch { body = {}; }

  const targetLive = typeof body.is_live === "boolean" ? body.is_live : !creator.is_live;

  // If going live, validate preconditions
  if (targetLive) {
    const step = creator.onboarding_step as string;
    const legacyDone = ["lora_review", "pricing", "complete"].includes(step);
    if (!legacyDone) {
      return NextResponse.json(
        { error: "Complete onboarding before going live" },
        { status: 400 }
      );
    }

    const { data: activePkgs } = await admin
      .from("creator_packages")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("is_active", true)
      .limit(1);

    if (!activePkgs || activePkgs.length === 0) {
      return NextResponse.json(
        { error: "Set up at least one active package before going live" },
        { status: 400 }
      );
    }
  }

  const { error: updateErr } = await admin
    .from("creators")
    .update({ is_live: targetLive })
    .eq("id", creator.id);

  if (updateErr) {
    console.error("[creator/go-live]", updateErr);
    return NextResponse.json({ error: "Failed to update live status" }, { status: 500 });
  }

  return NextResponse.json({ is_live: targetLive });
}
