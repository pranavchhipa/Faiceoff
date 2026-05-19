// ─────────────────────────────────────────────────────────────────────────────
// Instagram sync — pulls profile + insights and writes to the creators row
//
// Used in three places:
//   1. OAuth callback (first connect)
//   2. Daily cron (refresh token if < 14d to expiry, resync profile data)
//   3. Manual resync button in /creator/settings
// ─────────────────────────────────────────────────────────────────────────────

import { decryptIgToken, encryptIgToken } from "@/lib/instagram/crypto";
import {
  fetchProfile,
  fetchInsights,
  type InstagramProfile,
  type InstagramInsights,
} from "@/lib/instagram/graph";
import { refreshLongLivedToken } from "@/lib/instagram/oauth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface CreatorIgRow {
  id: string;
  instagram_user_id: string | null;
  instagram_access_token: Buffer | null;
  instagram_token_expires_at: string | null;
  instagram_verified: boolean;
}

export interface SyncResult {
  ok: boolean;
  profile?: InstagramProfile;
  insights?: InstagramInsights;
  tokenRefreshed?: boolean;
  error?: string;
}

/**
 * Sync a single creator's IG profile + insights. Optionally refreshes the
 * long-lived token if it's within `refreshIfWithinDays` of expiry.
 *
 * `creatorRow` is passed in to avoid an extra DB roundtrip when the caller
 * already has it. Supabase returns bytea as a Buffer in node-postgres.
 */
export async function syncCreatorInstagram(
  admin: Admin,
  creatorRow: CreatorIgRow,
  opts: { refreshIfWithinDays?: number } = {},
): Promise<SyncResult> {
  const refreshWindow = opts.refreshIfWithinDays ?? 14;

  if (!creatorRow.instagram_verified || !creatorRow.instagram_access_token) {
    return { ok: false, error: "Creator has no verified IG connection" };
  }

  let accessToken: string;
  try {
    accessToken = decryptIgToken(creatorRow.instagram_access_token);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to decrypt IG token: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Refresh token if within the window ───────────────────────────────────
  let tokenRefreshed = false;
  if (creatorRow.instagram_token_expires_at) {
    const expiresAt = new Date(creatorRow.instagram_token_expires_at).getTime();
    const windowMs = refreshWindow * 24 * 60 * 60 * 1000;
    if (expiresAt - Date.now() < windowMs && expiresAt > Date.now()) {
      try {
        const refreshed = await refreshLongLivedToken(accessToken);
        accessToken = refreshed.access_token;
        tokenRefreshed = true;
        // Persist refreshed token + new expiry
        const newExpires = new Date(Date.now() + refreshed.expires_in * 1000);
        await admin
          .from("creators")
          .update({
            instagram_access_token: encryptIgToken(accessToken),
            instagram_token_expires_at: newExpires.toISOString(),
          })
          .eq("id", creatorRow.id);
      } catch (err) {
        // Refresh failed — but the existing token is still valid, continue
        // with the old one. Worst case: token expires and creator reconnects.
        console.warn(
          "[ig-sync] refresh failed, continuing with existing token",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // ── Fetch profile ────────────────────────────────────────────────────────
  let profile: InstagramProfile;
  try {
    profile = await fetchProfile(accessToken);
  } catch (err) {
    return {
      ok: false,
      error: `Profile fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Fetch insights (best-effort) ─────────────────────────────────────────
  let insights: InstagramInsights | undefined;
  try {
    insights = await fetchInsights(accessToken, profile.id);
  } catch (err) {
    // Insights failure shouldn't block the sync — profile is more important
    console.warn(
      "[ig-sync] insights fetch failed",
      err instanceof Error ? err.message : err,
    );
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  await admin
    .from("creators")
    .update({
      instagram_handle: profile.username,
      instagram_followers: profile.followers_count,
      instagram_account_type: profile.account_type,
      instagram_profile_pic_url: profile.profile_picture_url,
      instagram_media_count: profile.media_count,
      instagram_insights: insights ?? null,
      instagram_last_synced_at: new Date().toISOString(),
      // Mirror bio to the existing `bio` column if creator hasn't set one
      ...(profile.biography
        ? { bio: profile.biography }
        : {}),
    })
    .eq("id", creatorRow.id);

  return { ok: true, profile, insights, tokenRefreshed };
}
