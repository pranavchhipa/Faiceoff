import type { Metadata } from "next";
import {
  Outfit,
  Plus_Jakarta_Sans as PlusJakartaSans,
  Inter,
} from "next/font/google";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

/* ── Vercel function region ──────────────────────────────────────────────
   ROOT cause of the "everything is slow" reports: with no region config,
   Vercel deploys serverless functions to iad1 (US East — Virginia). Every
   page render for an Indian user was Mumbai → Virginia → Mumbai Supabase
   → Virginia → Mumbai. ~500ms of latency BEFORE the function even ran.

   Pinning to bom1 (Mumbai) keeps the entire request loop inside India:
   Mumbai user → Mumbai function → Mumbai Supabase → Mumbai user. Cuts
   the dead time per request by ~300-500ms — visible on every navigation.

   Cascades to every nested route segment (App Router inherits region
   from the closest layout / page that exports it). Set here at the root
   so every dashboard + API route picks it up without per-file config.
   ────────────────────────────────────────────────────────────────────── */
export const preferredRegion = "bom1";

/* ── Font configuration ── */

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

// Inter — the app (dashboard) UI face. Chosen over Outfit for the product
// surface because dashboards live at 12-15px where Outfit's geometric
// roundness gets mushy, and because Inter ships true tabular figures, which
// matter on a page full of INR amounts. Outfit + Plus Jakarta stay on the
// marketing/auth surfaces via `.landing-scope`, so the brand voice is intact
// where it does the selling.
// No `weight` array on purpose: that would download static cuts and the app
// uses font-500/600/700/800 across ~1,100 call sites. Omitting it loads the
// variable axis (one file, every weight renders true rather than faux-bold).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakartaSans = PlusJakartaSans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

// ── Single font system: Outfit (display) + Plus Jakarta Sans (body) ──────
// Both the dashboard and the marketing/landing surfaces now share the same
// type stack. Fraunces (serif w/ italic) was retired — it conflicted with
// the project-wide "no italic, bold geometric sans only" rule and made the
// landing visually disjoint from the dashboard. Outfit lands as a more
// trustworthy + modern voice while keeping the warm cream palette intact.

/* ── Metadata ── */

// In production NEXT_PUBLIC_APP_URL should be set to https://faiceoff.com.
// Fall back to the live domain (not localhost) so OG image URLs sent to
// WhatsApp / iMessage / Twitter / LinkedIn are absolute & resolvable even
// when the env var is missing. Icons and og:image tags are auto-generated
// by Next.js from the file conventions in src/app/.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://faiceoff.com"
    : "http://localhost:3000");

const SITE_TITLE = "Faiceoff — Real faces. Licensed for AI.";
const SITE_DESC =
  "Real faces. Licensed for AI. Brands create authentic, consented AI content with verified Indian creators. Pay only on approval.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  metadataBase: new URL(SITE_URL),
  applicationName: "Faiceoff",
  keywords: [
    "verified faces for AI",
    "license your face for AI",
    "AI influencer India",
    "AI model for brands",
    "consented AI content",
    "AI UGC marketplace",
    "real faces AI licensing",
    "DPDP compliant AI",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    type: "website",
    url: SITE_URL,
    siteName: "Faiceoff",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

/* ── Root layout ── */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${plusJakartaSans.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      {/* No image preloads here: the root layout wraps EVERY route (dashboard,
          auth, API-rendered pages), so preloading landing imagery from it taxed
          all of them. Above-the-fold landing images use next/image `priority`
          in the (marketing) pages instead. */}
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
