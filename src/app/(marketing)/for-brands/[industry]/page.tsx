/**
 * /for-brands/[industry] — industry landing pages.
 * Targets "AI content for [industry] brands" buyer searches. Each maps to a
 * creator category so brands can jump straight to relevant verified creators.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { listPublishedCreators } from "@/lib/profile/public-creators";
import { CreatorCard } from "@/components/creators/creator-card";
import type { DemoCategoryKey } from "@/lib/profile/demo-prompts";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 3600;

interface IndustryDef {
  label: string;
  headline: string;
  intro: string;
  category: DemoCategoryKey | null; // creator category to surface
  bullets: string[];
}

const INDUSTRIES: Record<string, IndustryDef> = {
  fashion: {
    label: "Fashion Brands",
    headline: "AI content for fashion brands.",
    intro: "On-model imagery for every drop, season, and channel — without booking a studio. License a verified creator's face and put your apparel on them in hours.",
    category: "fashion",
    bullets: ["Lookbooks + ecommerce on-model shots", "Any outfit, any season, on demand", "Licensed + creator-approved every time"],
  },
  beauty: {
    label: "Beauty Brands",
    headline: "AI content for beauty & skincare brands.",
    intro: "Dewy close-ups, makeup looks, and fragrance moments featuring real, verified faces — generated with your product, ready in 48 hours.",
    category: "beauty",
    bullets: ["Beauty editorials + product hero shots", "Consistent faces across a campaign", "No studio, no model day-rate"],
  },
  tech: {
    label: "Tech Brands",
    headline: "AI content for tech & gadget brands.",
    intro: "Clean lifestyle shots of verified creators using your device — studio-quality, brand-safe, and licensed.",
    category: "tech",
    bullets: ["Lifestyle + studio product moments", "Brand-safe, logo-free unless you supply assets", "Ship campaign images in days"],
  },
  food: {
    label: "Food & Beverage Brands",
    headline: "AI content for food & beverage brands.",
    intro: "Café moments, product flat-lays, and lifestyle dining scenes with authentic faces — your packaged product, their licensed likeness.",
    category: "food",
    bullets: ["Lifestyle + packaging-led shots", "Real faces, real appetite appeal", "Pay only on creator approval"],
  },
  travel: {
    label: "Travel & Hospitality Brands",
    headline: "AI content for travel & hospitality brands.",
    intro: "Golden-hour destinations, resort moments, and adventure scenes — without flights or location scouting.",
    category: "travel",
    bullets: ["Destination + lifestyle imagery", "No location permits or travel costs", "Licensed for your campaigns"],
  },
  fitness: {
    label: "Fitness & Wellness Brands",
    headline: "AI content for fitness & wellness brands.",
    intro: "Athleisure, gym performance, and wellness moments featuring verified creators — your activewear or supplement, their licensed face.",
    category: "fitness",
    bullets: ["Performance + lifestyle shots", "Consistent creators for a series", "48-hour turnaround"],
  },
  jewellery: {
    label: "Jewellery & Watch Brands",
    headline: "AI content for jewellery & watch brands.",
    intro: "Luxury editorial portraits and dramatic product features with verified faces — prestige imagery without the prestige price tag.",
    category: "jewelry",
    bullets: ["Editorial + product-on-model shots", "Premium look, fraction of the cost", "Licensed + traceable"],
  },
  home: {
    label: "Home & Living Brands",
    headline: "AI content for home & living brands.",
    intro: "Scandi interiors, cozy lifestyle scenes, and product styling with authentic faces — your furniture and decor, beautifully placed.",
    category: "home",
    bullets: ["Lifestyle interiors + product styling", "Any room, any season", "Pay on approval"],
  },
  automotive: {
    label: "Automotive Brands",
    headline: "AI content for automotive brands.",
    intro: "Cinematic vehicle portraits and lifestyle drives with verified creators — campaign imagery without a closed road or a film crew.",
    category: "automotive",
    bullets: ["Cinematic + lifestyle automotive shots", "No location or crew logistics", "Licensed creator likeness"],
  },
  d2c: {
    label: "D2C Brands",
    headline: "AI content for D2C brands.",
    intro: "The steady stream of on-model content every D2C brand burns through — product pages, ads, social — with real verified faces, in days not weeks.",
    category: null,
    bullets: ["On-model content at scale", "A fraction of shoot cost", "Licensed + creator-approved"],
  },
};

export function generateStaticParams() {
  return Object.keys(INDUSTRIES).map((industry) => ({ industry }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ industry: string }> },
): Promise<Metadata> {
  const { industry } = await params;
  const def = INDUSTRIES[industry];
  if (!def) return { title: "Not found · Faiceoff" };
  const title = `${def.headline} | Faiceoff`;
  const description = def.intro.slice(0, 158);
  return {
    title,
    description,
    alternates: { canonical: `${APP_URL}/for-brands/${industry}` },
    openGraph: { title, description, url: `${APP_URL}/for-brands/${industry}`, type: "website" },
  };
}

export default async function IndustryPage(
  { params }: { params: Promise<{ industry: string }> },
) {
  const { industry } = await params;
  const def = INDUSTRIES[industry];
  if (!def) notFound();

  const creators = def.category
    ? await listPublishedCreators(def.category, 8)
    : await listPublishedCreators(undefined, 8);

  return (
    <div
      className="min-h-screen text-[#f5ebd6]"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="Faiceoff home">
          <Logo variant="full" tone="light" className="h-20 w-auto sm:h-24" />
        </Link>
        <Link
          href="/signup?role=brand"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-5 text-[13px] font-700 text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white"
          style={{ fontFamily: "Outfit, system-ui" }}
        >
          Launch a Campaign <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1100px] px-4 pt-12 pb-10 sm:px-6 lg:pt-16">
        <nav className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6e6457]">
          <Link href="/for-brands" className="hover:text-[#f5ebd6]">For Brands</Link>
          <span aria-hidden>/</span>
          <span className="text-[#a89570]">{def.label}</span>
        </nav>
        <h1
          className="max-w-3xl font-800 leading-[0.98] tracking-[-0.02em]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(32px, 5.5vw, 64px)" }}
        >
          {def.headline.split(" ").slice(0, -2).join(" ")}{" "}
          <span className="text-[#e8825d]">{def.headline.split(" ").slice(-2).join(" ")}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[#a89570]">{def.intro}</p>
        <ul className="mt-7 space-y-2.5">
          {def.bullets.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-[14px] text-[#d9c9aa]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> {b}
            </li>
          ))}
        </ul>
        <Link
          href="/signup?role=brand"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#e8825d] px-6 text-[15px] font-800 text-white transition hover:bg-[#e96d3f]"
          style={{ fontFamily: "Outfit, system-ui" }}
        >
          Start a campaign <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Relevant creators */}
      {creators.length > 0 && (
        <section className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2
              className="font-800 tracking-tight"
              style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(22px, 3vw, 34px)" }}
            >
              Verified creators for {def.label.toLowerCase()}
            </h2>
            <Link href={def.category ? `/creators/category/${def.category}` : "/creators"} className="font-mono text-[11px] font-700 uppercase tracking-wider text-[#e8825d] hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {creators.slice(0, 4).map((c) => (
              <CreatorCard key={c.slug} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-[#2a2520] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-[1100px]">
          <h2
            className="font-800 tracking-tight"
            style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(22px, 3vw, 34px)" }}
          >
            How it works
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            {[
              { n: "01", t: "Pick a creator", d: "Browse verified creators and choose a face that fits your brand." },
              { n: "02", t: "Brief + upload", d: "Write a short brief and upload your product. Pay only after they accept." },
              { n: "03", t: "AI generates", d: "We generate on-brand images with their licensed likeness + your product." },
              { n: "04", t: "Approve + license", d: "Creator approves, you get licensed, campaign-ready images." },
            ].map((s) => (
              <div key={s.n} className="rounded-sm border border-[#2a2520] bg-[#0d0c0a] p-5">
                <div className="font-mono text-[12px] font-700 text-[#e8825d]">{s.n}</div>
                <div className="mt-2 font-display text-[15px] font-700 text-[#f5ebd6]">{s.t}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#a89570]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2a2520] px-4 py-7 sm:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <Link href="/" className="inline-flex items-center gap-2 opacity-80 hover:opacity-100">
            <Logo variant="mark" className="h-16 w-16" />
            <span className="font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#a89570]">Powered by Faiceoff</span>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#6e6457]">
            <Link href="/creators" className="hover:text-[#f5ebd6]">Creators</Link>
            <Link href="/learn" className="hover:text-[#f5ebd6]">Learn</Link>
            <Link href="/pricing" className="hover:text-[#f5ebd6]">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
