import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  // Create user without sending confirmation email
  // (email confirmation should be disabled in Supabase dashboard)
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(),
    options: {
      data: {
        display_name: displayName,
        role,
        phone: phone || null,
      },
    },
  });

  if (signUpError) {
    // If user already exists, that's fine — we'll just send OTP
    if (!signUpError.message.includes("already registered")) {
      return NextResponse.json(
        { error: signUpError.message },
        { status: 400 }
      );
    }
  }

  // Send OTP code (6-digit) — this is the only email the user receives
  const { error: otpError } = await supabase.auth.signInWithOtp({ email });

  if (otpError) {
    return NextResponse.json({ error: otpError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
