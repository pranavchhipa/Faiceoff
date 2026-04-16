import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/forgot-password
 *
 * Kicks off Supabase's password reset flow. Supabase will email the user a
 * link pointing at `${NEXT_PUBLIC_APP_URL}/reset-password` with a recovery
 * token in the URL hash. The /reset-password page exchanges that for a
 * session and lets the user set a new password.
 *
 * We always return 200 (even if the email doesn't exist) to avoid leaking
 * which emails are registered.
 *
 * Body: { email }
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { email } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/reset-password`,
  });

  if (error) {
    // Log but don't leak — always return "sent" to the user
    console.error("[forgot-password] Supabase error:", error.message);
  }

  return NextResponse.json({ success: true });
}
