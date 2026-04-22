import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans as PlusJakartaSans, JetBrains_Mono as JetBrainsMono, Space_Grotesk, Manrope } from "next/font/google";
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

const jetbrainsMono = JetBrainsMono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
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

const SITE_TITLE = "Faiceoff — A House for Licensed Likeness";
const SITE_DESC =
  "The marketplace where creators license their likeness and brands generate authentic, consented AI content. Fair face, fair deal.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  metadataBase: new URL(SITE_URL),
  applicationName: "Faiceoff",
  keywords: [
    "AI likeness licensing",
    "creator marketplace India",
    "influencer AI",
    "brand UGC",
    "consent-first AI",
    "DPDP compliant",
    "Cashfree payouts",
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
      className={`${outfit.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-ink)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
