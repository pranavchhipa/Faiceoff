// Landing page imagery
// -------------------------------------------------------------
// Central source of truth for every photo used on marketing,
// auth, and demo pages. Drop new files into `public/landing/`
// and update the path here.
import type { CSSProperties } from "react";

// ── Core 3 creators (used in cards, BrandDemo, AuthShell) ─────────────────
export const CREATOR_PRIYA = "/landing/creator-face.jpg";  // Priya · Mumbai
export const CREATOR_ARJUN = "/landing/creator-2.jpg";     // Arjun · Bengaluru
export const CREATOR_MEERA = "/landing/creator-3.jpg";     // Meera · Delhi

// ── Extra creators (used in expanded creator gallery) ─────────────────────
export const CREATOR_AJAY    = "/landing/creator-ajay.jpg";
export const CREATOR_NIDHI   = "/landing/creator-nidhi.jpg";
export const CREATOR_ALEX    = "/landing/creator-alex.jpg";
export const CREATOR_SAKSHI  = "/landing/creator-sakshi.jpg";
export const CREATOR_SHERYL  = "/landing/creator-sheryl.jpg";

// ── Priya × product composites (BrandDemo + VaultGallery) ─────────────────
export const PRIYA_WITH_SNEAKERS  = "/landing/product-sneaker.jpg";
export const PRIYA_WITH_PHONE     = "/landing/product-phone.jpg";
export const PRIYA_WITH_SKINCARE  = "/landing/product-skincare.jpg";
export const PRIYA_WITH_FOOD      = "/landing/product-food.jpg";
export const PRIYA_WITH_LIPSTICK  = "/landing/priya-lipstick.jpg";

// ── Arjun × product composites (variety in CreatorDemo) ───────────────────
export const ARJUN_WITH_HALDIRAM   = "/landing/arjun-haldiram.jpg";
export const ARJUN_WITH_PAPERBOAT  = "/landing/arjun-paperboat.jpg";
export const ARJUN_WITH_SMARTWATCH = "/landing/arjun-smartwatch.jpg";

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
  lipstick: PRIYA_WITH_LIPSTICK,
} as const;

export const ARJUN_COMPOSITES = {
  haldiram:   ARJUN_WITH_HALDIRAM,
  paperboat:  ARJUN_WITH_PAPERBOAT,
  smartwatch: ARJUN_WITH_SMARTWATCH,
} as const;

// Full extended creator roster for the expanded gallery
export const ALL_CREATORS = [
  { src: CREATOR_PRIYA,   name: "Priya",   city: "Mumbai",     niche: "Lifestyle · Streetwear",  price: "₹2,500" },
  { src: CREATOR_ARJUN,   name: "Raj",     city: "Bengaluru",  niche: "Tech · Lifestyle",         price: "₹2,000" },
  { src: CREATOR_MEERA,   name: "Naina",   city: "Delhi",      niche: "Food · Travel",            price: "₹1,800" },
  { src: CREATOR_AJAY,    name: "Ajay",    city: "Pune",       niche: "Fitness · Wellness",       price: "₹2,200" },
  { src: CREATOR_NIDHI,   name: "Nidhi",   city: "Hyderabad",  niche: "Beauty · Fashion",         price: "₹2,400" },
  { src: CREATOR_ALEX,    name: "Alex",    city: "Goa",        niche: "Travel · Surf",            price: "₹1,900" },
  { src: CREATOR_SAKSHI,  name: "Sakshi",  city: "Chandigarh", niche: "Dance · Music",            price: "₹2,100" },
  { src: CREATOR_SHERYL,  name: "Sheryl",  city: "Bangalore",  niche: "Skincare · Wellness",      price: "₹2,300" },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Watermark mask helper
// ─────────────────────────────────────────────────────────────────────────
// Gemini / Nano Banana stamps a small sparkle icon in the bottom-right
// corner of every generated image. Inline-applying this style to an <img>
// scales it slightly with anchor at top, so the bottom (~5%) gets cropped
// by the parent's overflow:hidden — masking the watermark.
//
// Usage:
//   <img src={...} style={WATERMARK_MASK} className="..." />
export const WATERMARK_MASK: CSSProperties = {
  transform: "scale(1.06)",
  transformOrigin: "50% 0%",
};
