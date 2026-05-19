// ─────────────────────────────────────────────────────────────────────────────
// Slug helpers — URL-safe handle generation for /creators/<slug>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lowercase, replace whitespace + underscores with hyphens, strip all non
 * a-z 0-9 hyphen, collapse multiple hyphens, trim hyphens from ends.
 * Examples:
 *   "Burhrani Benya"  → "burhrani-benya"
 *   "pranav_chhipa01" → "pranav-chhipa01"
 *   "@The_Real-X "    → "the-real-x"
 */
export function slugify(input: string): string {
  return (input ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/^@+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate a user-submitted custom slug.
 *  - 3-32 chars
 *  - only a-z 0-9 hyphen
 *  - no leading/trailing hyphen
 *  - not in the reserved list (would shadow real routes)
 */
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "brand",
  "creator",
  "creators",
  "dashboard",
  "discover",
  "for-brands",
  "for-creators",
  "help",
  "login",
  "logout",
  "marketing",
  "onboarding",
  "pricing",
  "privacy",
  "refund",
  "settings",
  "signup",
  "terms",
  "verify",
  "vault",
  "wallet",
  "withdraw",
  "creator-agreement",
  "contact",
]);

export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!slug) return { ok: false, reason: "Slug is required" };
  if (slug.length < 3) return { ok: false, reason: "Must be at least 3 characters" };
  if (slug.length > 32) return { ok: false, reason: "Must be 32 characters or fewer" };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return {
      ok: false,
      reason: "Only lowercase letters, digits, and hyphens. Cannot start/end with hyphen.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: "This handle is reserved. Try a variation." };
  }
  return { ok: true };
}

/**
 * Pick a default slug for a creator based on their preferred source order.
 * Returns the slugified value; caller must still check DB uniqueness +
 * append a numeric suffix on collision.
 */
export function defaultSlugFor(opts: {
  instagramHandle?: string | null;
  displayName?: string | null;
  userIdShort?: string | null;
}): string {
  const candidates = [opts.instagramHandle, opts.displayName, opts.userIdShort]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map(slugify)
    .filter((v) => v.length >= 3);

  return candidates[0] ?? "creator";
}
