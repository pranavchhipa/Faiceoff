/**
 * First-touch attribution.
 *
 * Captured the moment someone lands, stashed in localStorage, and read back
 * at signup so the users row records where that person actually came from.
 *
 * Why first-touch and why localStorage: a visitor rarely signs up on the page
 * they landed on. By the time they reach /auth/signup/creator,
 * `document.referrer` is faiceoff.com itself and the UTM params are long gone
 * from the URL — so reading either AT signup would credit every signup to
 * "direct" or to our own site. Stashing the first values means the Instagram
 * post or Google result that actually introduced them is what gets recorded,
 * even days later.
 */

const STORAGE_KEY = "fco:attribution";

export interface Attribution {
  referrer: string | null;
  landingPath: string | null;
  utm: Record<string, string> | null;
  source: string;
  capturedAt: string;
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/**
 * Trailing boundary is `(\.|$)`, not a bare `\.`: with a mandatory dot the
 * `wa\.me` and `t\.me` alternatives could never match, because nothing follows
 * `me` in those hostnames. WhatsApp short links — a primary sharing channel for
 * this product in India — were silently classified as generic referrals.
 */
/** Search engines worth separating from generic referrals. */
const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex)\./i;
const SOCIAL_HOSTS =
  /(^|\.)(instagram|facebook|fb|linkedin|lnkd|x|twitter|t|reddit|youtube|pinterest|threads|whatsapp|wa\.me|telegram|t\.me)(\.|$)/i;

/**
 * Coarse bucket so day-to-day questions ("how much came from social?") don't
 * need URL parsing in every query. The raw referrer is stored alongside, so
 * nothing is lost by bucketing.
 */
export function classifySource(
  referrer: string | null,
  utm: Record<string, string> | null,
): string {
  if (utm?.source) return "campaign";
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname;
    // Our own pages are not a source — treat as direct rather than "referral".
    if (/(^|\.)faiceoff\.com$/i.test(host)) return "direct";
    if (SEARCH_HOSTS.test(host)) return "organic_search";
    if (SOCIAL_HOSTS.test(host)) return "social";
    return "referral";
  } catch {
    return "referral";
  }
}

/**
 * Record the first touch. Safe to call on every page load — it only writes
 * once per browser, so an internal navigation can never overwrite the
 * original referrer.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return; // already have first touch

    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = params.get(`utm_${k}`);
      if (v) utm[k] = v.slice(0, 120);
    }

    const referrer = document.referrer || null;
    const value: Attribution = {
      referrer: referrer ? referrer.slice(0, 500) : null,
      landingPath: window.location.pathname.slice(0, 300),
      utm: Object.keys(utm).length > 0 ? utm : null,
      source: classifySource(referrer, Object.keys(utm).length ? utm : null),
      capturedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled — attribution is best-effort and must
    // never break a page load.
  }
}

/** Read the stored first touch, for sending along with a signup. */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}
