import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generate OTP via Supabase Admin API and send it via Resend.
 *
 * This bypasses Supabase's built-in mailer entirely, so we don't
 * depend on Supabase SMTP configuration (which often rate-limits
 * or fails on the free tier).
 */
export async function generateAndSendOtp(
  email: string
): Promise<{ error?: string; debug?: string }> {
  const admin = createAdminClient();

  // ── Step 1: Generate magic link via admin → returns raw OTP + action link ──
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError) {
    console.error("[send-otp] generateLink failed:", linkError.message);
    return {
      error: "Failed to generate verification code",
      debug: `generateLink: ${linkError.message}`,
    };
  }

  // ── Step 2: Extract OTP code from response ──
  const otp =
    linkData?.properties?.email_otp ??
    extractTokenFromLink(linkData?.properties?.action_link);

  if (!otp) {
    console.error(
      "[send-otp] No OTP in response. Properties:",
      JSON.stringify(linkData?.properties, null, 2)
    );
    return {
      error: "Failed to generate verification code",
      debug: `No OTP found. Keys: ${Object.keys(linkData?.properties ?? {}).join(", ")}`,
    };
  }

  console.log(`[send-otp] OTP generated for ${email} (length: ${otp.length})`);

  // ── Step 3: Send via Resend ──
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { error: "Email service not configured", debug: "RESEND_API_KEY missing" };
  }

  const resend = new Resend(apiKey);
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? "Faiceoff <onboarding@resend.dev>";

  try {
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "Your Faiceoff verification code",
      html: otpEmailTemplate(otp),
    });

    if (emailError) {
      console.error("[send-otp] Resend error:", JSON.stringify(emailError));
      return {
        error: "Failed to send verification email",
        debug: `Resend: ${emailError.message ?? JSON.stringify(emailError)}`,
      };
    }

    console.log(`[send-otp] Email sent to ${email}, id: ${emailData?.id}`);
    return {};
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-otp] Resend exception:", msg);
    return {
      error: "Failed to send verification email",
      debug: `Resend exception: ${msg}`,
    };
  }
}

/** Extract token query param from a Supabase action link */
function extractTokenFromLink(link?: string): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.searchParams.get("token");
  } catch {
    return null;
  }
}

/** Minimal branded OTP email */
function otpEmailTemplate(otp: string): string {
  return `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 40px 24px; text-align: center;">
    <h1 style="font-size: 24px; font-weight: 700; color: #1a1513; margin: 0 0 8px;">
      Faiceoff
    </h1>
    <p style="font-size: 14px; color: #8a8685; margin: 0 0 32px;">
      AI Likeness Licensing Marketplace
    </p>
    <div style="background: #f7f5f2; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
      <p style="font-size: 13px; color: #8a8685; margin: 0 0 12px;">
        Your verification code
      </p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1513; margin: 0;">
        ${otp}
      </p>
    </div>
    <p style="font-size: 13px; color: #b0aeac; margin: 0;">
      This code expires in 10 minutes. If you didn&rsquo;t request this, ignore this email.
    </p>
  </div>
  `;
}
