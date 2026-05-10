// ─────────────────────────────────────────────────────────────────────────────
// /for-brands — Public marketing page for brands
//
// Light editorial aesthetic. Uses ONLY the `lp-*` token system from
// `.landing-scope` in globals.css. No Tailwind color utilities. No dark theme.
//
// Server component — no client interactivity needed.
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ShoppingBag,
  Smartphone,
  Sparkles as SparklesIcon,
  Headphones,
  Cookie,
  Shirt,
  Dumbbell,
  Brush,
  AppWindow,
  ShieldCheck,
  Receipt,
  Zap,
  Layers,
  Target,
  Megaphone,
  MapPin,
  FileCheck2,
  IndianRupee,
  Quote,
} from "lucide-react";

import { PRIYA_COMPOSITES, CREATOR_PRIYA, WATERMARK_MASK } from "@/components/landing/images";

// ─────────────────────────────────────────────────────────────────────────────
export const metadata = {
  title: "AI Creator Ads With Licensed Indian Faces | Faiceoff for Brands",
  description:
    "Create AI-generated brand campaign images with verified Indian creators. Faiceoff gives brands licensed faces, creator approval, GST invoices, and commercial usage rights.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — local primitives stay in this file so the page is self-contained.
// All colors via inline style props using `--lp-*` tokens.
// ─────────────────────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="lp-eyebrow">{children}</div>;
}

function SectionDivider() {
  return (
    <div className="lp-container">
      <div className="lp-divider" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Hero
// ─────────────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      className="lp-section-pad relative"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="lp-container relative">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div>
            <Eyebrow>For Brands · Licensed Creator Ads</Eyebrow>

            <h1
              className="lp-display mt-6"
              style={{
                color: "var(--lp-ink)",
                fontSize: "clamp(40px, 6.2vw, 76px)",
                lineHeight: 1.02,
              }}
            >
              Skip the{" "}
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--lp-gold-deep)",
                }}
              >
                shoot.
              </span>
              <br />
              <span style={{ fontWeight: 700 }}>Launch the campaign.</span>
            </h1>

            <p
              className="mt-7 max-w-xl"
              style={{
                color: "var(--lp-ink-soft)",
                fontSize: "18px",
                lineHeight: 1.6,
              }}
            >
              Faiceoff helps brands create AI campaign images with verified
              Indian creators.
            </p>

            {/* 5-step compact list */}
            <ol
              className="mt-7 grid gap-2 max-w-xl"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              {[
                "Choose a creator.",
                "Write your brief.",
                "Generate the image.",
                "Wait for creator approval.",
                "Download and publish.",
              ].map((step, i) => (
                <li
                  key={step}
                  className="flex items-baseline gap-3"
                  style={{ fontSize: "15.5px" }}
                >
                  <span
                    className="lp-mono"
                    style={{
                      color: "var(--lp-gold-deep)",
                      fontSize: "12px",
                      fontWeight: 600,
                      minWidth: "18px",
                    }}
                  >
                    0{i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link href="/auth/signup/brand" className="lp-btn-primary">
                Sign Up as a Brand <ArrowRight size={16} />
              </Link>
              <Link href="/for-creators" className="lp-btn-secondary">
                I&apos;m a Creator
              </Link>
            </div>
          </div>

          {/* Visual: layered card with composite */}
          <div className="relative">
            <div
              className="absolute -inset-6 rounded-[28px] -z-10"
              style={{
                background:
                  "radial-gradient(circle at 30% 20%, rgba(201,169,110,0.18), transparent 60%)",
              }}
            />
            <div
              className="lp-card overflow-hidden"
              style={{
                aspectRatio: "4/5",
                position: "relative",
              }}
            >
              <Image
                src={PRIYA_COMPOSITES.sneaker}
                alt="Creator campaign image example"
                fill
                style={{ objectFit: "cover", ...WATERMARK_MASK }}
                sizes="(max-width: 1024px) 100vw, 480px"
                priority
              />
            </div>

            {/* floating mini-card overlay */}
            <div
              className="absolute -bottom-5 -left-5 lp-card px-4 py-3 hidden sm:flex items-center gap-3"
              style={{ minWidth: "200px" }}
            >
              <div
                className="grid place-items-center rounded-full"
                style={{
                  background: "var(--lp-emerald-soft)",
                  width: 32,
                  height: 32,
                }}
              >
                <CheckCircle2 size={16} style={{ color: "var(--lp-emerald)" }} />
              </div>
              <div>
                <div
                  className="lp-mono"
                  style={{
                    fontSize: "10px",
                    color: "var(--lp-muted)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Approved by creator
                </div>
                <div
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 600,
                    color: "var(--lp-ink)",
                  }}
                >
                  Licensed for ads
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Trust chips
// ─────────────────────────────────────────────────────────────────────────────

function TrustChips() {
  const chips = [
    "Verified Indian creators",
    "Full commercial usage rights",
    "GST invoice included",
    "Creator approval within 48 hours",
    "Pay per approved image",
  ];
  return (
    <section className="pb-12 md:pb-16">
      <div className="lp-container">
        <div className="flex flex-wrap gap-2 justify-center">
          {chips.map((c) => (
            <span key={c} className="lp-pill" style={{ fontSize: "11px" }}>
              <CheckCircle2
                size={11}
                style={{ color: "var(--lp-gold-deep)" }}
              />
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Problem
// ─────────────────────────────────────────────────────────────────────────────

function Problem() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>The Problem</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.4vw, 56px)",
            }}
          >
            Good campaign images take{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--lp-coral)",
              }}
            >
              too long.
            </span>
          </h2>
          <p
            className="mt-6"
            style={{
              color: "var(--lp-ink-soft)",
              fontSize: "17px",
              lineHeight: 1.7,
            }}
          >
            A normal shoot needs planning, calls, travel, locations, models,
            stylists, invoices, approvals, and edits. For one image, brands
            lose days. For multiple campaigns, brands lose weeks.
          </p>
          <p
            className="mt-7"
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--lp-ink)",
              display: "inline-block",
              borderBottom: "3px solid var(--lp-gold)",
              paddingBottom: "4px",
            }}
          >
            Faiceoff makes this faster.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — One creator, many campaigns
// ─────────────────────────────────────────────────────────────────────────────

function OneCreatorManyCampaigns() {
  const productChips = [
    { icon: ShoppingBag, label: "Sneakers" },
    { icon: Smartphone, label: "Phones" },
    { icon: SparklesIcon, label: "Skincare" },
    { icon: Headphones, label: "Headphones" },
    { icon: Cookie, label: "Food products" },
    { icon: Shirt, label: "Fashion drops" },
    { icon: Dumbbell, label: "Fitness brands" },
    { icon: Brush, label: "Beauty launches" },
    { icon: AppWindow, label: "App campaigns" },
  ];

  return (
    <section className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>One Likeness · Many Campaigns</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.4vw, 56px)",
            }}
          >
            One creator.{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              Many campaigns.
            </span>
          </h2>
          <p
            className="mt-5"
            style={{ color: "var(--lp-ink-soft)", fontSize: "16.5px" }}
          >
            Use the same licensed creator face across different product
            campaigns. No new shoot needed every time.
          </p>
        </div>

        {/* Visual: centered creator surrounded by chips */}
        <div className="mt-14 relative max-w-4xl mx-auto">
          <div className="grid place-items-center">
            {/* center creator */}
            <div className="relative z-10">
              <div
                className="rounded-full overflow-hidden border"
                style={{
                  width: "200px",
                  height: "200px",
                  borderColor: "var(--lp-gold-soft)",
                  borderWidth: "4px",
                  boxShadow: "var(--shadow-glow)",
                  position: "relative",
                }}
              >
                <Image
                  src={CREATOR_PRIYA}
                  alt="Verified creator"
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="200px"
                />
              </div>
              <div
                className="lp-pill-gold mt-4 mx-auto"
                style={{ width: "fit-content" }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--lp-gold-deep)",
                  }}
                />
                Priya · Mumbai
              </div>
            </div>
          </div>

          {/* chips grid below */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {productChips.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="lp-card flex items-center gap-3 px-4 py-3"
                style={{ borderRadius: "12px" }}
              >
                <div
                  className="grid place-items-center rounded-lg"
                  style={{
                    background: "var(--lp-gold-tint)",
                    width: 32,
                    height: 32,
                  }}
                >
                  <Icon size={16} style={{ color: "var(--lp-gold-deep)" }} />
                </div>
                <span
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 600,
                    color: "var(--lp-ink)",
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Live demo example
// ─────────────────────────────────────────────────────────────────────────────

function LiveDemoExample() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Live Demo · Real Output</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            See how a{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              brief
            </span>{" "}
            becomes a campaign.
          </h2>
        </div>

        <div className="grid lg:grid-cols-[1fr_60px_1fr] gap-8 lg:gap-6 items-center">
          {/* Brief side */}
          <div>
            <div
              className="lp-mono"
              style={{
                fontSize: "11px",
                color: "var(--lp-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              Example brief
            </div>
            <div
              className="lp-card p-7 relative"
              style={{ background: "var(--lp-paper)" }}
            >
              <Quote
                size={28}
                style={{
                  color: "var(--lp-gold-soft)",
                  position: "absolute",
                  top: "20px",
                  left: "20px",
                  opacity: 0.6,
                }}
              />
              <p
                className="lp-display"
                style={{
                  fontSize: "22px",
                  lineHeight: 1.4,
                  color: "var(--lp-ink)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  paddingLeft: "36px",
                  paddingTop: "8px",
                }}
              >
                &ldquo;Priya wearing white sneakers, soft pink background,
                editorial campaign style.&rdquo;
              </p>
              <div
                className="mt-6 pt-5"
                style={{ borderTop: "1px solid var(--lp-border)" }}
              >
                <div
                  className="flex items-center gap-3"
                  style={{ fontSize: "13px", color: "var(--lp-muted)" }}
                >
                  <span className="lp-pill-gold" style={{ fontSize: "10px" }}>
                    Mood
                  </span>
                  <span>Editorial · Soft</span>
                </div>
                <div
                  className="flex items-center gap-3 mt-2"
                  style={{ fontSize: "13px", color: "var(--lp-muted)" }}
                >
                  <span className="lp-pill-gold" style={{ fontSize: "10px" }}>
                    Setting
                  </span>
                  <span>Studio · Pink backdrop</span>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden lg:flex items-center justify-center">
            <div
              className="rounded-full grid place-items-center"
              style={{
                width: 56,
                height: 56,
                background: "var(--lp-gold)",
                color: "var(--lp-ink)",
                boxShadow: "var(--shadow-glow)",
              }}
            >
              <ArrowRight size={22} />
            </div>
          </div>
          <div className="lg:hidden flex items-center justify-center py-2">
            <div
              className="rounded-full grid place-items-center"
              style={{
                width: 44,
                height: 44,
                background: "var(--lp-gold)",
                color: "var(--lp-ink)",
              }}
            >
              <ArrowRight size={18} style={{ transform: "rotate(90deg)" }} />
            </div>
          </div>

          {/* Output side */}
          <div>
            <div
              className="lp-mono"
              style={{
                fontSize: "11px",
                color: "var(--lp-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              Final creative
            </div>
            <div
              className="lp-card overflow-hidden"
              style={{ aspectRatio: "4/5", position: "relative" }}
            >
              <Image
                src={PRIYA_COMPOSITES.sneaker}
                alt="Generated campaign image"
                fill
                style={{ objectFit: "cover", ...WATERMARK_MASK }}
                sizes="(max-width: 1024px) 100vw, 480px"
              />
            </div>
            <div
              className="mt-3 flex items-center gap-2"
              style={{ fontSize: "13px", color: "var(--lp-muted)" }}
            >
              <CheckCircle2 size={14} style={{ color: "var(--lp-emerald)" }} />
              Approved by Priya · Licensed for advertising
            </div>
          </div>
        </div>

        <p
          className="mt-12 max-w-3xl mx-auto text-center"
          style={{
            fontSize: "16px",
            color: "var(--lp-ink-soft)",
            lineHeight: 1.7,
          }}
        >
          Faiceoff generates the image using Priya&apos;s licensed AI likeness.
          Priya approves it. Your team gets the final creative with usage
          rights.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — How it works (8-step timeline)
// ─────────────────────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { title: "Sign up", body: "Create brand account, basic verification." },
    {
      title: "Add credits + wallet",
      body: "Credits cover AI generation; wallet pays creator licensing fees.",
    },
    {
      title: "Browse creators",
      body: "Filter by category, city, audience, style, pricing.",
    },
    {
      title: "Write brief",
      body: "Product, mood, setting, pose, background, campaign idea.",
    },
    {
      title: "Generate image",
      body: "Faiceoff creates AI image using creator's licensed likeness.",
    },
    { title: "Creator approves", body: "Reviews before delivery." },
    {
      title: "Download from Library",
      body: "Approved images stored in your brand library.",
    },
    {
      title: "Publish with confidence",
      body: "Ads, social, marketplaces, landing pages.",
    },
  ];

  return (
    <section className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>How It Works</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Eight steps from{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              brief
            </span>{" "}
            to launch.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-2 max-w-5xl">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="flex gap-5 py-5"
              style={{
                borderBottom:
                  i < steps.length - 1 && i !== steps.length - 2
                    ? "1px solid var(--lp-border)"
                    : "none",
              }}
            >
              <div
                className="lp-display shrink-0"
                style={{
                  fontSize: "32px",
                  color: "var(--lp-gold-deep)",
                  fontWeight: 500,
                  lineHeight: 1,
                  minWidth: "44px",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "var(--lp-ink)",
                    marginBottom: "4px",
                  }}
                >
                  {s.title}
                </h3>
                <p
                  style={{
                    fontSize: "14.5px",
                    color: "var(--lp-ink-soft)",
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Comparison table
// ─────────────────────────────────────────────────────────────────────────────

function Comparison() {
  const tradBullets = [
    "Days or weeks of turnaround",
    "Model coordination calls",
    "Crew, location, props, lighting",
    "Negotiate usage rights",
    "Reshoot cost on every revision",
    "Hard to scale across campaigns",
  ];
  const faiceoffBullets = [
    "Minutes to deliver",
    "Verified creator likeness",
    "Pay per generation",
    "Creator approval included",
    "Commercial usage rights",
    "GST invoice included",
    "Scale faster across formats",
  ];

  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-14">
          <Eyebrow>Traditional vs Faiceoff</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            The difference is in the{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              hours.
            </span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Traditional shoot card */}
          <div
            className="lp-card relative overflow-hidden"
            style={{ padding: "32px" }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                background: "var(--lp-coral)",
              }}
            />
            <div className="flex items-center gap-3 mb-6">
              <div
                className="grid place-items-center rounded-lg"
                style={{
                  background: "var(--lp-coral-soft)",
                  width: 36,
                  height: 36,
                }}
              >
                <span
                  style={{
                    fontSize: "16px",
                    color: "var(--lp-coral)",
                  }}
                >
                  ✕
                </span>
              </div>
              <h3
                className="lp-display"
                style={{
                  fontSize: "26px",
                  color: "var(--lp-ink)",
                  fontWeight: 600,
                }}
              >
                Traditional Shoot
              </h3>
            </div>
            <ul className="space-y-3">
              {tradBullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3"
                  style={{
                    fontSize: "15px",
                    color: "var(--lp-ink-soft)",
                  }}
                >
                  <span
                    style={{
                      color: "var(--lp-coral)",
                      fontSize: "14px",
                      marginTop: "2px",
                    }}
                  >
                    ✕
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Faiceoff card */}
          <div
            className="lp-card relative overflow-hidden"
            style={{ padding: "32px" }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                background: "var(--lp-emerald)",
              }}
            />
            <div className="flex items-center gap-3 mb-6">
              <div
                className="grid place-items-center rounded-lg"
                style={{
                  background: "var(--lp-emerald-soft)",
                  width: 36,
                  height: 36,
                }}
              >
                <CheckCircle2
                  size={18}
                  style={{ color: "var(--lp-emerald)" }}
                />
              </div>
              <h3
                className="lp-display"
                style={{
                  fontSize: "26px",
                  color: "var(--lp-ink)",
                  fontWeight: 600,
                }}
              >
                Faiceoff
              </h3>
            </div>
            <ul className="space-y-3">
              {faiceoffBullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3"
                  style={{
                    fontSize: "15px",
                    color: "var(--lp-ink-soft)",
                  }}
                >
                  <CheckCircle2
                    size={16}
                    style={{
                      color: "var(--lp-emerald)",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 8 — Use cases
// ─────────────────────────────────────────────────────────────────────────────

function UseCases() {
  const cases = [
    {
      icon: Target,
      title: "Performance marketing",
      body: "More ad variations for Meta, Google, marketplaces.",
    },
    {
      icon: Megaphone,
      title: "Product launches",
      body: "Campaign images for new drops without waiting.",
    },
    {
      icon: ShoppingBag,
      title: "Marketplace creatives",
      body: "Amazon, Flipkart, D2C stores.",
    },
    {
      icon: AppWindow,
      title: "Social media",
      body: "Instagram, LinkedIn, short campaigns.",
    },
    {
      icon: MapPin,
      title: "Regional campaigns",
      body: "Indian creators across cities, categories, styles.",
    },
  ];

  return (
    <section className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Use Cases</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Built for fast-moving{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              marketing teams.
            </span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cases.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="lp-card p-7"
              style={{ borderRadius: "16px" }}
            >
              <div
                className="grid place-items-center rounded-xl"
                style={{
                  background: "var(--lp-gold-tint)",
                  width: 44,
                  height: 44,
                  marginBottom: "20px",
                }}
              >
                <Icon size={20} style={{ color: "var(--lp-gold-deep)" }} />
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                  marginBottom: "8px",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: "14.5px",
                  color: "var(--lp-ink-soft)",
                  lineHeight: 1.6,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 9 — Brand benefits (3x2)
// ─────────────────────────────────────────────────────────────────────────────

function BrandBenefits() {
  const benefits = [
    {
      icon: Zap,
      title: "Faster campaigns",
      body: "Skip booking, scheduling, and reshoots. Generate, approve, ship.",
    },
    {
      icon: ShieldCheck,
      title: "Licensed creator faces",
      body: "Every image uses a verified Indian creator's consented likeness.",
    },
    {
      icon: Layers,
      title: "Lower production effort",
      body: "No location, crew, props, or post-production overhead.",
    },
    {
      icon: Receipt,
      title: "Clear billing",
      body: "GST invoices, transparent credit pricing, no hidden costs.",
    },
    {
      icon: FileCheck2,
      title: "Commercial usage rights",
      body: "Ads, marketplace, social, and landing pages — covered by license.",
    },
    {
      icon: CheckCircle2,
      title: "Creator-safe workflow",
      body: "Creators approve every image before you receive it. No surprises.",
    },
  ];

  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Brand Benefits</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Six reasons brands{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              switch
            </span>{" "}
            to Faiceoff.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {benefits.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="lp-card p-7"
              style={{ borderRadius: "16px" }}
            >
              <div
                className="grid place-items-center rounded-xl"
                style={{
                  background: "var(--lp-paper)",
                  border: "1px solid var(--lp-gold-soft)",
                  width: 44,
                  height: 44,
                  marginBottom: "20px",
                }}
              >
                <Icon size={20} style={{ color: "var(--lp-gold-deep)" }} />
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                  marginBottom: "8px",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: "14.5px",
                  color: "var(--lp-ink-soft)",
                  lineHeight: 1.6,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 10 — Final CTA
// ─────────────────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section
      className="lp-section-pad"
      style={{
        background:
          "linear-gradient(180deg, var(--lp-gold-tint) 0%, var(--lp-paper) 100%)",
      }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>Get Started</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(36px, 5vw, 64px)",
            }}
          >
            Your next campaign does not need a{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--lp-gold-deep)",
              }}
            >
              shoot.
            </span>
          </h2>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup/brand" className="lp-btn-primary">
              Sign Up as a Brand <ArrowRight size={16} />
            </Link>
            <Link href="/pricing" className="lp-btn-secondary">
              See Pricing
            </Link>
          </div>
          <div
            className="mt-6 flex items-center gap-2 justify-center"
            style={{ fontSize: "13px", color: "var(--lp-muted)" }}
          >
            <IndianRupee size={13} style={{ color: "var(--lp-gold-deep)" }} />
            5 free credits on signup. No card required.
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export
// ─────────────────────────────────────────────────────────────────────────────

export default function ForBrandsPage() {
  return (
    <>
      <Hero />
      <TrustChips />
      <SectionDivider />
      <Problem />
      <OneCreatorManyCampaigns />
      <LiveDemoExample />
      <HowItWorks />
      <Comparison />
      <UseCases />
      <BrandBenefits />
      <FinalCTA />
    </>
  );
}
