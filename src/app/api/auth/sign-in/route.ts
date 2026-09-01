import { NextResponse } from "next/server";
import { generateAndSendOtp } from "@/lib/email/send-otp";
import { rateLimit } from "@/lib/redis/rate-limiter";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Rate-limit the mailer: per-email (inbox bombing) AND per-IP (quota drain
  // across many target emails). verify-otp is limited separately.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`otp-send:${String(email).toLowerCase()}`, 5, "10 m"),
    rateLimit(`otp-send-ip:${ip}`, 20, "10 m"),
  ]);
  if (!byEmail.success || !byIp.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  // Generate OTP via admin API + send via Resend
  const { error } = await generateAndSendOtp(email);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
