import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Supabase Storage (reference photos, avatars)
      { protocol: "https", hostname: "*.supabase.co" },
      // Cloudflare R2 — custom domain (current uploads). Keep the r2.dev
      // pattern below too: existing generations have the full pub-*.r2.dev
      // URL baked into generations.image_url, so those rows only render
      // while that hostname stays allowed AND public on the bucket.
      { protocol: "https", hostname: "cdn.faiceoff.com" },
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Import-rewrite these so each icon/motion import pulls only its own
    // module instead of the package barrel (smaller route chunks, faster
    // dev + build resolution). lucide-react is in Next's default list;
    // framer-motion is not — 62 client files import it.
    optimizePackageImports: ["framer-motion", "lucide-react"],
    /* ── App Router client-side cache TTLs ──────────────────────────────
       Next.js 14+ tunes how long the client-side Router Cache holds
       prefetched + already-rendered route segments. The defaults are
       very short (~5s for dynamic) which means clicking back to a tab
       you visited 6 seconds ago re-fetches its data + re-renders from
       scratch — felt-slow.

       Raising to 30s dynamic / 3min static gives the user instant
       back/forward + tab-switch within the freshness window. The cache
       invalidates automatically on router.refresh() and on server
       action mutations — no risk of stale data after a write. */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Build-time type-checking is ON. It was previously disabled
  // (ignoreBuildErrors) because stale generated Supabase types tripped strict
  // tsc at dozens of admin-client boundaries. Those sites are now explicitly
  // annotated at the `any`-cast boundary, so `tsc --noEmit` is clean and the
  // escape hatch is gone — a broken refactor or a wrong column name now fails
  // the build instead of 500ing in production.
  // Next.js 16 dropped the `eslint` key from next.config — it warned
  // "no longer supported" / "Unrecognized key(s)" every build. ESLint no
  // longer runs as part of `next build` at all in 16, so there's nothing to
  // opt out of; removing the key just silences the warning with no behavior
  // change (lint still runs via `npm run lint` / CI separately).

  // Baseline security headers — no CSP script-src/connect-src here on purpose:
  // this app loads Razorpay's checkout.razorpay.com script (live payments),
  // Sentry, PostHog, and Supabase realtime websockets, and a hand-authored
  // CSP risks silently blocking one of those without a live test pass. The
  // headers below are the well-understood, zero-behavior-risk subset — they
  // only restrict framing/sniffing/referrer leakage, never app functionality.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Blocks the whole site from being iframed elsewhere (clickjacking)
          // — nothing in Faiceoff needs to render inside a third-party frame.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
