// Landing page imagery
// -------------------------------------------------------------
// Realistic portraits + "creator-with-product" composites used across
// the marketing pages, auth shells, and demo widgets.
//
// Rules:
// - Always use Unsplash CDN URLs (whitelisted in next.config.ts)
// - Crop params force face-aware framing so the creator reads clearly
// - Same Unsplash photo used for "Priya" in every composite so the
//   demo feels like one creator appearing in different AI scenes.
// - All URLs are shoulder-up/lifestyle portraits of real people —
//   this is the realism pitch the product makes.

const UNSPLASH = (id: string, opts: string = "w=1000&q=85&auto=format&fit=crop&crop=faces") =>
  `https://images.unsplash.com/photo-${id}?${opts}`;

// ── Creator portraits (base reference photos) ───────────────────────────────
export const CREATOR_PRIYA = UNSPLASH("1531123897727-8f129e1688ce"); // South Asian woman, warm portrait
export const CREATOR_ARJUN = UNSPLASH("1507003211169-0a1dd7228f2d"); // man portrait
export const CREATOR_MEERA = UNSPLASH("1494790108377-be9c29b29330"); // woman portrait, soft light

// ── "Priya with product" composites — what Faiceoff generates ──────────────
// (Realistic stock photos of women actually holding / using each product.
// Used as stand-ins for AI-generated creator+product composites.)
export const PRIYA_WITH_SNEAKERS = UNSPLASH("1556906781-9a412961c28c");  // woman + sneakers
export const PRIYA_WITH_PHONE    = UNSPLASH("1573497019418-b400bb3ab074"); // woman on phone
export const PRIYA_WITH_SKINCARE = UNSPLASH("1616683693504-3ea7e9ad6fec"); // woman applying skincare
export const PRIYA_WITH_FOOD     = UNSPLASH("1493770348161-369560ae357d"); // woman with food/coffee

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
