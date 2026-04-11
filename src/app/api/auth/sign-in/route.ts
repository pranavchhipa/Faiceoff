import { NextResponse } from "next/server";
import { generateAndSendOtp } from "@/lib/email/send-otp";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Generate OTP via admin API + send via Resend
  const { error } = await generateAndSendOtp(email);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
