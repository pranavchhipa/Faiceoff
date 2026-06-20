/**
 * /creators — public creator directory.
 *
 * SEO landing for "browse AI creators India" + a real, useful index of every
 * published creator. Programmatic SEO backbone: scales with supply, links out
 * to category pages + individual profiles.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { listPublishedCreators } from "@/lib/profile/public-creators";
import { DEMO_CATEGORIES, ALL_CATEGORY_KEYS } from "@/lib/profile/demo-prompts";
import { CreatorCard } from "@/components/creators/creator-card";
import { MarketingDarkFooter } from "@/components/marketing/dark-footer";
import { Logo } from "@/components/brand/logo";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

// Revalidate hourly — directory changes as creators publish
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Browse AI Creators — Real Verified Faces for Brands | Faiceoff",
  description:
    "Discover verified Indian creators licensing their face for AI content. Browse by category, see real Style Previews, and launch a campaign — pay only on approval.",
  alternates: { canonical: `${APP_URL}/creators` },
  openGraph: {
    title: "Browse AI Creators — Real Verified Faces | Faiceoff",
    description:
      "Verified creators licensing their face for AI brand content. Browse by category and launch a campaign.",
    url: `${APP_URL}/creators`,
    type: "website",
  },
};

export default async function CreatorsDirectoryPage() {
  const creators = await listPublishedCreators();

  return (
    <div
      className="min-h-screen text-[#f5ebd6]"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* Nav */}
      <header className="mx-auto flex max-w-[1400px] items-center justify-between px-4 pt-6 sm:px-6 lg:px-10">
        <Link href="/" aria-label="Faiceoff home">
          <Logo variant="full" tone="light" className="h-20 w-auto sm:h-24" />
        </Link>
        <Link
          href="/signup?role=brand"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-5 text-[13px] font-700 text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white"
          style={{ fontFamily: "Outfit, system-ui" }}
        >
          For Brands <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1400px] px-4 pt-12 pb-8 sm:px-6 lg:px-10 lg:pt-16">
        <div className="font-mono text-[11px] font-700 uppercase tracking-[0.24em] text-[#a89570]">
          The Directory
        </div>
        <h1
          className="mt-3 max-w-3xl font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(34px, 6vw, 72px)" }}
        >
          Real verified faces.<br />
          <span className="text-[#e8825d]">Licensed for AI.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[#a89570]">
          Every creator here has verified their identity and licensed their likeness for
          consented AI content. Browse by category, preview their Style Previews, and brief them
          in minutes — you pay only when they approve the final image.
        </p>
      </section>

      {/* Category nav */}
      <section className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-[#e8825d] px-3.5 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider text-white">
            All
          </span>
          {ALL_CATEGORY_KEYS.map((key) => {
            const def = DEMO_CATEGORIES[key];
            return (
              <Link
                key={key}
                href={`/creators/category/${key}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2520] px-3.5 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider text-[#a89570] transition hover:border-[#e8825d]/50 hover:text-[#f5ebd6]"
              >
                {def.emoji} {def.label.split(" & ")[0]}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6 lg:px-10">
        {creators.length === 0 ? (
          <div className="rounded-sm border border-dashed border-[#2a2520] py-20 text-center">
            <p className="text-[14px] text-[#8d8275]">
              Creators are onboarding now — check back soon.
            </p>
            <Link
              href="/signup?role=creator"
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] font-700 uppercase tracking-wider text-[#e8825d] hover:underline"
            >
              Are you a creator? Join the waitlist <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {creators.map((c) => (
              <CreatorCard key={c.slug} c={c} />
            ))}
          </div>
        )}
      </section>

      {/* SEO copy footer */}
      <section className="border-t border-[#2a2520] px-4 py-16 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h2
            className="font-800 tracking-tight text-[#f5ebd6]"
            style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(22px, 3vw, 32px)" }}
          >
            What is Faiceoff?
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-[#a89570]">
            Faiceoff is India&apos;s marketplace for <strong className="text-[#d9c9aa]">licensed AI
            likeness</strong>. Creators verify their identity (Instagram + KYC) and license their
            face so brands can generate authentic, on-brand AI content — without a photoshoot,
            studio, or location scout. Every image is consented, creator-approved, and licensed
            with a traceable certificate. Brands pay only on approval; creators earn in INR with
            a 7-day escrow-backed payout.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/for-brands"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#3a3530] px-5 text-[13px] font-700 text-[#f5ebd6] transition hover:border-[#f5ebd6]"
              style={{ fontFamily: "Outfit, system-ui" }}
            >
              How it works for brands
            </Link>
            <Link
              href="/for-creators"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#3a3530] px-5 text-[13px] font-700 text-[#f5ebd6] transition hover:border-[#f5ebd6]"
              style={{ fontFamily: "Outfit, system-ui" }}
            >
              Earn as a creator
            </Link>
          </div>
        </div>
      </section>

      <MarketingDarkFooter />
    </div>
  );
}
