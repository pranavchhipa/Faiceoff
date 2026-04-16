import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

/**
 * POST /api/auth/forgot-password
 *
 * Generates a recovery link via the Supabase Admin API and sends it via
 * Resend — same pattern as OTP, bypasses Supabase's built-in SMTP entirely.
 *
 * Always returns 200 to avoid leaking which emails are registered.
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

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Generate recovery link via admin API
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    });

  if (linkError) {
    // Log but don't leak — always return "sent" to the user
    console.error("[forgot-password] generateLink error:", linkError.message);
    return NextResponse.json({ success: true });
  }

  const recoveryLink = linkData?.properties?.action_link;
  if (!recoveryLink) {
    console.error("[forgot-password] No action_link in response");
    return NextResponse.json({ success: true });
  }

  // Send via Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[forgot-password] RESEND_API_KEY missing");
    return NextResponse.json({ success: true });
  }

  const resend = new Resend(apiKey);
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? "Faiceoff <onboarding@resend.dev>";

  try {
    const { error: emailError } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "Reset your Faiceoff password",
      html: resetEmailTemplate(recoveryLink),
    });

    if (emailError) {
      console.error("[forgot-password] Resend error:", JSON.stringify(emailError));
    }
  } catch (err) {
    console.error("[forgot-password] Resend exception:", err);
  }

  // Always return success
  return NextResponse.json({ success: true });
}

function resetEmailTemplate(link: string): string {
  return `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 40px 24px; text-align: center;">
    <h1 style="font-size: 24px; font-weight: 700; color: #1a1513; margin: 0 0 8px;">
      Faiceoff
    </h1>
    <p style="font-size: 14px; color: #8a8685; margin: 0 0 32px;">
      AI Likeness Licensing Marketplace
    </p>
    <div style="background: #f7f5f2; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
      <p style="font-size: 15px; color: #1a1513; font-weight: 600; margin: 0 0 16px;">
        Reset your password
      </p>
      <p style="font-size: 13px; color: #8a8685; margin: 0 0 20px;">
        Click the button below to set a new password. This link expires in 1 hour.
      </p>
      <a href="${link}" style="display: inline-block; background: #c9a96e; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 32px; border-radius: 8px;">
        Reset password
      </a>
    </div>
    <p style="font-size: 13px; color: #b0aeac; margin: 0;">
      If you didn&rsquo;t request this, you can safely ignore this email.
    </p>
  </div>
  `;
}
