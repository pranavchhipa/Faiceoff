// Landing page imagery
// -------------------------------------------------------------
// Central source of truth for every photo used on marketing,
// auth, and demo pages. Keeping it here means swapping in new
// photos is a one-file change.
//
// Rules for replacement photos:
//  - MUST be Indian creators (Priya / Arjun / Meera are Indian names —
//    the stock photo must match that).
//  - MUST be relevant to the scene (Priya-with-sneakers should actually
//    show someone with sneakers, not just a portrait).
//  - Drop new files into `public/landing/` and update the path here.
//
// Current files live in /public/landing/ — swap them in place if you
// want different images; no code changes needed anywhere else.

// ── Creator portraits (base reference photos) ───────────────────────────────
export const CREATOR_PRIYA = "/landing/creator-face.jpg"; // Priya · Mumbai
export const CREATOR_ARJUN = "/landing/creator-2.jpg";    // Arjun · Bengaluru
export const CREATOR_MEERA = "/landing/creator-3.jpg";    // Meera · Delhi

// ── "Priya with product" composites — what Faiceoff generates ──────────────
// These stand in for AI-generated creator+product composites in the demo.
// Replace `/public/landing/product-*.jpg` with real Indian-creator-with-
// product photos when available (ideally generated through Faiceoff's own
// pipeline for full face consistency).
export const PRIYA_WITH_SNEAKERS = "/landing/product-sneaker.jpg";
export const PRIYA_WITH_PHONE    = "/landing/product-phone.jpg";
export const PRIYA_WITH_SKINCARE = "/landing/product-skincare.jpg";
export const PRIYA_WITH_FOOD     = "/landing/product-food.jpg";

// ── Convenience groupings ──────────────────────────────────────────────────
export const CREATORS = {
  priya: { src: CREATOR_PRIYA, label: "Priya · Mumbai" },
  arjun: { src: CREATOR_ARJUN, label: "Arjun · Bengaluru" },
  meera: { src: CREATOR_MEERA, label: "Meera · Delhi" },
} as const;

export const PRIYA_COMPOSITES = {
  sneaker:  PRIYA_WITH_SNEAKERS,
  phone:    PRIYA_WITH_PHONE,
  skincare: PRIYA_WITH_SKINCARE,
  food:     PRIYA_WITH_FOOD,
} as const;
