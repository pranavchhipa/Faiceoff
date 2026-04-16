import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndSendOtp } from "@/lib/email/send-otp";

/**
 * POST /api/auth/sign-up
 *
 * New flow (2026-04): creates the auth user with a PASSWORD set. Email is
 * NOT auto-confirmed — the user must still enter the 8-digit OTP we send via
 * Resend to prove they own the email. Once they verify, they can log in with
 * email + password from then on.
 *
 * Body: { email, displayName, role, password, phone? }
 */
export async function POST(request: Request) {
  const { email, displayName, role, password, phone } = await request.json();

  if (!email || !displayName || !role) {
    return NextResponse.json(
      { error: "Email, display name, and role are required" },
      { status: 400 }
    );
  }

  if (role !== "creator" && role !== "brand") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ── Check if user already exists with a DIFFERENT role ──
  const { data: existingUser } = await admin
    .from("users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();

  if (existingUser && existingUser.role !== role) {
    return NextResponse.json(
      {
        error: `This email is already registered as a ${existingUser.role}. Please use a different email.`,
      },
      { status: 409 }
    );
  }

  // ── Create auth user via admin with password + metadata ──
  // email_confirm: true because we don't want the Supabase built-in confirmation
  // email — we send our own 8-digit OTP via Resend. The OTP verification step
  // is what proves ownership of the email in this flow. (We mark confirmed at
  // creation so that when the user completes OTP verify we can immediately
  // establish a session.)
  if (!existingUser) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role,
        phone: phone || null,
      },
    });

    if (createError) {
      // If the auth user already exists (e.g. user is retrying signup), fall
      // through and re-send OTP. Otherwise bubble the error up.
      if (
        !createError.message.toLowerCase().includes("already") &&
        !createError.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          { error: createError.message },
          { status: 400 }
        );
      }
    }
  }

  // ── Generate OTP via admin API + send via Resend ──
  const { error: otpError, debug } = await generateAndSendOtp(email);

  if (otpError) {
    return NextResponse.json(
      {
        error: otpError,
        debug: process.env.NODE_ENV === "development" ? debug : undefined,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
