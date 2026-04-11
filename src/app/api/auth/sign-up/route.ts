import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndSendOtp } from "@/lib/email/send-otp";

export async function POST(request: Request) {
  const { email, displayName, role, phone } = await request.json();

  if (!email || !displayName || !role) {
    return NextResponse.json(
      { error: "Email, display name, and role are required" },
      { status: 400 }
    );
  }

  if (role !== "creator" && role !== "brand") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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

  // ── Create auth user via admin (skips confirmation email entirely) ──
  if (!existingUser) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role,
        phone: phone || null,
      },
    });

    if (createError) {
      // User might exist in auth but not in public.users — continue to OTP
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
      { error: otpError, debug: process.env.NODE_ENV === "development" ? debug : undefined },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
