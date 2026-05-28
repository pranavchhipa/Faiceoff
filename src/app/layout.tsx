import type { Metadata } from "next";
import {
  Outfit,
  Plus_Jakarta_Sans as PlusJakartaSans,
  Space_Grotesk,
  Manrope,
  Fraunces,
  Inter,
} from "next/font/google";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

/* ── Font configuration ── */

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const plusJakartaSans = PlusJakartaSans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

// ── Marketing-only fonts (Fraunces display + Inter body) ─────────────────
// These power the warm editorial landing pages. The .landing-scope class
// in globals.css picks them up via --font-display / --font-body which
// resolve to these family names; we also expose them via CSS variables in
// case any component wants to reference them directly.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

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

const SITE_TITLE = "Faiceoff — Real verified faces. Licensed for AI.";
const SITE_DESC =
  "Real, verified human faces — licensed for AI. Brands create authentic, consented AI content with verified Indian creators. Pay only on approval.";

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
      className={`${outfit.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${manrope.variable} ${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Preload critical above-fold landing images */}
        <link rel="preload" as="image" href="/landing/creator-face.jpg" />
        <link rel="preload" as="image" href="/landing/creator-2.jpg" />
        <link rel="preload" as="image" href="/landing/logo-dark.png" />
      </head>
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
