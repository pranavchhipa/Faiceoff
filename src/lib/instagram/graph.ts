// ─────────────────────────────────────────────────────────────────────────────
// Instagram Graph API client — fetch profile, media, insights
//
// All calls go through graph.instagram.com (NOT graph.facebook.com — that's
// the Facebook Graph API for Pages, different product).
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH = "https://graph.instagram.com";

export type AccountType = "BUSINESS" | "MEDIA_CREATOR" | "PERSONAL";

export interface InstagramProfile {
  id: string;
  username: string;
  account_type: AccountType;
  followers_count: number;
  media_count: number;
  profile_picture_url: string | null;
  biography: string | null;
  website: string | null;
  name: string | null;
}

/**
 * Fetch the connected creator's profile. Returns everything available
 * under `instagram_business_basic`.
 *
 * Note: `profile_picture_url` URLs are signed CDN links that expire — should
 * be re-fetched periodically OR proxied through our own R2 for stable URLs.
 * For MVP we cache the URL and refresh on the daily cron.
 */
export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const fields = [
    "id",
    "username",
    "account_type",
    "followers_count",
    "media_count",
    "profile_picture_url",
    "biography",
    "website",
    "name",
  ].join(",");

  const url = `${GRAPH}/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG profile fetch failed (${res.status}): ${text}`);
  }
  return (await res.json()) as InstagramProfile;
}

export interface InstagramMedia {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";
  media_url: string | null;
  permalink: string;
  thumbnail_url: string | null;
  caption: string | null;
  timestamp: string; // ISO
  like_count?: number;
  comments_count?: number;
}

/**
 * Recent media (up to `limit`, max 25 per page). Used to show post grid
 * + power per-media insights.
 */
export async function fetchRecentMedia(
  accessToken: string,
  limit = 12,
): Promise<InstagramMedia[]> {
  const fields = [
    "id",
    "media_type",
    "media_url",
    "permalink",
    "thumbnail_url",
    "caption",
    "timestamp",
    "like_count",
    "comments_count",
  ].join(",");

  const url = `${GRAPH}/me/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG media fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data: InstagramMedia[] };
  return json.data ?? [];
}

export interface InstagramInsights {
  reach: number;
  impressions: number;
  profile_views: number;
  follower_count_change: number;
  engagement_rate: number | null;
  // Sum over the period (last 30 days)
  total_likes: number;
  total_comments: number;
  total_saved: number;
}

/**
 * Fetch account-level insights for the last 30 days. Requires the
 * `instagram_business_manage_insights` permission which needs Meta app review.
 *
 * Metric availability differs by account type — BUSINESS gets more than
 * MEDIA_CREATOR. We request a safe subset and gracefully default to 0 on
 * unavailable metrics rather than failing the sync.
 */
export async function fetchInsights(
  accessToken: string,
  igUserId: string,
): Promise<InstagramInsights> {
  // 30-day window
  const sinceUnix = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const untilUnix = Math.floor(Date.now() / 1000);

  // Metrics that work for both BUSINESS and MEDIA_CREATOR
  const metrics = ["reach", "impressions", "profile_views"].join(",");

  const url = `${GRAPH}/${igUserId}/insights?metric=${metrics}&period=day&since=${sinceUnix}&until=${untilUnix}&access_token=${encodeURIComponent(accessToken)}`;

  let reach = 0;
  let impressions = 0;
  let profile_views = 0;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as {
        data: Array<{
          name: string;
          values: Array<{ value: number }>;
        }>;
      };
      for (const m of json.data ?? []) {
        const sum = (m.values ?? []).reduce((s, v) => s + (v.value ?? 0), 0);
        if (m.name === "reach") reach = sum;
        if (m.name === "impressions") impressions = sum;
        if (m.name === "profile_views") profile_views = sum;
      }
    }
  } catch {
    // Insights are best-effort — don't fail the whole sync if Meta hiccups
  }

  // Engagement: derive from recent media (likes + comments / reach)
  let total_likes = 0;
  let total_comments = 0;
  const total_saved = 0; // requires per-media insights; defer to Phase 2
  try {
    const media = await fetchRecentMedia(accessToken, 25);
    for (const m of media) {
      total_likes += m.like_count ?? 0;
      total_comments += m.comments_count ?? 0;
    }
  } catch {
    // ignore
  }

  const engagement_rate =
    reach > 0 ? (total_likes + total_comments) / reach : null;

  return {
    reach,
    impressions,
    profile_views,
    follower_count_change: 0, // requires audience_insights, not enabled by default
    engagement_rate,
    total_likes,
    total_comments,
    total_saved,
  };
}
