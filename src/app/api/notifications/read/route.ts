import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST /api/notifications/read
 *
 * Marks notifications read for the authenticated user.
 * Body: { ids?: string[], all?: boolean }
 *   - all=true → mark every unread notification read
 *   - ids → mark those specific ones read
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const admin = createAdminClient() as Admin;
  const now = new Date().toISOString();

  if (body.all === true) {
    await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.filter((x): x is string => typeof x === "string");
    if (ids.length > 0) {
      await admin
        .from("notifications")
        .update({ read_at: now })
        .eq("user_id", user.id)
        .in("id", ids);
    }
  }

  return NextResponse.json({ success: true });
}
