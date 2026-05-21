import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST /api/support/tickets/[id]/messages — user replies to their ticket.
 * Body: { message }
 * Re-opens a resolved ticket back to 'open' and flags it unread for the operator.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Message required (max 4000 chars)" }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (ticket.status === "closed") {
    return NextResponse.json(
      { error: "This ticket is closed. Open a new one." },
      { status: 400 },
    );
  }

  await admin.from("ticket_messages").insert({
    ticket_id: id,
    sender_kind: "user",
    sender_user_id: user.id,
    body: message,
  });

  // Re-open if it was resolved/waiting; flag unread for operator
  const newStatus = ticket.status === "resolved" ? "open" : ticket.status === "waiting_on_user" ? "in_progress" : ticket.status;
  await admin
    .from("support_tickets")
    .update({
      status: newStatus,
      has_unread_for_operator: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
