/**
 * /creators/category/[category] — category landing page.
 *
 * One per demo category (fashion, beauty, tech, …). Targets searches like
 * "AI fashion models India" / "AI creators for beauty brands". Real creator
 * grid + category-specific SEO copy + FAQ (FAQPage schema for rich results).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import {
  DEMO_CATEGORIES,
  ALL_CATEGORY_KEYS,
  isValidCategory,
  type DemoCategoryKey,
} from "@/lib/profile/demo-prompts";
import { listPublishedCreators } from "@/lib/profile/public-creators";
import { CreatorCard } from "@/components/creators/creator-card";
import { MarketingDarkFooter } from "@/components/marketing/dark-footer";
import { Logo } from "@/components/brand/logo";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 3600;

// Per-category SEO copy (intro + 3 FAQs). Keeps each landing page genuinely
// useful + unique (Google penalises thin/duplicate templated pages).
const CATEGORY_SEO: Record<
  DemoCategoryKey,
  { intro: string; faqs: { q: string; a: string }[] }
> = {
  fashion: {
    intro:
      "Find verified creators for fashion & apparel AI campaigns — lookbooks, streetwear, editorial, and seasonal drops. Generate on-model imagery in any outfit, any setting, without booking a shoot.",
    faqs: [
      { q: "Can I show my own clothing on these AI creators?", a: "Yes. After you brief a creator and they accept, you upload your product and we generate licensed images of the creator wearing it." },
      { q: "Are the faces real people?", a: "Yes — every creator is identity-verified (Instagram + KYC) and has explicitly licensed their likeness for AI use." },
      { q: "How fast can I get fashion campaign images?", a: "Most campaigns ship within 48 hours of the creator accepting your brief." },
    ],
  },
  beauty: {
    intro:
      "Browse creators for beauty & skincare AI content — close-up beauty editorials, makeup looks, and fragrance campaigns with consistent, consented faces.",
    faqs: [
      { q: "Can creators show my skincare or makeup product?", a: "Yes. You upload the product after the creator accepts; we generate licensed beauty imagery featuring it." },
      { q: "Is the likeness licensed?", a: "Every image comes with a traceable license certificate and the creator's explicit approval." },
      { q: "Do I pay upfront?", a: "No — you pay only after the creator approves the final image." },
    ],
  },
  tech: {
    intro:
      "Discover creators for tech & gadget campaigns — minimalist studio shots, lifestyle product moments, and smart-home scenes featuring verified faces.",
    faqs: [
      { q: "Can I feature my device?", a: "Yes. Upload your product and we generate licensed images of the creator using it, brand-safe and logo-free unless you provide assets." },
      { q: "Are these stock AI faces?", a: "No. These are real, verified creators who have licensed their likeness." },
      { q: "What do I get?", a: "Campaign-ready, licensed images plus a verifiable license certificate." },
    ],
  },
  food: {
    intro:
      "Find creators for food & beverage AI content — café moments, product flat-lays, and lifestyle dining scenes with authentic, consented faces.",
    faqs: [
      { q: "Can creators hold my product?", a: "Yes — upload your packaged food or drink and we generate licensed imagery featuring it." },
      { q: "Are faces verified?", a: "Yes, every creator is identity-verified and has licensed their likeness." },
      { q: "How does pricing work?", a: "Transparent per-package pricing; you pay only on the creator's approval." },
    ],
  },
  travel: {
    intro:
      "Browse creators for travel & lifestyle AI campaigns — golden-hour destinations, resort moments, and adventure scenes, all without location scouting or flights.",
    faqs: [
      { q: "Can I place a creator in a specific destination vibe?", a: "Yes — briefs let you specify the setting and mood; we generate licensed lifestyle imagery to match." },
      { q: "Real people?", a: "Yes — verified creators who licensed their likeness for AI." },
      { q: "Turnaround?", a: "Usually within 48 hours of brief acceptance." },
    ],
  },
  fitness: {
    intro:
      "Find creators for fitness & wellness AI content — athleisure, gym performance, yoga, and supplement campaigns with verified, consented faces.",
    faqs: [
      { q: "Can creators show my activewear or supplement?", a: "Yes — upload your product after the creator accepts the brief." },
      { q: "Is consent handled?", a: "Every image is creator-approved and licensed with a certificate." },
      { q: "Payment?", a: "Pay only on approval, in INR." },
    ],
  },
  home: {
    intro:
      "Discover creators for home & living AI content — Scandi interiors, cozy lifestyle scenes, and product styling featuring authentic, verified faces.",
    faqs: [
      { q: "Can I feature my furniture or decor?", a: "Yes — upload your product and we generate licensed lifestyle imagery." },
      { q: "Are the faces licensed?", a: "Yes — verified creators with explicit likeness licenses." },
      { q: "How fast?", a: "Most campaigns ship in about 48 hours." },
    ],
  },
  automotive: {
    intro:
      "Browse creators for automotive AI campaigns — cinematic vehicle portraits, lifestyle drives, and accessory features with verified, consented faces.",
    faqs: [
      { q: "Can I show my vehicle or accessory?", a: "Yes — provide your assets after the creator accepts the brief." },
      { q: "Real verified faces?", a: "Yes — identity-verified creators who licensed their likeness." },
      { q: "Pricing?", a: "Transparent packages; pay on approval." },
    ],
  },
  jewelry: {
    intro:
      "Find creators for jewelry & watch AI content — luxury editorial portraits, dramatic side-lit hands, and prestige product features with verified faces.",
    faqs: [
      { q: "Can creators wear my jewelry?", a: "Yes — upload your pieces and we generate licensed imagery featuring them." },
      { q: "Is the likeness consented?", a: "Every image is creator-approved and licensed." },
      { q: "Payment terms?", a: "Pay only when the creator approves the final image." },
    ],
  },
  kids_family: {
    intro:
      "Discover creators for kids & family AI content — warm nursery scenes, parenting moments, and gentle lifestyle imagery with verified, consented faces.",
    faqs: [
      { q: "Can I feature my product?", a: "Yes — upload it after the creator accepts; we generate licensed family-lifestyle imagery." },
      { q: "Are faces verified?", a: "Yes — every creator is identity-verified and licensed." },
      { q: "How does it work?", a: "Brief, creator accepts, generate, creator approves, you pay. Licensed forever." },
    ],
  },
};

// Pre-render all category pages at build
export function generateStaticParams() {
  return ALL_CATEGORY_KEYS.map((category) => ({ category }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> },
): Promise<Metadata> {
  const { category } = await params;
  if (!isValidCategory(category)) return { title: "Category not found · Faiceoff" };
  const def = DEMO_CATEGORIES[category];
  const niche = def.label;
  const title = `${niche} AI Creators in India — Verified Faces | Faiceoff`;
  const description = `Hire verified ${niche.toLowerCase()} creators for AI brand content. Real, consented faces licensed for AI — browse Style Previews and launch a campaign. Pay on approval.`;
  return {
    title,
    description,
    alternates: { canonical: `${APP_URL}/creators/category/${category}` },
    openGraph: { title, description, url: `${APP_URL}/creators/category/${category}`, type: "website" },
  };
}

export default async function CategoryPage(
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  if (!isValidCategory(category)) notFound();

  const def = DEMO_CATEGORIES[category];
  const seo = CATEGORY_SEO[category];
  const creators = await listPublishedCreators(category);

  // FAQPage JSON-LD for rich results
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: seo.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div
      className="min-h-screen text-[#f5ebd6]"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

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

      {/* Breadcrumb */}
      <nav className="mx-auto max-w-[1400px] px-4 pt-8 sm:px-6 lg:px-10">
        <ol className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6e6457]">
          <li><Link href="/creators" className="hover:text-[#f5ebd6]">Creators</Link></li>
          <li aria-hidden>/</li>
          <li className="text-[#a89570]">{def.label}</li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-[1400px] px-4 pt-5 pb-8 sm:px-6 lg:px-10">
        <div className="font-mono text-[11px] font-700 uppercase tracking-[0.24em] text-[#a89570]">
          {def.emoji} {def.label}
        </div>
        <h1
          className="mt-3 max-w-3xl font-800 leading-[0.95] tracking-[-0.02em]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(32px, 5.5vw, 64px)" }}
        >
          {def.label.split(" & ")[0]} AI creators.<br />
          <span className="text-[#e8825d]">Real verified faces.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[#a89570]">{seo.intro}</p>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6 lg:px-10">
        {creators.length === 0 ? (
          <div className="rounded-sm border border-dashed border-[#2a2520] py-16 text-center">
            <p className="text-[14px] text-[#8d8275]">
              No {def.label.toLowerCase()} creators live yet — more onboarding now.
            </p>
            <Link href="/creators" className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] font-700 uppercase tracking-wider text-[#e8825d] hover:underline">
              Browse all creators <ArrowUpRight className="h-3.5 w-3.5" />
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

      {/* FAQ */}
      <section className="border-t border-[#2a2520] px-4 py-16 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h2
            className="font-800 tracking-tight"
            style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(22px, 3vw, 32px)" }}
          >
            {def.label} AI content — FAQ
          </h2>
          <div className="mt-6 divide-y divide-[#2a2520]">
            {seo.faqs.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="font-display text-[16px] font-700 text-[#f5ebd6]">{f.q}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#a89570]">{f.a}</p>
              </div>
            ))}
          </div>

          {/* Other categories */}
          <div className="mt-10">
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[#6e6457]">
              Other categories
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_CATEGORY_KEYS.filter((k) => k !== category).map((key) => {
                const d = DEMO_CATEGORIES[key];
                return (
                  <Link
                    key={key}
                    href={`/creators/category/${key}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2520] px-3 py-1.5 font-mono text-[10.5px] font-700 uppercase tracking-wider text-[#a89570] transition hover:border-[#e8825d]/50 hover:text-[#f5ebd6]"
                  >
                    {d.emoji} {d.label.split(" & ")[0]}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <MarketingDarkFooter />
    </div>
  );
}
