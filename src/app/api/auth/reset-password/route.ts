import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/reset-password
 *
 * Body: { access_token, password }
 *
 * Validates the recovery access_token (JWT issued by Supabase when the user
 * clicked the recovery email) by asking the Supabase auth server who that
 * token belongs to, then uses the admin API to update that user's password.
 *
 * This flow never touches the browser's Supabase session — it's immune to
 * cookie / flowType / PKCE mismatches.
 */
export async function POST(request: Request) {
  let body: { access_token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { access_token, password } = body;

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  if (!access_token || typeof access_token !== "string") {
    return NextResponse.json(
      { error: "Missing reset token. Request a new link." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Validate the JWT — Supabase will reject expired/invalid tokens here.
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(access_token);

  if (authError || !user) {
    return NextResponse.json(
      {
        error:
          "Reset link is invalid or has expired. Please request a new one.",
      },
      { status: 401 }
    );
  }

  // Update password via admin API — no user session required.
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
  });

  if (updateError) {
    console.error("[reset-password] updateUserById failed:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
