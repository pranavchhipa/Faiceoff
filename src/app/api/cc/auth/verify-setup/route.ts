/**
 * POST /api/cc/auth/verify-setup
 *
 * Finalize one-time TOTP setup. Body: { secret, backupCodes, code }.
 *
 *   • Verifies the 6-digit `code` against `secret` (the secret was
 *     generated server-side and shown ONCE to the user — they pass it
 *     back here together with the codes for the round-trip).
 *   • If a TOTP row already exists, returns 410 Gone.
 *   • On success: encrypts secret + hashes backup codes + inserts the
 *     singleton row.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  encryptSecretForStorage,
  hashBackupCodes,
  verifyToken,
} from "@/lib/cc/totp";
import { logAuditFromRequest } from "@/lib/cc/audit";
import { isControlCentreEnabled } from "@/lib/cc/guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isControlCentreEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { secret?: string; backupCodes?: string[]; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { secret, backupCodes, code } = body;
  if (!secret || !Array.isArray(backupCodes) || !code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_totp")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "already_configured" },
      { status: 410 },
    );
  }

  if (!verifyToken(secret, code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  // Persist
  const enc = encryptSecretForStorage(secret);
  const hashed = await hashBackupCodes(
    backupCodes.map((c: string) => ({ code: c })),
  );

  const { error } = await admin.from("owner_totp").insert({
    id: 1,
    ...enc,
    backup_codes: hashed,
  });
  if (error) {
    console.error("[cc/verify-setup] insert failed", error);
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }

  await logAuditFromRequest(req, null, {
    action: "auth.setup_complete",
  });

  return NextResponse.json({ ok: true });
}
