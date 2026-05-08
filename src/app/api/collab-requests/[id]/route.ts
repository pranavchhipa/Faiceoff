import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/collab-requests/[id] — fetch request details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: req, error } = await admin
    .from("collab_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify caller is brand or creator on this request
  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

  const isBrand = brand?.id === req.brand_id;
  const isCreator = creator?.id === req.creator_id;

  if (!isBrand && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Enrich with creator + brand profile (display_name, avatar)
  let creator_name: string | null = null;
  let creator_avatar_url: string | null = null;
  let creator_handle: string | null = null;

  const { data: cRow } = await admin
    .from("creators")
    .select("user_id, instagram_handle")
    .eq("id", req.creator_id)
    .maybeSingle();
  if (cRow?.user_id) {
    const { data: cUser } = await admin
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", cRow.user_id)
      .maybeSingle();
    creator_name = cUser?.display_name ?? null;
    creator_avatar_url = cUser?.avatar_url ?? null;
    creator_handle = cRow.instagram_handle ?? null;
  }

  return NextResponse.json({
    request: {
      ...req,
      creator_name,
      creator_avatar_url,
      creator_handle,
    },
  });
}

// PATCH /api/collab-requests/[id] — brand cancels
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  let body: { action?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Only action=cancel is supported" }, { status: 400 });
  }

  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });

  const { data: req } = await admin
    .from("collab_requests")
    .select("id, status, brand_id")
    .eq("id", id)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.brand_id !== brand.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Cannot cancel a ${req.status} request` }, { status: 400 });
  }

  await admin
    .from("collab_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, status: "cancelled" });
}
