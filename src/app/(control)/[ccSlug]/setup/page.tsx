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

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateSecret,
  generateBackupCodes,
} from "@/lib/cc/totp";
import { getConfiguredSlug } from "@/lib/cc/guard";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCSetupPage({ params }: Props) {
  const { ccSlug } = await params;

  // Slug already validated by layout, but re-check defensively.
  if (ccSlug !== getConfiguredSlug()) {
    redirect("/");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_totp")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    // Already configured — go straight to login.
    redirect(`/${ccSlug}/login`);
  }

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
