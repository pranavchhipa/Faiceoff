/**
 * POST /api/cc/auth/login
 *
 * Body: { code: string, useBackup?: boolean }
 *
 *   • TOTP path: verifies the 6-digit code against the stored secret.
 *   • Backup path: matches the 10-digit code against bcrypt hashes; on
 *     match, that hash is removed (single-use).
 *
 * On success: creates an `owner_sessions` row + sets the cookie.
 *
 * Failure: 401 with no detail (don't reveal which path failed). Always
 * sleeps for ~80-150ms to dampen timing oracles.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptSecretFromStorage,
  findBackupCodeMatch,
  verifyToken,
  type StoredSecretRow,
} from "@/lib/cc/totp";
import { COOKIE_NAME, createSession } from "@/lib/cc/session";
import { logAuditFromRequest } from "@/lib/cc/audit";
import { isControlCentreEnabled } from "@/lib/cc/guard";
import { rateLimit } from "@/lib/redis/rate-limiter";

export const runtime = "nodejs";

async function constantTimeDelay() {
  // 80–150ms random — dampens any timing differences between paths.
  const ms = 80 + Math.floor(Math.random() * 70);
  await new Promise((r) => setTimeout(r, ms));
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: Request) {
  if (!isControlCentreEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Hard rate limit per IP — 6 attempts per 5 minutes. Slows brute force.
  const ip = clientIp(req) ?? "unknown";
  const rl = await rateLimit(`cc-login:${ip}`, 6, "5 m");
  if (!rl.success) {
    await constantTimeDelay();
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }

  let body: { code?: string; useBackup?: boolean };
  try {
    body = await req.json();
  } catch {
    await constantTimeDelay();
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const codeRaw = (body.code ?? "").trim();
  const useBackup = !!body.useBackup;
  if (!codeRaw) {
    await constantTimeDelay();
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: row } = await admin
    .from("owner_totp")
    .select(
      "id, totp_secret_encrypted, totp_secret_iv, totp_secret_tag, backup_codes",
    )
    .eq("id", 1)
    .maybeSingle();

  if (!row) {
    await constantTimeDelay();
    return NextResponse.json(
      { error: "not_configured" },
      { status: 401 },
    );
  }

  let valid = false;
  let usedBackup = false;
  let backupIdx = -1;

  if (useBackup) {
    const stored = (row.backup_codes as string[]) ?? [];
    backupIdx = await findBackupCodeMatch(codeRaw, stored);
    if (backupIdx >= 0) {
      valid = true;
      usedBackup = true;
    }
  } else {
    if (/^\d{6}$/.test(codeRaw)) {
      const secret = decryptSecretFromStorage(row as StoredSecretRow);
      valid = verifyToken(secret, codeRaw);
    }
  }

  if (!valid) {
    await constantTimeDelay();
    await logAuditFromRequest(req, null, {
      action: "auth.login_failed",
      payload: { useBackup },
    });
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  // Burn the used backup code if applicable.
  if (usedBackup && backupIdx >= 0) {
    const stored = (row.backup_codes as string[]) ?? [];
    stored.splice(backupIdx, 1);
    await admin
      .from("owner_totp")
      .update({ backup_codes: stored })
      .eq("id", 1);
  }

  await admin
    .from("owner_totp")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", 1);

  // Issue session
  const ua = req.headers.get("user-agent");
  const { token, expiresAt } = await createSession({ ip, userAgent: ua });

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: expiresAt,
    path: "/",
  });

  await logAuditFromRequest(req, token, {
    action: "auth.login",
    payload: { useBackup: usedBackup },
  });

  return NextResponse.json({ ok: true });
}
