import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/redis/rate-limiter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const VALID_CATEGORIES = [
  "generation_quality",
  "payment",
  "payout",
  "account",
  "collab",
  "bug",
  "feature_request",
  "other",
];

/**
 * GET /api/support/tickets — list the authenticated user's tickets.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;
  const { data: tickets } = await admin
    .from("support_tickets")
    .select(
      "id, subject, category, status, priority, has_unread_for_user, resolution_note, resolved_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ tickets: tickets ?? [] });
}

/**
 * POST /api/support/tickets — raise a new ticket.
 * Body: { subject, category, message, related_collab_session_id?, related_generation_id? }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 new tickets per user per hour
  const rl = await rateLimit(`support-ticket:${user.id}`, 5, "1 h");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many tickets. Please wait before opening another." },
      { status: 429 },
    );
  }

  let body: {
    subject?: unknown;
    category?: unknown;
    message?: unknown;
    related_collab_session_id?: unknown;
    related_generation_id?: unknown;
    attachment_url?: unknown;
    attachment_type?: unknown;
    attachment_name?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const category =
    typeof body.category === "string" && VALID_CATEGORIES.includes(body.category)
      ? body.category
      : "other";
  const attachmentUrl =
    typeof body.attachment_url === "string" && body.attachment_url ? body.attachment_url : null;

  if (!subject || subject.length > 140) {
    return NextResponse.json(
      { error: "Subject is required (max 140 chars)" },
      { status: 400 },
    );
  }
  // Message required unless a screenshot is attached
  if (!attachmentUrl && (!message || message.length > 4000)) {
    return NextResponse.json(
      { error: "Message is required (max 4000 chars)" },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;

  // Determine role snapshot (brand or creator)
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const role: "brand" | "creator" = brandRes.data ? "brand" : "creator";
  if (!brandRes.data && !creatorRes.data) {
    return NextResponse.json({ error: "No brand/creator profile" }, { status: 403 });
  }

  const { data: ticket, error: insErr } = await admin
    .from("support_tickets")
    .insert({
      user_id: user.id,
      role,
      subject,
      category,
      status: "open",
      priority: category === "payment" || category === "payout" ? "high" : "normal",
      related_collab_session_id:
        typeof body.related_collab_session_id === "string"
          ? body.related_collab_session_id
          : null,
      related_generation_id:
        typeof body.related_generation_id === "string"
          ? body.related_generation_id
          : null,
      has_unread_for_operator: true,
    })
    .select("id")
    .single();

  if (insErr || !ticket) {
    console.error("[support/tickets] insert failed", insErr);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }

  // First message = the body + optional screenshot
  await admin.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender_kind: "user",
    sender_user_id: user.id,
    body: message || null,
    attachment_url: attachmentUrl,
    attachment_type:
      typeof body.attachment_type === "string" ? body.attachment_type : null,
    attachment_name:
      typeof body.attachment_name === "string" ? body.attachment_name : null,
  });

  return NextResponse.json({ ticket_id: ticket.id, status: "open" }, { status: 201 });
}
