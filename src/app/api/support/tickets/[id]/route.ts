import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * GET /api/support/tickets/[id] — ticket detail + messages (owner only).
 * Marks operator replies as read for the user.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: ticket } = await admin
    .from("support_tickets")
    .select(
      "id, user_id, role, subject, category, status, priority, resolution_note, resolved_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages } = await admin
    .from("ticket_messages")
    .select("id, sender_kind, body, action_tag, attachment_url, attachment_type, attachment_name, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // Clear the user-side unread flag
  if (ticket) {
    void admin
      .from("support_tickets")
      .update({ has_unread_for_user: false })
      .eq("id", id);
  }

  return NextResponse.json({ ticket, messages: messages ?? [] });
}
