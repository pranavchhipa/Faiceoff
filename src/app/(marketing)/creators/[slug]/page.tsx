/**
 * Public Creator Profile — /creators/[slug]
 *
 * Phone-width dark editorial sheet (440px max). Designed in Claude Design
 * (claude.ai/design) and ported here pixel-close. Linktree-style profile that
 * lives in a creator's Instagram bio.
 *
 * Layout (top → bottom):
 *   nav · hero (avatar + Faiceoff seal + name + handle + followers + bio)
 *   trust strip · Style Previews (2×2) · categories chips · pricing tiers · CTA
 *   custom links (Linktree-style) · footer
 *
 * Data: pulled from /api/public/creators/[slug] (PublicProfileResponse).
 * Preview mode: ?preview=1 + authenticated owner shows the page even when
 * profile_published=false, with a sticky amber banner up top.
 *
 * Styles are embedded as a single <style> block scoped under .fco-profile-v2
 * to avoid leaking — every selector below is prefixed with the wrapper class.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_CATEGORIES, type DemoCategoryKey } from "@/lib/profile/demo-prompts";
import {
  detectPlatform,
  platformLabel,
  type SocialPlatform,
} from "@/lib/profile/platform-detect";
import { PlatformIcon } from "@/components/profile/platform-icon";
import { Logo } from "@/components/brand/logo";
import { COMPANY } from "@/lib/constants/company";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://faiceoff.com";

interface PublicProfileResponse {
  slug: string;
  published: boolean;
  preview: boolean;
  published_at: string | null;
  theme: string;
  is_live: boolean;
  creator: {
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    instagram_handle: string | null;
    instagram_followers: number | null;
    instagram_account_type: string | null;
    instagram_verified: boolean;
    instagram_media_count: number | null;
    youtube_handle: string | null;
    youtube_subscribers: number | null;
  };
  categories: DemoCategoryKey[];
  links: Array<{
    id: string;
    label: string;
    url: string;
    /**
     * Tagged by the links API when a creator saves their list. Older rows
     * (saved before the tag column landed) don't have this — we fall back to
     * a client-side detectPlatform() below so the icon row still works.
     */
    platform?: SocialPlatform | null;
  }>;
  samples: Array<{
    id: string;
    category: DemoCategoryKey;
    image_url: string;
    created_at: string;
  }>;
  packages: Array<{
    id: string;
    tier: string;
    price_paise: number;
    final_images: number;
    description: string | null;
  }>;
  stats: {
    completed_collabs: number;
    approval_rate_pct: number | null;
  };
}

async function fetchProfile(
  slug: string,
  opts: { preview?: boolean; cookieHeader?: string | null } = {},
): Promise<PublicProfileResponse | null> {
  const url = `${APP_URL}/api/public/creators/${slug}${opts.preview ? "?preview=1" : ""}`;
  const res = await fetch(url, {
    next: opts.preview ? { revalidate: 0 } : { revalidate: 60 },
    cache: opts.preview ? "no-store" : undefined,
    headers: opts.cookieHeader ? { cookie: opts.cookieHeader } : undefined,
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfileResponse;
}

/* ───────── Metadata ───────── */

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchProfile(slug);
  if (!data) return { title: "Creator not found · Faiceoff" };
  const title = `${data.creator.display_name} · Brief them on Faiceoff`;
  const description = data.creator.bio
    ? data.creator.bio.slice(0, 160)
    : `Launch a brand campaign with ${data.creator.display_name}. ${data.categories.length} signature categories, ${data.creator.instagram_followers ?? 0} IG followers.`;
  const ogImage = `${APP_URL}/api/public/creators/${slug}/og`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/creators/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "profile",
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

/* ───────── Helpers ───────── */

function inr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toString();
}

/** Auto-pick a small monoline glyph for a custom link based on its URL. */
function LinkGlyph({ url }: { url: string }) {
  const u = url.toLowerCase();
  // Common identifiable destinations get specific glyphs; otherwise generic globe.
  if (u.startsWith("mailto:")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (u.startsWith("tel:") || u.includes("wa.me") || u.includes("whatsapp")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2.03Z" />
      </svg>
    );
  }
  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (u.includes("instagram.com")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (u.includes(".pdf") || u.includes("/press") || u.includes("media-kit") || u.includes("brief")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 4h12l4 4v12H4z" />
        <path d="M16 4v4h4" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }
  // Default — sparkle star (signals "linked content")
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
    </svg>
  );
}

/**
 * Tier metadata — keeps card copy editorial.
 * Falls back gracefully for any custom tier name not in the map.
 */
const TIER_META: Record<string, { label: string; tagline: string }> = {
  starter: { label: "Starter", tagline: "1 category · 48h turnaround · Licensed 6 months" },
  frame: { label: "Frame", tagline: "1 category · 48h turnaround · Licensed 6 months" },
  pro: { label: "Pro", tagline: "2 categories · 48h turnaround · Licensed 12 months" },
  feature: { label: "Feature", tagline: "2 categories · 48h turnaround · Licensed 12 months" },
  premium: { label: "Premium", tagline: "All categories · 48h turnaround · Licensed forever" },
  cover: { label: "Cover", tagline: "All categories · 48h turnaround · Licensed forever" },
};

/* ───────── Page-scoped CSS ─────────
   All selectors below are anchored to the .fco-profile-v2 wrapper so this
   block can be inlined safely without polluting other routes' styles. */
const PAGE_CSS = `
.fco-profile-v2 {
  --bg: #0a0908;
  --elev: #14110f;
  --overlay: #1a1612;
  --text: #f5ebd6;
  --muted: #a89570;
  --dim: #6e6457;
  --hair: #2a2520;
  --hair-soft: #1f1b17;
  --accent: #e8825d;
  --accent-deep: #c96a47;
  --gold: #d4a557;
  --gold-light: #eccb7d;
  --gold-deep: #a87f3e;
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-label: 'Plus Jakarta Sans', system-ui, sans-serif;

  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.5;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.fco-profile-v2 * { box-sizing: border-box; }
.fco-profile-v2 ::selection { background: var(--accent); color: var(--bg); }

/* Page-scoped film grain (NOT body-level — must not leak to other routes) */
.fco-profile-v2::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.06;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}

.fco-profile-v2 .stage {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background:
    radial-gradient(900px 600px at 50% -200px, rgba(232, 130, 93, 0.06), transparent 60%),
    radial-gradient(700px 500px at 50% 120%, rgba(232, 130, 93, 0.04), transparent 70%),
    var(--bg);
}

.fco-profile-v2 .sheet {
  width: 100%;
  max-width: 440px;
  background: var(--bg);
  position: relative;
  overflow: hidden;
  border-left: 1px solid var(--hair-soft);
  border-right: 1px solid var(--hair-soft);
}

.fco-profile-v2 .hero-glow {
  position: absolute;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 540px;
  height: 540px;
  background: radial-gradient(circle, rgba(232, 130, 93, 0.18) 0%, rgba(232, 130, 93, 0.06) 35%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}

/* ====== NAV ====== */
.fco-profile-v2 nav.top {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
}
.fco-profile-v2 .brand-link { display: inline-flex; align-items: center; }
.fco-profile-v2 .nav-pill {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 8px 14px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 180ms ease;
  cursor: pointer;
}
.fco-profile-v2 .nav-pill:hover { border-color: var(--muted); transform: translateY(-1px); }
.fco-profile-v2 .nav-pill .arr { font-size: 11px; opacity: 0.8; transition: transform 180ms ease; }
.fco-profile-v2 .nav-pill:hover .arr { transform: translate(2px, -2px); }

/* ====== HERO ====== */
.fco-profile-v2 .hero {
  position: relative;
  z-index: 1;
  padding: 18px 28px 22px;
  text-align: center;
}
.fco-profile-v2 .avatar-wrap {
  position: relative;
  width: 132px;
  height: 132px;
  margin: 6px auto 22px;
}
.fco-profile-v2 .avatar-wrap::before {
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  background: conic-gradient(from 140deg, rgba(232,130,93,0.4), rgba(232,130,93,0.05) 40%, rgba(245,235,214,0.15) 70%, rgba(232,130,93,0.4));
  filter: blur(8px);
  opacity: 0.7;
  animation: fco-spin 18s linear infinite;
}
@keyframes fco-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .fco-profile-v2 .avatar-wrap::before { animation: none; }
}
.fco-profile-v2 .avatar {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--hair);
  background: var(--elev);
}
.fco-profile-v2 .avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fco-profile-v2 .avatar .avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 56px;
  color: var(--hair);
  background: linear-gradient(135deg, var(--overlay), var(--bg));
}
.fco-profile-v2 .verified-ring {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 38px;
  height: 38px;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.55));
}
.fco-profile-v2 .verified-ring svg { width: 100%; height: 100%; display: block; }

.fco-profile-v2 h1.name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 38px;
  line-height: 1.05;
  letter-spacing: -0.035em;
  margin: 0 0 12px;
  color: var(--text);
}
.fco-profile-v2 .handle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 6px;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--muted);
  font-weight: 500;
  flex-wrap: wrap;
}
.fco-profile-v2 .handle-row .ig-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.fco-profile-v2 .handle-row .ig-check svg { width: 100%; height: 100%; display: block; }
.fco-profile-v2 .handle-row .dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dim);
}
.fco-profile-v2 .handle-row .followers strong {
  color: var(--text);
  font-weight: 600;
}
.fco-profile-v2 .bio {
  margin: 14px auto 0;
  max-width: 320px;
  color: var(--muted);
  font-size: 14.5px;
  line-height: 1.55;
  text-wrap: pretty;
}

/* ====== TRUST STRIP ====== */
.fco-profile-v2 .trust {
  position: relative;
  z-index: 1;
  padding: 18px 18px 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.fco-profile-v2 .trust::-webkit-scrollbar { display: none; }
.fco-profile-v2 .trust-inner {
  display: flex;
  gap: 7px;
  justify-content: center;
  min-width: max-content;
  padding: 0 10px;
}
.fco-profile-v2 .trust-pill {
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--elev);
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 7px 11px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fco-profile-v2 .trust-pill .tick {
  color: var(--gold);
  font-size: 9px;
  font-weight: 700;
}

/* ====== SECTION TITLE ====== */
.fco-profile-v2 .section {
  position: relative;
  z-index: 1;
  padding: 36px 22px 0;
}
.fco-profile-v2 .eyebrow {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.fco-profile-v2 .eyebrow::before {
  content: "";
  width: 18px;
  height: 1px;
  background: var(--hair);
}

/* ====== STYLE REEL ====== */
.fco-profile-v2 .reel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.fco-profile-v2 .tile {
  position: relative;
  aspect-ratio: 4 / 5;
  border-radius: 14px;
  overflow: hidden;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  transition: transform 320ms cubic-bezier(.2,.7,.2,1), border-color 320ms ease;
  display: block;
}
.fco-profile-v2 .tile:hover { transform: translateY(-2px); border-color: var(--hair); }
.fco-profile-v2 .tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 600ms cubic-bezier(.2,.7,.2,1), filter 320ms ease;
  filter: saturate(0.92) contrast(1.02);
}
.fco-profile-v2 .tile:hover img { transform: scale(1.04); filter: saturate(1) contrast(1.04); }
.fco-profile-v2 .tile-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  font-family: var(--font-label);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
  background: rgba(10, 9, 8, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 4px 7px;
  border-radius: 4px;
}

/* ====== CATEGORIES ====== */
.fco-profile-v2 .chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.fco-profile-v2 .chip {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  background: var(--elev);
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: default;
  transition: all 200ms ease;
}
.fco-profile-v2 .chip:hover { background: var(--overlay); border-color: var(--muted); }

/* ====== PRICING ====== */
.fco-profile-v2 .pricing {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.fco-profile-v2 .price-card {
  position: relative;
  background: var(--elev);
  border: 1px solid var(--hair);
  border-radius: 14px;
  padding: 20px 18px 18px;
  transition: all 250ms ease;
  text-decoration: none;
  color: inherit;
  display: block;
}
.fco-profile-v2 .price-card:hover {
  border-color: var(--muted);
  transform: translateY(-2px);
}
.fco-profile-v2 .price-card.popular {
  border-color: var(--accent);
  background: linear-gradient(180deg, rgba(232,130,93,0.07) 0%, var(--elev) 60%);
}
.fco-profile-v2 .price-card.popular:hover { border-color: var(--accent); transform: translateY(-3px); }
.fco-profile-v2 .popular-badge {
  position: absolute;
  top: -10px;
  right: 16px;
  font-family: var(--font-label);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--bg);
  background: var(--accent);
  padding: 4px 9px;
  border-radius: 4px;
}
.fco-profile-v2 .price-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.fco-profile-v2 .tier-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.015em;
  color: var(--text);
}
.fco-profile-v2 .tier-count {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.fco-profile-v2 .price-amt {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  letter-spacing: -0.03em;
  color: var(--text);
  line-height: 1;
  margin-top: 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.fco-profile-v2 .price-amt .per {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0;
  color: var(--dim);
}
.fco-profile-v2 .price-feats {
  margin: 14px 0 0;
  padding: 14px 0 0;
  border-top: 1px solid var(--hair-soft);
  display: flex;
  flex-direction: column;
  gap: 7px;
  list-style: none;
}
.fco-profile-v2 .price-feats li {
  font-size: 12.5px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.fco-profile-v2 .price-feats li .b {
  color: var(--text);
  font-weight: 500;
}
.fco-profile-v2 .price-feats .tk {
  color: var(--accent);
  font-size: 11px;
  line-height: 1;
}

/* ====== CTA ====== */
.fco-profile-v2 .cta-wrap {
  padding: 32px 22px 0;
  position: relative;
  z-index: 1;
}
.fco-profile-v2 .cta {
  width: 100%;
  background: var(--accent);
  color: #1a0f08;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16.5px;
  letter-spacing: -0.01em;
  border: none;
  border-radius: 14px;
  padding: 18px 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-decoration: none;
  transition: all 220ms cubic-bezier(.2,.7,.2,1);
  box-shadow:
    0 12px 32px -8px rgba(232, 130, 93, 0.45),
    0 1px 0 0 rgba(255, 220, 200, 0.25) inset;
}
.fco-profile-v2 .cta:hover {
  background: #ec8e6a;
  transform: translateY(-2px);
  box-shadow:
    0 16px 40px -8px rgba(232, 130, 93, 0.55),
    0 1px 0 0 rgba(255, 220, 200, 0.25) inset;
}
.fco-profile-v2 .cta:active { transform: translateY(0); }
.fco-profile-v2 .cta .ar { transition: transform 220ms ease; }
.fco-profile-v2 .cta:hover .ar { transform: translateX(3px); }
.fco-profile-v2 .cta-sub {
  margin-top: 12px;
  text-align: center;
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dim);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fco-profile-v2 .cta-sub .sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--hair);
}

/* ====== PLATFORM ICONS (Linktree-style row) ====== */
.fco-profile-v2 .platform-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.fco-profile-v2 .platform-chip {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--elev);
  border: 1px solid var(--hair);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  text-decoration: none;
  transition: transform 220ms ease, border-color 220ms ease, background 220ms ease, color 220ms ease;
}
.fco-profile-v2 .platform-chip:hover {
  border-color: var(--accent);
  background: var(--overlay);
  color: var(--accent);
  transform: translateY(-2px);
}

/* ====== CUSTOM LINKS ====== */
.fco-profile-v2 .links {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.fco-profile-v2 .link-btn {
  width: 100%;
  background: var(--elev);
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 16px 22px;
  color: var(--text);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 14.5px;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  transition: all 220ms ease;
}
.fco-profile-v2 .link-btn:hover {
  background: var(--overlay);
  border-color: var(--muted);
  transform: translateX(2px);
}
.fco-profile-v2 .link-btn .left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.fco-profile-v2 .link-btn .ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--overlay);
  border: 1px solid var(--hair);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  flex-shrink: 0;
}
.fco-profile-v2 .link-btn .label-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
}
.fco-profile-v2 .link-btn .label-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.fco-profile-v2 .link-btn .ar {
  color: var(--dim);
  transition: transform 220ms ease, color 220ms ease;
  flex-shrink: 0;
}
.fco-profile-v2 .link-btn:hover .ar { transform: translate(2px, -2px); color: var(--muted); }

/* ====== FOOTER ====== */
.fco-profile-v2 .footer {
  margin-top: 48px;
  padding: 28px 22px 40px;
  border-top: 1px solid var(--hair-soft);
  text-align: center;
  position: relative;
  z-index: 1;
}
.fco-profile-v2 .powered {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  text-decoration: none;
}
.fco-profile-v2 .powered:hover { color: var(--muted); }
.fco-profile-v2 .foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 18px;
}
.fco-profile-v2 .foot-pill {
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 6px 11px;
  text-decoration: none;
  transition: all 180ms ease;
}
.fco-profile-v2 .foot-pill:hover { border-color: var(--muted); color: var(--text); }
.fco-profile-v2 .legal {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--dim);
  line-height: 1.65;
  margin: 0;
}

/* ====== DESKTOP — sheet card on canvas ====== */
@media (min-width: 700px) {
  .fco-profile-v2 .stage { padding: 40px 24px; }
  .fco-profile-v2 .sheet {
    border-radius: 22px;
    border: 1px solid var(--hair);
    box-shadow:
      0 40px 100px -20px rgba(0,0,0,0.6),
      0 0 0 1px rgba(255, 220, 200, 0.02) inset;
    overflow: hidden;
    min-height: calc(100vh - 80px);
  }
}
`;

/* ───────── Page ───────── */

export default async function CreatorProfilePage(
  {
    params,
    searchParams,
  }: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ preview?: string }>;
  },
) {
  const { slug } = await params;
  const sp = await searchParams;
  const wantsPreview = sp.preview === "1";

  let cookieHeader: string | null = null;
  if (wantsPreview) {
    const { headers } = await import("next/headers");
    const h = await headers();
    cookieHeader = h.get("cookie");
  }

  const data = await fetchProfile(slug, { preview: wantsPreview, cookieHeader });
  if (!data) notFound();

  const c = data.creator;
  const firstName = c.display_name.split(" ")[0] || c.display_name;

  // Order samples by category selection so the Style Previews reads like a deck
  const samplesByCategory = new Map(data.samples.map((s) => [s.category, s]));
  const orderedSamples = data.categories
    .map((cat) => samplesByCategory.get(cat))
    .filter(Boolean) as PublicProfileResponse["samples"];
  // Fallback: if samples aren't keyed to selected categories, just take first 4
  const reelSamples = (orderedSamples.length > 0 ? orderedSamples : data.samples).slice(0, 4);

  const defaultPackage = data.packages[0];
  const ctaHref = defaultPackage
    ? `/signup?role=brand&intent=collab&creator=${data.slug}&package=${defaultPackage.id}`
    : `/signup?role=brand&intent=discover&creator=${data.slug}`;

  // Trust pills — show platform-level guarantees always, IG-verified only when true
  const trustPills: Array<{ key: string; label: string }> = [
    { key: "kyc", label: "KYC Verified" },
    ...(c.instagram_verified ? [{ key: "ig", label: "Instagram Verified" }] : []),
    { key: "dpdp", label: "DPDP Compliant" },
    { key: "escrow", label: "Escrow Protected" },
  ];

  // ── schema.org JSON-LD ──
  const profileUrl = `${APP_URL}/creators/${data.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${profileUrl}#person`,
        name: c.display_name,
        url: profileUrl,
        image: c.avatar_url ?? undefined,
        description: c.bio ?? `${c.display_name} — verified AI creator on Faiceoff.`,
        sameAs: c.instagram_handle
          ? [`https://instagram.com/${c.instagram_handle}`]
          : undefined,
        ...(c.instagram_followers
          ? {
              interactionStatistic: {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/FollowAction",
                userInteractionCount: c.instagram_followers,
              },
            }
          : {}),
      },
      ...(data.packages.length > 0
        ? [
            {
              "@type": "Service",
              "@id": `${profileUrl}#service`,
              serviceType: "Licensed AI likeness content",
              provider: { "@id": `${profileUrl}#person` },
              areaServed: "IN",
              offers: data.packages.map((p) => ({
                "@type": "Offer",
                name: p.tier,
                price: (p.price_paise / 100).toFixed(2),
                priceCurrency: "INR",
                url: profileUrl,
              })),
            },
          ]
        : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Creators", item: `${APP_URL}/creators` },
          { "@type": "ListItem", position: 2, name: c.display_name, item: profileUrl },
        ],
      },
    ],
  };

  return (
    <div className="fco-profile-v2">
      {/* Page-scoped CSS */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* schema.org structured data — only for published (indexable) profiles */}
      {!data.preview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* Preview banner — only when owner is previewing an unpublished profile */}
      {data.preview && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "rgba(245, 158, 11, 0.1)",
            borderBottom: "1px solid rgba(252, 211, 77, 0.3)",
            color: "#fcd34d",
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            textAlign: "center",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#fbbf24",
            }}
          />
          Preview mode · this profile isn&apos;t public yet.{" "}
          <Link
            href="/creator/profile/setup"
            style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Publish from setup
          </Link>
        </div>
      )}

      {/* Reusable Faiceoff Verified Seal — define once, <use> elsewhere */}
      <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden>
        <defs>
          <radialGradient id="faShine" cx="34" cy="28" r="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset="0.4" stopColor="#f0c34a" />
            <stop offset="0.85" stopColor="#a87a2a" />
            <stop offset="1" stopColor="#7a5418" />
          </radialGradient>
          <symbol id="faSeal" viewBox="0 0 100 100">
            <g fill="url(#faShine)">
              <circle cx="50" cy="50" r="36" />
              <circle cx="50" cy="14" r="9" />
              <circle cx="75.46" cy="24.54" r="9" />
              <circle cx="86" cy="50" r="9" />
              <circle cx="75.46" cy="75.46" r="9" />
              <circle cx="50" cy="86" r="9" />
              <circle cx="24.54" cy="75.46" r="9" />
              <circle cx="14" cy="50" r="9" />
              <circle cx="24.54" cy="24.54" r="9" />
            </g>
            <ellipse
              cx="36"
              cy="25"
              rx="11"
              ry="4.5"
              fill="#ffffff"
              opacity="0.45"
              transform="rotate(-32 36 25)"
            />
            <path
              d="M 34 51 L 45 62 L 67 39"
              fill="none"
              stroke="#ffffff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </symbol>
        </defs>
      </svg>

      <div className="stage">
        <main className="sheet">
          <div className="hero-glow" aria-hidden />

          {/* ── Top nav ───────────────────────────────────────────────── */}
          <nav className="top">
            <Link href="/" aria-label="Faiceoff home" className="brand-link">
              <Logo variant="full" tone="light" className="h-16 w-auto" />
            </Link>
            <Link href={ctaHref} className="nav-pill">
              For Brands <span className="arr">↗</span>
            </Link>
          </nav>

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <header className="hero">
            <div className="avatar-wrap">
              <div className="avatar">
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar_url}
                    alt={c.display_name}
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="avatar-fallback">
                    {c.display_name[0]?.toUpperCase() ?? "F"}
                  </div>
                )}
              </div>
              {/* Faiceoff Verified seal — platform-level (all listed creators are verified) */}
              <div className="verified-ring" title="Faiceoff Verified Creator">
                <svg viewBox="0 0 100 100" aria-hidden>
                  <use href="#faSeal" />
                </svg>
              </div>
            </div>

            <h1 className="name">{c.display_name}</h1>

            <div className="handle-row">
              {c.instagram_handle && <span>@{c.instagram_handle}</span>}
              {c.instagram_handle && c.instagram_verified && (
                <span
                  className="ig-check"
                  aria-label="Instagram verified"
                  title="Instagram verified"
                >
                  <svg viewBox="0 0 100 100" aria-hidden>
                    <use href="#faSeal" />
                  </svg>
                </span>
              )}
              {c.instagram_handle && c.instagram_followers !== null && c.instagram_followers > 0 && (
                <span className="dot-sep" aria-hidden />
              )}
              {c.instagram_followers !== null && c.instagram_followers > 0 && (
                <span className="followers">
                  <strong>{compactNumber(c.instagram_followers)}</strong> followers
                </span>
              )}
            </div>

            {c.bio && <p className="bio">{c.bio}</p>}
          </header>

          {/* ── Trust strip ───────────────────────────────────────────── */}
          <div className="trust">
            <div className="trust-inner">
              {trustPills.map((p) => (
                <span key={p.key} className="trust-pill">
                  <span className="tick">✓</span> {p.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Style Previews — 2×2 AI demo grid ─────────────────────────── */}
          {reelSamples.length > 0 && (
            <section className="section">
              <div className="eyebrow">Style Previews · AI Generated</div>
              <div className="reel">
                {reelSamples.map((s) => {
                  const def = DEMO_CATEGORIES[s.category];
                  const label = def ? def.label.split(" & ")[0] : s.category;
                  return (
                    <div key={s.id} className="tile">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.image_url}
                        alt={`${c.display_name} · ${label}`}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="tile-tag">{label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Categories ────────────────────────────────────────────── */}
          {data.categories.length > 0 && (
            <section className="section">
              <div className="eyebrow">Licensed Categories</div>
              <div className="chips">
                {data.categories.map((cat) => {
                  const def = DEMO_CATEGORIES[cat];
                  const label = def ? def.label.split(" & ")[0] : cat;
                  return (
                    <span key={cat} className="chip">
                      {label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Pricing tiers ─────────────────────────────────────────── */}
          {data.packages.length > 0 && (
            <section className="section">
              <div className="eyebrow">License Tiers</div>
              <div className="pricing">
                {data.packages.map((pkg, idx) => {
                  const meta = TIER_META[pkg.tier.toLowerCase()] ?? {
                    label: pkg.tier,
                    tagline: "48h turnaround · License PDF · Forever traceable",
                  };
                  // Mark the middle tier popular when there are 3, otherwise none
                  const isPopular = data.packages.length === 3 && idx === 1;
                  return (
                    <Link
                      key={pkg.id}
                      href={`/signup?role=brand&intent=collab&creator=${data.slug}&package=${pkg.id}`}
                      className={`price-card ${isPopular ? "popular" : ""}`}
                    >
                      {isPopular && <span className="popular-badge">Most Popular</span>}
                      <div className="price-head">
                        <span className="tier-name">{meta.label}</span>
                        <span className="tier-count">
                          {pkg.final_images} Image{pkg.final_images > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="price-amt">
                        {inr(pkg.price_paise)}
                        <span className="per">one-time</span>
                      </div>
                      <ul className="price-feats">
                        <li>
                          <span className="tk">✦</span>{" "}
                          <span className="b">{pkg.final_images}</span> AI brand image
                          {pkg.final_images > 1 ? "s" : ""}
                        </li>
                        <li>
                          <span className="tk">✦</span> {meta.tagline}
                        </li>
                        <li>
                          <span className="tk">✦</span> Creator-approved ·{" "}
                          <span className="b">Pay on approval</span>
                        </li>
                        {pkg.description && (
                          <li>
                            <span className="tk">✦</span> {pkg.description}
                          </li>
                        )}
                      </ul>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Primary CTA ───────────────────────────────────────────── */}
          <div className="cta-wrap">
            <Link href={ctaHref} className="cta">
              Launch a Campaign with {firstName}
              <span className="ar">→</span>
            </Link>
            <div className="cta-sub">
              <span>Pay only on approval</span>
              <span className="sep" aria-hidden />
              <span>48h turnaround</span>
              <span className="sep" aria-hidden />
              <span>Licensed forever</span>
            </div>
          </div>

          {/* ── Custom links — split into platform-icon row + labeled buttons
                Platform-tagged links (Instagram, YouTube, TikTok, X, etc.)
                render as a compact icon row a la Linktree. Everything else
                (a custom site, a WhatsApp number, a portfolio URL) keeps the
                labeled-button treatment the page already had. Tag is either
                stored alongside the link or detected client-side from the URL
                — older saves stay backward-compatible. ───────────────────── */}
          {(() => {
            const tagged = data.links
              .map((l) => ({ ...l, platform: l.platform ?? detectPlatform(l.url) }))
              .filter((l) => l.platform);
            const labeled = data.links
              .map((l) => ({ ...l, platform: l.platform ?? detectPlatform(l.url) }))
              .filter((l) => !l.platform);

            if (data.links.length === 0) return null;

            return (
              <section className="section">
                <div className="eyebrow">More from {firstName}</div>

                {/* Platform icons row */}
                {tagged.length > 0 && (
                  <div className="platform-row">
                    {tagged.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        title={`${link.label} — ${platformLabel(link.platform as SocialPlatform)}`}
                        aria-label={`${link.label} on ${platformLabel(link.platform as SocialPlatform)}`}
                        className="platform-chip"
                      >
                        <PlatformIcon platform={link.platform as SocialPlatform} width={20} height={20} />
                      </a>
                    ))}
                  </div>
                )}

                {/* Labeled buttons — unchanged for non-platform links */}
                {labeled.length > 0 && (
                  <div className="links">
                    {labeled.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="link-btn"
                      >
                        <span className="left">
                          <span className="ico">
                            <LinkGlyph url={link.url} />
                          </span>
                          <span className="label-stack">
                            <span className="label-text">{link.label}</span>
                          </span>
                        </span>
                        <span className="ar" aria-hidden>↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Footer ────────────────────────────────────────────────── */}
          <footer className="footer">
            <Link href="/" className="powered" aria-label="Faiceoff home">
              <Logo variant="mark" className="h-7 w-7" />
              <span>
                Powered by <span style={{ color: "var(--text)", fontWeight: 700 }}>Faiceoff</span>
              </span>
            </Link>
            <div className="foot-links">
              <Link href="/creators" className="foot-pill">Creators</Link>
              <Link href="/for-brands" className="foot-pill">For Brands</Link>
              <Link href="/for-creators" className="foot-pill">For Creators</Link>
              <Link href="/learn" className="foot-pill">How it works</Link>
              <Link href="/privacy" className="foot-pill">DPDP Policy</Link>
            </div>
            <p className="legal">
              © {new Date().getFullYear()} {COMPANY.legalName}<br />
              Made in India · DPDP Act 2023 compliant
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
