// Faiceoff marketing home — light editorial revamp
// -----------------------------------------------------------------------------
// Pure server component. The only client-side island is the BrandDemo carousel
// imported from ./home-demo.tsx (state for the 3.5s slide cycle).
//
// Sections (top → bottom):
//   1.  Hero          — eyebrow + display headline (mixed roman/italic) + dual
//                        CTA + trust strip + layered creator collage on right.
//   2.  Trust quote   — single editorial pull quote with portrait.
//   3.  How it works  — 3 numbered cards, horizontal on desktop.
//   4.  Marketplace   — verified creator grid (6 portraits).
//   5.  Brand demo    — split layout, AI carousel (client island), use cases.
//   6.  Creator ctrl  — 6-bullet checklist + portrait.
//   7.  Library       — final-creative grid + channel chips.
//   8.  Compliance    — 4 pillars (DPDP / approval / GST / safety).
//   9.  Final CTA     — dual split panel: creator (gold) | brand (paper-3).
//
// Footer lives in src/components/landing/Footer.tsx (rewritten alongside).
// -----------------------------------------------------------------------------

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
  Lock,
  Wallet,
  ScanFace,
  CheckCheck,
  Megaphone,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  CREATOR_PRIYA,
  CREATOR_ARJUN,
  CREATOR_MEERA,
  PRIYA_COMPOSITES,
  ALL_CREATORS,
  WATERMARK_MASK,
} from "@/components/landing/images";
import { HomeBrandDemo } from "./home-demo";

export default function HomePage() {
  return (
    <div className="relative">
      <Hero />
      <TrustQuote />
      <HowItWorks />
      <Marketplace />
      <BrandDemoSection />
      <CreatorControl />
      <Library />
      <Compliance />
      <FinalCTA />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   1 · HERO
   ════════════════════════════════════════════════════════════════════════════ */

const HERO_TRUST = [
  "Creator-approved",
  "DPDP-compliant",
  "GST invoices",
  "INR payouts",
  "Verified Indian creators",
] as const;

function Hero() {
  return (
    <section
      className="relative pt-24 md:pt-28 pb-20 md:pb-28"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <div className="absolute inset-0 grain opacity-50 pointer-events-none" />

      <div className="relative lp-container grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-20 items-start">
        {/* ── LEFT: copy ─────────────────────────────────────────────── */}
        <div>
          <div className="lp-eyebrow flex items-center gap-2 mb-7">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--lp-gold)" }}
            />
            India&rsquo;s AI Face Licensing Marketplace
          </div>

          <h1
            className="lp-display"
            style={{
              fontSize: "clamp(44px, 7vw, 76px)",
              lineHeight: 1.02,
              color: "var(--lp-ink)",
            }}
          >
            Your face can{" "}
            <em
              className="lp-display-italic"
              style={{ color: "var(--lp-gold-deep)" }}
            >
              earn.
            </em>
            <br />
            Your campaign can{" "}
            <em
              className="lp-display-italic"
              style={{ color: "var(--lp-gold-deep)" }}
            >
              launch
            </em>{" "}
            faster.
          </h1>

          <p
            className="mt-8 max-w-xl text-[17px] md:text-[18px] leading-[1.7]"
            style={{ color: "var(--lp-ink-soft)" }}
          >
            Faiceoff helps creators license their face safely &mdash; and helps
            brands create AI-powered ad images using verified Indian creators.
            Every image is creator-approved. Every campaign is consent-first.
            Every payment is simple, legal, and transparent.
          </p>

          {/* dual CTA */}
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth/signup/brand"
              className="lp-btn-primary justify-center"
            >
              I&rsquo;m a Brand
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/signup/creator"
              className="lp-btn-secondary justify-center"
            >
              I&rsquo;m a Creator
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* trust strip */}
          <div className="mt-10 flex flex-wrap gap-2">
            {HERO_TRUST.map((label) => (
              <span key={label} className="lp-pill">
                <Check
                  className="h-3 w-3"
                  style={{ color: "var(--lp-emerald)" }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── RIGHT: layered creator collage ─────────────────────────── */}
        <HeroCollage />
      </div>
    </section>
  );
}

/* Gold verified seal — the brand mark. 8-petal sunburst + white check,
   gold radial fill. Reused on each creator card's name pill. */
function GoldSeal({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <defs>
        <radialGradient
          id="lpHeroSeal"
          cx="34"
          cy="28"
          r="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#f0c34a" />
          <stop offset="0.85" stopColor="#c9a96e" />
          <stop offset="1" stopColor="#a3854f" />
        </radialGradient>
      </defs>
      <g fill="url(#lpHeroSeal)">
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
      <path
        d="M 34 51 L 45 62 L 67 39"
        fill="none"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* One creator card. Label = name + gold seal + category. */
function CreatorTag({ name, category }: { name: string; category: string }) {
  return (
    <div className="lp-collage-tag">
      <span>{name}</span>
      <GoldSeal size={13} />
      <span className="dot">·</span>
      <span className="cat">{category}</span>
    </div>
  );
}

/* Collage CSS injected inline (not via globals.css) — Next's CSS engine was
   silently dropping this block from the global sheet. Shipping it with the
   component guarantees it loads. Scoped under .lp-collage-stage. */
const COLLAGE_CSS = `
.lp-collage-stage .lp-collage-card {
  opacity: 0;
  transform: translateY(28px) scale(0.93) rotate(var(--rot, 0deg));
  animation: lpCardRise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  animation-delay: var(--delay, 0s);
  transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 0.45s ease;
  will-change: transform;
}
.lp-collage-stage .lp-collage-card:hover {
  transform: translateY(-10px) scale(1.04) rotate(0deg);
  z-index: 60;
  box-shadow: 0 44px 90px -34px rgba(26, 20, 16, 0.55);
}
@keyframes lpCardRise {
  to { opacity: 1; transform: translateY(0) scale(1) rotate(var(--rot, 0deg)); }
}
@media (prefers-reduced-motion: reduce) {
  .lp-collage-stage .lp-collage-card {
    opacity: 1;
    transform: rotate(var(--rot, 0deg));
    animation: none;
  }
}
.lp-collage-stage .lp-collage-tag {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(26, 20, 16, 0.82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fbf7ee;
  font-family: var(--font-body);
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.4);
}
.lp-collage-stage .lp-collage-tag .cat { color: #e5d9c2; font-weight: 500; }
.lp-collage-stage .lp-collage-tag .dot { opacity: 0.45; }
`;

function HeroCollage() {
  // Fanned showcase: two creator cards tilt out to the sides (faces clear of
  // the centre), one hero card straight on top, plus a floating AI-output
  // composite. Cards rise in on load + lift on hover. CSS is injected below
  // (Next was dropping the equivalent block from globals.css).
  return (
    <div className="lp-collage-stage relative w-full aspect-[1/0.94] max-w-[560px] mx-auto lg:mx-0 lg:ml-auto">
      <style dangerouslySetInnerHTML={{ __html: COLLAGE_CSS }} />
      {/* gold halo behind */}
      <div
        className="absolute inset-8 rounded-[34px] blur-3xl opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side, rgba(201,169,110,0.45), transparent 70%)",
        }}
      />

      {/* back-left card — Meera (Food) — tilt left, fanned out */}
      <div
        className="lp-collage-card absolute left-[-4%] top-[7%] w-[50%] aspect-[3/4] overflow-hidden"
        style={
          {
            "--rot": "-8deg",
            "--delay": "0.05s",
            borderRadius: 20,
            border: "1px solid var(--lp-border)",
            boxShadow: "var(--shadow-card-landing)",
            background: "var(--lp-paper)",
          } as React.CSSProperties
        }
      >
        <Image
          src={CREATOR_MEERA}
          alt="Meera, food creator"
          fill
          sizes="(max-width: 1024px) 55vw, 300px"
          className="object-cover object-[center_14%]"
          style={WATERMARK_MASK}
          unoptimized
          priority
        />
        <CreatorTag name="Meera" category="Food" />
      </div>

      {/* back-right card — Arjun (Tech) — tilt right, fanned out */}
      <div
        className="lp-collage-card absolute right-[-4%] top-[3%] w-[50%] aspect-[3/4] overflow-hidden"
        style={
          {
            "--rot": "8deg",
            "--delay": "0.12s",
            borderRadius: 20,
            border: "1px solid var(--lp-border)",
            boxShadow: "var(--shadow-card-landing)",
            background: "var(--lp-paper)",
          } as React.CSSProperties
        }
      >
        <Image
          src={CREATOR_ARJUN}
          alt="Arjun, tech creator"
          fill
          sizes="(max-width: 1024px) 55vw, 300px"
          className="object-cover object-[center_14%]"
          style={WATERMARK_MASK}
          unoptimized
        />
        <CreatorTag name="Arjun" category="Tech" />
      </div>

      {/* front card — Priya (Lifestyle) — straight, hero, on top.
          Centred via left:50% + marginLeft:-28% (= half of w-56%) instead of
          translateX, because the rise/hover animation owns the transform. */}
      <div
        className="lp-collage-card absolute top-[16%] w-[56%] aspect-[3/4] overflow-hidden"
        style={
          {
            "--rot": "0deg",
            "--delay": "0.2s",
            left: "50%",
            marginLeft: "-28%",
            borderRadius: 22,
            border: "1px solid var(--lp-border)",
            boxShadow: "0 36px 70px -28px rgba(26,20,16,0.55)",
            background: "var(--lp-paper)",
          } as React.CSSProperties
        }
      >
        <Image
          src={CREATOR_PRIYA}
          alt="Priya, lifestyle creator"
          fill
          sizes="(max-width: 1024px) 65vw, 360px"
          className="object-cover object-[center_12%]"
          style={WATERMARK_MASK}
          unoptimized
          priority
        />
        <CreatorTag name="Priya" category="Lifestyle" />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   2 · TRUST QUOTE
   ════════════════════════════════════════════════════════════════════════════ */

function TrustQuote() {
  return (
    <section className="lp-section-pad" style={{ background: "var(--lp-paper)" }}>
      <div className="lp-container">
        <div className="grid md:grid-cols-[auto_1fr] gap-10 md:gap-14 items-center max-w-5xl mx-auto">
          {/* portrait */}
          <div
            className="relative w-[160px] h-[160px] md:w-[200px] md:h-[200px] rounded-full overflow-hidden mx-auto md:mx-0 shrink-0"
            style={{
              border: "1px solid var(--lp-border)",
              boxShadow: "var(--shadow-card-landing)",
            }}
          >
            <Image
              src={CREATOR_PRIYA}
              alt="Priya, lifestyle creator"
              fill
              sizes="200px"
              className="object-cover"
              style={WATERMARK_MASK}
              unoptimized
            />
          </div>

          {/* quote */}
          <div className="text-center md:text-left">
            <div
              className="lp-display-italic"
              style={{
                fontSize: "clamp(28px, 4vw, 42px)",
                lineHeight: 1.25,
                color: "var(--lp-ink)",
                letterSpacing: "-0.01em",
              }}
            >
              <span
                style={{
                  color: "var(--lp-gold-deep)",
                  fontFamily: "var(--font-display)",
                }}
              >
                &ldquo;
              </span>
              I earned from brand campaigns without going for a shoot. I
              approved every image before it was used.
              <span
                style={{
                  color: "var(--lp-gold-deep)",
                  fontFamily: "var(--font-display)",
                }}
              >
                &rdquo;
              </span>
            </div>
            <div
              className="mt-5 flex flex-wrap items-center gap-2 justify-center md:justify-start"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--lp-muted)",
                letterSpacing: "0.08em",
              }}
            >
              <span style={{ color: "var(--lp-ink)" }}>PRIYA S.</span>
              <span aria-hidden>&middot;</span>
              <span>Lifestyle Creator</span>
              <span aria-hidden>&middot;</span>
              <span>Mumbai</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   3 · HOW IT WORKS
   ════════════════════════════════════════════════════════════════════════════ */

const STEPS: ReadonlyArray<{
  n: string;
  title: string;
  body: string;
  pillLabel: string;
  icon: ComponentType<{ className?: string }>;
  bullets: string[];
}> = [
  {
    n: "01",
    title: "Creators license their face",
    body: "Verify your identity, set your own price, and choose the categories you'll allow. We embed your face anchor securely — you stay in control of every approval.",
    pillLabel: "Creator-side",
    icon: ScanFace,
    bullets: ["KYC-verified identity", "Set your own rate", "Pick allowed categories"],
  },
  {
    n: "02",
    title: "Brands create campaign images",
    body: "Pick a verified creator, upload your product, write a brief. Faiceoff AI assembles the shot — no studio booking, no model coordination, no production cycle.",
    pillLabel: "Brand-side",
    icon: Sparkles,
    bullets: ["Upload product + brief", "AI assembles the shot", "Iterate in minutes"],
  },
  {
    n: "03",
    title: "Creators approve and earn",
    body: "Every image waits for the creator's green light before going live. The brand pays after acceptance, and creators receive 75% in INR — paid straight to their bank.",
    pillLabel: "Approval & payout",
    icon: Wallet,
    bullets: ["Creator green-lights each image", "Pay only on approval", "75% payout in INR"],
  },
];

function HowItWorks() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <SectionHeader
          eyebrow="How it works"
          title={
            <>
              Three steps. <em className="lp-display-italic">One simple process.</em>
            </>
          }
          sub="No shoots. No middlemen. No confusion."
        />

        <div className="mt-14 grid md:grid-cols-3 gap-5 lg:gap-7 relative">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="relative flex">
              <article
                className="lp-card relative flex flex-1 flex-col p-7 md:p-8 overflow-hidden"
                style={{ background: "var(--lp-paper)" }}
              >
                {/* gold accent bar */}
                <span
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--lp-gold), var(--lp-gold-soft))",
                  }}
                />

                {/* header: solid-gold icon + big step number */}
                <div className="flex items-start justify-between">
                  <span
                    className="flex items-center justify-center rounded-2xl"
                    style={{
                      width: 54,
                      height: 54,
                      background:
                        "linear-gradient(145deg, var(--lp-gold), var(--lp-gold-deep))",
                      color: "#fff",
                      boxShadow: "0 10px 24px -10px rgba(201,169,110,0.9)",
                    }}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span
                    aria-hidden
                    className="lp-display select-none leading-none"
                    style={{
                      fontSize: 56,
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                      background:
                        "linear-gradient(160deg, var(--lp-gold), var(--lp-gold-deep))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "var(--lp-gold-deep)",
                    }}
                  >
                    {s.n}
                  </span>
                </div>

                {/* pill label */}
                <span
                  className="lp-pill self-start mt-5"
                  style={{ background: "var(--lp-paper-3)" }}
                >
                  {s.pillLabel}
                </span>

                {/* title + body */}
                <h3
                  className="lp-display mt-3 text-[22px] md:text-[23px]"
                  style={{ color: "var(--lp-ink)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2.5 text-[14.5px] leading-relaxed"
                  style={{ color: "var(--lp-ink-soft)" }}
                >
                  {s.body}
                </p>

                {/* bullets — pinned to the card bottom so all 3 cards align */}
                <ul
                  className="mt-auto flex flex-col gap-2.5 pt-5"
                  style={{ borderTop: "1px solid var(--lp-border)", marginTop: "auto" }}
                >
                  {s.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-center gap-2.5 text-[13.5px] font-medium"
                      style={{ color: "var(--lp-ink)" }}
                    >
                      <span
                        className="flex shrink-0 items-center justify-center rounded-full"
                        style={{
                          width: 18,
                          height: 18,
                          background: "var(--lp-gold)",
                          color: "#fff",
                        }}
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

              </article>

              {/* arrow connector — sibling of the card so it isn't clipped */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-[58px] z-20 hidden h-9 w-9 items-center justify-center rounded-full md:flex"
                  style={{
                    right: "-1.875rem",
                    background: "var(--lp-paper)",
                    border: "1px solid var(--lp-border)",
                    color: "var(--lp-gold-deep)",
                    boxShadow: "var(--shadow-card-landing)",
                  }}
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   4 · CREATOR MARKETPLACE
   ════════════════════════════════════════════════════════════════════════════ */

function Marketplace() {
  // Take 6 creators including Priya at the front
  const creators = ALL_CREATORS.slice(0, 6);

  return (
    <section className="lp-section-pad" style={{ background: "var(--lp-paper)" }}>
      <div className="lp-container">
        <SectionHeader
          eyebrow="Verified creators"
          title={
            <>
              Real creators.{" "}
              <em className="lp-display-italic">Real consent.</em> Real campaigns.
            </>
          }
          sub="Every creator on Faiceoff has signed a face-licensing agreement, set their own price, and chosen the categories they're open to."
        />

        <div className="mt-14 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {creators.map((c) => (
            <article
              key={c.name}
              className="group relative overflow-hidden"
              style={{
                borderRadius: 18,
                border: "1px solid var(--lp-border)",
                background: "var(--lp-paper)",
                boxShadow: "var(--shadow-card-landing)",
              }}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={c.src}
                  alt={`${c.name}, ${c.niche.toLowerCase()} creator from ${c.city}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 360px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  style={WATERMARK_MASK}
                  unoptimized
                />

                {/* verified pill */}
                <div
                  className="absolute right-3 top-3 px-2 py-1 rounded-full flex items-center gap-1"
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    color: "var(--lp-ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--lp-emerald)" }}
                  />
                  VERIFIED
                </div>
              </div>

              <div className="p-4 md:p-5 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3
                    className="lp-display text-[20px]"
                    style={{ color: "var(--lp-ink)" }}
                  >
                    {c.name}
                  </h3>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--lp-muted)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {c.city.toUpperCase()}
                  </span>
                </div>
                <span
                  className="lp-pill self-start"
                  style={{ background: "var(--lp-paper-2)" }}
                >
                  {c.niche}
                </span>
                <div
                  className="mt-2 flex items-center justify-between text-[13px]"
                  style={{ color: "var(--lp-muted)" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    From {c.price}
                  </span>
                  <span
                    className="flex items-center gap-1 font-medium transition-colors group-hover:opacity-100"
                    style={{ color: "var(--lp-ink)" }}
                  >
                    Browse profile
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/auth/signup/brand" className="lp-btn-primary">
            Browse verified creators
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   5 · BRAND DEMO SECTION (uses HomeBrandDemo client island)
   ════════════════════════════════════════════════════════════════════════════ */

const BRAND_USE_CASES = [
  "Fashion",
  "Beauty",
  "Tech",
  "Food",
  "Marketplace",
  "Social",
  "Performance",
] as const;

function BrandDemoSection() {
  return (
    <section
      className="lp-section-pad relative overflow-hidden"
      style={{ background: "var(--lp-paper-3)" }}
    >
      <div className="lp-container">
        <SectionHeader
          eyebrow="For brands"
          title={
            <>
              Create brand images{" "}
              <em className="lp-display-italic">without a photoshoot.</em>
            </>
          }
          sub="Pick a verified creator, upload your product, write a one-liner. Faiceoff AI delivers approved campaign images in minutes."
        />

        <div className="mt-12">
          <HomeBrandDemo />
        </div>

        {/* use case chips */}
        <div className="mt-10 flex flex-wrap gap-2 justify-center">
          {BRAND_USE_CASES.map((u) => (
            <span key={u} className="lp-pill">
              {u}
            </span>
          ))}
        </div>

        <p
          className="mt-6 text-center text-[14px]"
          style={{ color: "var(--lp-muted)" }}
        >
          No studio booking. No model coordination. No long production cycle.
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   6 · CREATOR CONTROL
   ════════════════════════════════════════════════════════════════════════════ */

const CREATOR_BULLETS = [
  {
    title: "Set your own price",
    body: "You choose what each campaign image is worth.",
  },
  {
    title: "Approve every image",
    body: "Nothing ships until you click approve. 48-hour window per request.",
  },
  {
    title: "Block unwanted categories",
    body: "Alcohol, gambling, anything you don't want — never even reaches your inbox.",
  },
  {
    title: "Earn in INR",
    body: "75% creator share. GST-handled invoices. No foreign currency math.",
  },
  {
    title: "Withdraw to your bank",
    body: "Add your bank details once. After verification, earnings are transferred straight to your account — no middlemen.",
  },
  {
    title: "Track all requests in one place",
    body: "Inbox, history, earnings, licenses — one clean dashboard.",
  },
] as const;

function CreatorControl() {
  return (
    <section className="lp-section-pad" style={{ background: "var(--lp-paper)" }}>
      <div className="lp-container grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
        {/* Photo */}
        <div className="relative order-2 lg:order-1">
          <div
            className="relative aspect-[4/5] max-w-[460px] mx-auto overflow-hidden"
            style={{
              borderRadius: 22,
              border: "1px solid var(--lp-border)",
              boxShadow: "var(--shadow-card-landing)",
            }}
          >
            <Image
              src={CREATOR_PRIYA}
              alt="Creator reviewing a campaign request"
              fill
              sizes="(max-width: 1024px) 90vw, 460px"
              className="object-cover"
              style={WATERMARK_MASK}
              unoptimized
            />

            {/* approval card overlay */}
            <div
              className="absolute left-4 right-4 bottom-4 p-4 rounded-2xl flex items-start gap-3"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid var(--lp-border)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: "var(--lp-emerald-soft)",
                  color: "var(--lp-emerald)",
                }}
              >
                <CheckCheck className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] font-semibold"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--lp-emerald)",
                    letterSpacing: "0.08em",
                  }}
                >
                  APPROVED &middot; 12s ago
                </div>
                <div
                  className="text-[14px] font-semibold mt-0.5 truncate"
                  style={{ color: "var(--lp-ink)" }}
                >
                  Athleisure Co. &middot; Spring drop
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: "var(--lp-muted)" }}
                >
                  +&#8377;1,875 to wallet
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bullets */}
        <div className="order-1 lg:order-2">
          <div className="lp-eyebrow mb-5">For creators</div>
          <h2
            className="lp-display"
            style={{
              fontSize: "clamp(34px, 4.6vw, 52px)",
              lineHeight: 1.06,
              color: "var(--lp-ink)",
            }}
          >
            Creators stay in control.{" "}
            <em className="lp-display-italic" style={{ color: "var(--lp-gold-deep)" }}>
              Nothing ships
            </em>{" "}
            without creator approval.
          </h2>

          <ul className="mt-9 grid sm:grid-cols-2 gap-x-6 gap-y-5">
            {CREATOR_BULLETS.map((b) => (
              <li key={b.title} className="flex items-start gap-3">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: "var(--lp-gold-tint)",
                    color: "var(--lp-gold-deep)",
                    border: "1px solid var(--lp-gold-soft)",
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div>
                  <div
                    className="text-[15px] font-semibold"
                    style={{ color: "var(--lp-ink)" }}
                  >
                    {b.title}
                  </div>
                  <p
                    className="text-[13.5px] leading-relaxed mt-0.5"
                    style={{ color: "var(--lp-muted)" }}
                  >
                    {b.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/auth/signup/creator" className="lp-btn-primary">
              Start Earning
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/for-creators" className="lp-btn-secondary">
              How payouts work
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   7 · LIBRARY (final creatives gallery)
   ════════════════════════════════════════════════════════════════════════════ */

const LIBRARY_CHANNELS = [
  "Meta ads",
  "Instagram",
  "Amazon",
  "Flipkart",
  "Landing pages",
  "Email",
  "Banners",
] as const;

const LIBRARY_IMAGES = [
  { src: PRIYA_COMPOSITES.sneaker, label: "Athleisure Co. · Spring" },
  { src: PRIYA_COMPOSITES.skincare, label: "Skin Co. · Routine" },
  { src: PRIYA_COMPOSITES.lipstick, label: "Beauty Co. · Lip drop" },
  { src: PRIYA_COMPOSITES.phone, label: "Tech Co. · Festival" },
  { src: PRIYA_COMPOSITES.food, label: "Snack Co. · Hero" },
] as const;

function Library() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <SectionHeader
          eyebrow="Library"
          title={
            <>
              Final creatives,{" "}
              <em className="lp-display-italic">ready to use.</em>
            </>
          }
          sub="Every approved creative in your Faiceoff Library is downloadable in print &amp; digital sizes — and ships with commercial usage rights and an invoice."
        />

        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {LIBRARY_IMAGES.map((img, i) => (
            <figure
              key={img.label}
              className="relative overflow-hidden group"
              style={{
                borderRadius: 16,
                border: "1px solid var(--lp-border)",
                background: "var(--lp-paper)",
                boxShadow: "var(--shadow-card-landing)",
                aspectRatio: i === 0 ? "1 / 1.25" : "1 / 1.25",
              }}
            >
              <Image
                src={img.src}
                alt={img.label}
                fill
                sizes="(max-width: 768px) 50vw, 22vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                style={WATERMARK_MASK}
                unoptimized
              />
              <figcaption
                className="absolute left-2 right-2 bottom-2 px-2.5 py-1.5 rounded-lg"
                style={{
                  background: "rgba(26,20,16,0.78)",
                  color: "var(--lp-paper)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                }}
              >
                {img.label}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* channel chips */}
        <div className="mt-10 flex flex-wrap gap-2 justify-center">
          {LIBRARY_CHANNELS.map((c) => (
            <span key={c} className="lp-pill">
              {c}
            </span>
          ))}
        </div>

        <p
          className="mt-6 text-center text-[14px] max-w-2xl mx-auto"
          style={{ color: "var(--lp-muted)" }}
        >
          Every approved creative includes commercial usage rights and invoice
          support &mdash; ready for paid media, marketplace listings, and
          performance ads.
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   8 · COMPLIANCE
   ════════════════════════════════════════════════════════════════════════════ */

const COMPLIANCE = [
  {
    icon: Lock,
    title: "DPDP-first consent",
    body: "Every face license is signed under India's DPDP Act. Creators can revoke at any time.",
  },
  {
    icon: ShieldCheck,
    title: "Creator approval",
    body: "No image is delivered until the creator explicitly approves it inside the Faiceoff app.",
  },
  {
    icon: ScanFace,
    title: "AI safety checks",
    body: "Three-layer compliance scan blocks unsafe categories before generation ever begins.",
  },
] as const;

function Compliance() {
  return (
    <section className="lp-section-pad" style={{ background: "var(--lp-paper)" }}>
      <div className="lp-container">
        <SectionHeader
          eyebrow="Compliance"
          title={
            <>
              Built for{" "}
              <em className="lp-display-italic">Indian creators</em> and{" "}
              <em className="lp-display-italic">Indian brands.</em>
            </>
          }
          sub="Faiceoff is a marketplace, but it operates like infrastructure &mdash; designed to satisfy DPDP, GST, and IT-Act obligations end-to-end."
        />

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {COMPLIANCE.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="lp-card p-6 md:p-7 flex flex-col gap-4"
              style={{ background: "var(--lp-paper)" }}
            >
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center"
                style={{
                  background: "var(--lp-gold-tint)",
                  color: "var(--lp-gold-deep)",
                  border: "1px solid var(--lp-gold-soft)",
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3
                className="lp-display text-[20px]"
                style={{ color: "var(--lp-ink)" }}
              >
                {title}
              </h3>
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: "var(--lp-muted)" }}
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   9 · FINAL DUAL CTA
   ════════════════════════════════════════════════════════════════════════════ */

function FinalCTA() {
  return (
    <section className="relative" style={{ background: "var(--lp-paper)" }}>
      <div className="lp-container py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* Creator side — gold panel */}
          <article
            className="relative p-8 md:p-12 overflow-hidden flex flex-col"
            style={{
              borderRadius: 22,
              background:
                "linear-gradient(155deg, var(--lp-gold) 0%, var(--lp-gold-deep) 100%)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <div
              className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full pointer-events-none opacity-30"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(255,255,255,0.7), transparent 70%)",
              }}
            />

            <div
              className="lp-eyebrow flex items-center gap-2 mb-5"
              style={{ color: "var(--lp-ink)" }}
            >
              <Wallet className="h-3.5 w-3.5" />
              For creators
            </div>
            <h3
              className="lp-display"
              style={{
                fontSize: "clamp(28px, 3.6vw, 40px)",
                color: "var(--lp-ink)",
                lineHeight: 1.08,
              }}
            >
              Your face. Your rules.{" "}
              <em className="lp-display-italic" style={{ color: "var(--lp-paper)" }}>
                Your income.
              </em>
            </h3>

            <ul
              className="mt-6 space-y-2.5 text-[14.5px]"
              style={{ color: "var(--lp-ink)" }}
            >
              {[
                "75% creator share, paid in INR to your bank",
                "Approve every image. Reject anything you don't like.",
                "Free to join — ₹0 signup fee, no lock-in",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <Link
                href="/auth/signup/creator"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold text-[14.5px] transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--lp-ink)",
                  color: "var(--lp-paper)",
                  boxShadow: "0 12px 30px -12px rgba(26,20,16,0.5)",
                }}
              >
                Start Earning
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>

          {/* Brand side — paper-3 panel */}
          <article
            className="relative p-8 md:p-12 overflow-hidden flex flex-col"
            style={{
              borderRadius: 22,
              background: "var(--lp-paper-3)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <div className="lp-eyebrow flex items-center gap-2 mb-5">
              <Megaphone className="h-3.5 w-3.5" />
              For brands
            </div>
            <h3
              className="lp-display"
              style={{
                fontSize: "clamp(28px, 3.6vw, 40px)",
                color: "var(--lp-ink)",
                lineHeight: 1.08,
              }}
            >
              Create ads faster with{" "}
              <em
                className="lp-display-italic"
                style={{ color: "var(--lp-gold-deep)" }}
              >
                licensed Indian creators.
              </em>
            </h3>

            <ul
              className="mt-6 space-y-2.5 text-[14.5px]"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              {[
                "Verified creators, signed face licenses, GST invoices",
                "Pay only after the creator accepts your brief",
                "Funds held in escrow — released on approval, refunded on rejection",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 mt-1 shrink-0"
                    style={{ color: "var(--lp-gold-deep)" }}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8 flex flex-wrap gap-3">
              <Link href="/auth/signup/brand" className="lp-btn-primary">
                Start a Campaign
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="lp-btn-secondary">
                See pricing
              </Link>
            </div>
          </article>
        </div>

        <div
          className="mt-12 flex flex-wrap items-center justify-center gap-4 md:gap-5 pt-8 border-t"
          style={{
            borderColor: "var(--lp-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--lp-muted)",
            letterSpacing: "0.06em",
          }}
        >
          <span style={{ color: "var(--lp-ink)" }}>Made in India</span>
          <span aria-hidden>&middot;</span>
          <span>DPDP-compliant</span>
          <span aria-hidden>&middot;</span>
          <span>GST-ready</span>
          <span aria-hidden>&middot;</span>
          <span>Creator-first</span>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   helpers
   ════════════════════════════════════════════════════════════════════════════ */

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: ReactNode;
  sub: string;
}) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      <div className="lp-eyebrow flex items-center justify-center gap-2 mb-5">
        <span
          className="h-1 w-6 rounded-full"
          style={{ background: "var(--lp-gold)" }}
        />
        {eyebrow}
      </div>
      <h2
        className="lp-display"
        style={{
          fontSize: "clamp(32px, 4.8vw, 54px)",
          lineHeight: 1.06,
          color: "var(--lp-ink)",
        }}
      >
        {title}
      </h2>
      <p
        className="mt-5 text-[16px] md:text-[17px] leading-relaxed max-w-2xl mx-auto"
        style={{ color: "var(--lp-muted)" }}
      >
        {sub}
      </p>
    </div>
  );
}

