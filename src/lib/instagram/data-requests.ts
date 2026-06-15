// ─────────────────────────────────────────────────────────────────────────────
// Instagram data-request callbacks — signed_request verification + data erasure
//
// Meta calls two app-configured webhooks when a user removes our app or asks
// for their data to be deleted. Both POST a `signed_request` (the same format
// Facebook Login uses): `<base64url HMAC-SHA256 sig>.<base64url JSON payload>`,
// signed with our INSTAGRAM_APP_SECRET. We MUST verify the signature before
// trusting the `user_id` inside — otherwise anyone could wipe a creator's row.
//
//   • Deauthorize callback  → user revoked app access. Stop using their token.
//   • Data deletion request → user wants their IG-derived data erased.
//
// `user_id` in the payload is Meta's IG-scoped user id == creators.instagram_user_id.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SignedRequestPayload {
  /** Meta IG-scoped user id — matches creators.instagram_user_id */
  user_id: string;
  algorithm?: string;
  issued_at?: number;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Verify + decode Meta's signed_request. Returns the payload only if the
 * HMAC-SHA256 signature checks out against INSTAGRAM_APP_SECRET. Returns null
 * for anything malformed, mis-signed, or missing a user_id — callers MUST treat
 * null as "reject, do nothing".
 */
export function parseSignedRequest(signedRequest: string | null | undefined): SignedRequestPayload | null {
  if (!signedRequest || typeof signedRequest !== "string" || !signedRequest.includes(".")) {
    return null;
  }
  const dot = signedRequest.indexOf(".");
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedSig || !encodedPayload) return null;

  // Buffer.from(..,'base64url') never throws — it silently drops junk — so we
  // reject malformed halves explicitly here rather than relying on a (useless)
  // try/catch around the decode.
  if (!BASE64URL.test(encodedSig) || !BASE64URL.test(encodedPayload)) return null;

  // Verification needs ONLY the secret. Read it directly (not via getOAuthConfig,
  // which also requires INSTAGRAM_APP_ID) so a missing/blank app id — irrelevant
  // to HMAC — can never make us 400 a legitimately-signed Meta request.
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) return null;

  const sig = Buffer.from(encodedSig, "base64url");
  if (sig.length === 0) return null;

  // Signature is computed over the RAW base64url payload string, not the decoded
  // JSON. Length-guard before timingSafeEqual (it throws on length mismatch), and
  // compare in constant time to avoid leaking validity via timing.
  const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return null;
  }

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SignedRequestPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.algorithm && String(payload.algorithm).toUpperCase().replace(/-/g, "") !== "HMACSHA256") {
    return null;
  }
  if (!payload.user_id || typeof payload.user_id !== "string") return null;

  // Lenient replay bound: if issued_at is present, reject blatantly future or
  // stale (>7d) tokens. We DON'T reject when absent — some IG payloads omit it,
  // and re-running an erase is idempotent. 7d comfortably covers Meta retries.
  if (typeof payload.issued_at === "number" && Number.isFinite(payload.issued_at)) {
    const now = Math.floor(Date.now() / 1000);
    const SEVEN_DAYS = 7 * 24 * 3600;
    if (payload.issued_at > now + 300 || payload.issued_at < now - SEVEN_DAYS) {
      return null;
    }
  }

  return payload;
}

/**
 * IG connection columns nulled when a creator disconnects / revokes. Mirrors the
 * set used by /api/auth/instagram/disconnect. Keeps instagram_handle +
 * instagram_followers (a manually-entered handle stays valid after revoke).
 */
const IG_REVOKE_FIELDS = {
  instagram_user_id: null,
  instagram_access_token: null,
  instagram_token_expires_at: null,
  instagram_connected_at: null,
  instagram_account_type: null,
  instagram_profile_pic_url: null,
  instagram_media_count: null,
  instagram_insights: null,
  instagram_last_synced_at: null,
  instagram_verified: false,
} as const;

/**
 * Full data-deletion erases EVERY IG-derived field, including the handle +
 * follower count + bio that a revoke would keep — because a deletion request
 * means "remove the data you pulled from my Instagram", not just "stop using
 * it". `bio` is IG-authoritative for connected creators (set by the OAuth
 * callback + overwritten daily by the sync cron). The IG-sourced avatar lives on
 * the `users` row + auth metadata and is handled separately in clearInstagramByUserId.
 */
const IG_DELETE_FIELDS = {
  ...IG_REVOKE_FIELDS,
  instagram_handle: null,
  instagram_followers: null,
  bio: null,
} as const;

/**
 * Clear the IG connection on every creator row linked to this IG user id. We
 * read the matched rows first (we need user_id + the old profile-pic URL before
 * the update nulls them), then update, then — for "delete" only — also erase the
 * IG-sourced avatar mirror on the users row + Supabase auth metadata when it
 * still points at the IG photo the creator never replaced.
 *
 * @param igUserId  Meta IG-scoped user id from the verified payload.
 * @param mode      "revoke" (deauthorize) keeps handle/followers/bio/avatar;
 *                  "delete" (data-deletion) erases them too.
 * @returns number of creator rows updated (0 = nothing linked, still success).
 */
export async function clearInstagramByUserId(
  igUserId: string,
  mode: "revoke" | "delete",
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Snapshot BEFORE the update — the update nulls instagram_profile_pic_url, so
  // we can't recover it from a returning clause.
  const { data: matched } = await admin
    .from("creators")
    .select("id, user_id, instagram_profile_pic_url")
    .eq("instagram_user_id", igUserId);
  const rows = (matched ?? []) as Array<{
    id: string;
    user_id: string | null;
    instagram_profile_pic_url: string | null;
  }>;
  if (rows.length === 0) return 0;

  const { error } = await admin
    .from("creators")
    .update(mode === "delete" ? IG_DELETE_FIELDS : IG_REVOKE_FIELDS)
    .eq("instagram_user_id", igUserId);
  if (error) throw new Error(error.message);

  // Full deletion: also erase the IG-sourced avatar (users.avatar_url + auth
  // user_metadata) — but ONLY when it still equals the IG photo, so we never
  // wipe an avatar the creator later uploaded themselves.
  if (mode === "delete") {
    for (const r of rows) {
      if (!r.user_id || !r.instagram_profile_pic_url) continue;
      const { data: u } = await admin
        .from("users")
        .select("avatar_url")
        .eq("id", r.user_id)
        .maybeSingle();
      if (u?.avatar_url && u.avatar_url === r.instagram_profile_pic_url) {
        await admin.from("users").update({ avatar_url: null }).eq("id", r.user_id);
        try {
          await admin.auth.admin.updateUserById(r.user_id, {
            user_metadata: { avatar_url: null },
          });
        } catch (e) {
          console.error("[ig/data-requests] auth avatar clear failed", e);
        }
      }
    }
  }

  return rows.length;
}

/** Base URL for building the user-facing deletion-status link Meta requires. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://faiceoff.com"
  ).replace(/\/$/, "");
}

/** Redact an IG user id for logs — it's user-linkable PII + the destructive match key. */
export function redactUserId(id: string | null | undefined): string {
  if (!id) return "unknown";
  return `${id.slice(0, 6)}…(${id.length})`;
}
