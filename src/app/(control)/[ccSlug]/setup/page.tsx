/**
 * Control Centre TOTP setup wizard.
 *
 * One-time. First visitor with the secret slug becomes the owner. After
 * setup completes, this page returns 410 (already set up).
 *
 * Flow:
 *   1. Server generates secret + QR + backup codes (renders to client).
 *   2. User scans QR with Google Authenticator + saves backup codes.
 *   3. User enters their first 6-digit code → POST /api/cc/auth/verify-setup.
 *   4. On success: secret stored encrypted, backup codes hashed, page
 *      redirects to /<slug>/login.
 *
 * Security note: the secret + backup codes are sent ONCE in the page HTML.
 * They are never written to disk on the server beyond the encrypted form.
 * If the user navigates away mid-setup, they need to call /api/cc/auth/setup
 * again to get a NEW secret — the old one isn't persisted.
 */

import QRCode from "qrcode";
import {
  generateSecret,
  generateBackupCodes,
} from "@/lib/cc/totp";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCSetupPage({ params }: Props) {
  const { ccSlug } = await params;

  // Layout has already validated the slug AND confirmed TOTP isn't set
  // up yet (it redirects to /login if it is). We can go straight to
  // generating the secret.

  // Generate fresh secret + QR + codes for this rendering.
  const { secret, otpauthUri } = generateSecret();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 220,
    margin: 1,
    color: { dark: "#0d0e10", light: "#ffffff" },
  });
  const backupCodes = generateBackupCodes().map((b) => b.code);

  return (
    <div className="cc-auth-shell">
      <SetupForm
        ccSlug={ccSlug}
        secret={secret}
        qrDataUrl={qrDataUrl}
        backupCodes={backupCodes}
      />
    </div>
  );
}
