import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/generations/[id]/approval-id — returns the active approval row id for a generation
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: generationId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  // Verify user is the creator of this generation's collab session
  const { data: gen } = await admin
    .from("generations")
    .select("id, collab_session_id")
    .eq("id", generationId)
    .maybeSingle();

  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: session } = await admin
    .from("collab_sessions")
    .select("creator_id")
    .eq("id", gen.collab_session_id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator || creator.id !== session.creator_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: approval } = await admin
    .from("approvals")
    .select("id")
    .eq("generation_id", generationId)
    .in("status", ["pending", "auto_approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ approval_id: approval?.id ?? null });
}
