import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Plus_Jakarta_Sans as PlusJakartaSans, JetBrains_Mono as JetBrainsMono } from "next/font/google";
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

/* ── Metadata ── */

export const metadata: Metadata = {
  title: "Faiceoff — A House for Licensed Likeness",
  description:
    "The marketplace where creators license their likeness and brands generate authentic, consented AI content. Fair face, fair deal.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    title: "Faiceoff — A House for Licensed Likeness",
    description:
      "The marketplace where creators license their likeness and brands generate authentic, consented AI content.",
    type: "website",
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
      className={`${outfit.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-ink)] antialiased">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
