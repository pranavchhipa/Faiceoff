// ─────────────────────────────────────────────────────────────────────────────
// /for-creators — Marketing page (Light · Editorial · Hybrid Soft Luxe)
//
// Server component. Uses landing-scope tokens (--lp-*) defined in globals.css.
// The only client island is <BrandDemo /> (image-morph + scanline animation).
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Coins,
  Ban,
  CheckCheck,
  Sparkles,
  Lock,
  IndianRupee,
  Receipt,
  Upload,
  Wand2,
  Link2,
  Inbox,
} from "lucide-react";
import { BrandDemo } from "@/components/landing/BrandDemo";
import { CREATOR_PRIYA, WATERMARK_MASK } from "@/components/landing/images";

export const metadata = {
  title: "Earn From Your Face With AI Licensing | Faiceoff for Creators",
  description:
    "Join Faiceoff as a creator. License your face for AI brand campaigns, approve every image, set your price, and earn 75% in INR with full control.",
};

// ── Shared section padding helper ─────────────────────────────────────────────
const SECTION_CLASS = "lp-section-pad px-5";

export default function ForCreatorsPage() {
  return (
    <div className="relative">
      <Hero />
      <HeroStats />
      <GoLiveJourney />
      <CreatorPromise />
      <LiveInbox />
      <HowItWorks />
      <WhyCreators />
      <CreatorControl />
      <FAQ />
      <FinalCTA />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · HERO
   ══════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        paddingTop: "144px",
        paddingBottom: "72px",
      }}
    >
      {/* Soft gold radial */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 1100px 600px at 50% -10%, rgba(201,169,110,0.22), transparent 60%), radial-gradient(ellipse 700px 400px at 0% 50%, rgba(217,111,77,0.06), transparent 65%)",
        }}
      />

      <div className="lp-container relative grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
        {/* Left: copy */}
        <div>
          <span className="lp-pill lp-pill-gold">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--lp-gold-deep)" }}
            />
            For creators · Your face is your IP
          </span>

          <h1
            className="mt-7 text-[clamp(2.4rem,5.6vw,4.5rem)] leading-[1.02]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "var(--lp-ink)",
            }}
          >
            Your face is your{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>
              IP
            </span>
            .
            <br />
            Start{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>
              earning
            </span>{" "}
            from it.
          </h1>

          <p
            className="mt-7 max-w-xl text-base md:text-lg leading-relaxed"
            style={{ color: "var(--lp-ink-soft)" }}
          >
            Faiceoff lets you license your face to brands for AI-generated
            campaign images. You stay in control. You approve every image. You
            get paid when your likeness is used.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row flex-wrap gap-3">
            <Link href="/auth/signup/creator" className="lp-btn-primary">
              Start Earning
              <ArrowRight size={16} />
            </Link>
            <Link href="/for-brands" className="lp-btn-secondary">
              I&apos;m a Brand
            </Link>
          </div>

          <p
            className="mt-9 max-w-xl text-[12.5px] leading-relaxed"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--lp-muted)",
            }}
          >
            No shoots. No chasing brands. No random DMs. No image goes live
            without your approval.
          </p>
        </div>

        {/* Right: editorial portrait card */}
        <div className="relative">
          <HeroPortrait />
        </div>
      </div>
    </section>
  );
}

function HeroPortrait() {
  return (
    <div className="relative">
      {/* Gold-tinted backplate */}
      <div
        aria-hidden
        className="absolute -inset-3 rounded-[24px]"
        style={{
          background: "var(--lp-gold-tint)",
          border: "1px solid var(--lp-gold-soft)",
          transform: "rotate(-1.5deg)",
        }}
      />

      {/* Main portrait card */}
      <div
        className="relative aspect-[4/5] rounded-[20px] overflow-hidden"
        style={{
          background: "var(--lp-paper)",
          border: "1px solid var(--lp-border)",
          boxShadow: "var(--shadow-card-landing)",
        }}
      >
        <Image
          src={CREATOR_PRIYA}
          alt="Priya — verified creator"
          fill
          unoptimized
          sizes="(max-width: 1024px) 90vw, 480px"
          className="object-cover"
          style={WATERMARK_MASK}
          priority
        />

        {/* Verified chip */}
        <div
          className="absolute top-4 left-4 px-3 py-1.5 rounded-full flex items-center gap-2 text-[11px]"
          style={{
            background: "rgba(251,247,238,0.92)",
            border: "1px solid var(--lp-border)",
            color: "var(--lp-ink)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <ShieldCheck size={12} style={{ color: "var(--lp-gold-deep)" }} />
          Verified
        </div>

        {/* Bottom caption */}
        <div
          className="absolute bottom-4 left-4 right-4 p-4 rounded-2xl"
          style={{
            background: "rgba(251,247,238,0.94)",
            border: "1px solid var(--lp-border)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <div
                className="text-base"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                }}
              >
                Priya · Mumbai
              </div>
              <div
                className="text-[10px] mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--lp-muted)",
                }}
              >
                Fashion · Beauty
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="text-[9px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--lp-muted)",
                }}
              >
                Earns
              </div>
              <div
                className="text-base"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--lp-gold-deep)",
                }}
              >
                ₹1,875
              </div>
              <div
                className="text-[9px]"
                style={{ color: "var(--lp-muted)" }}
              >
                per gen · net
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating: approval card */}
      <div
        className="hidden sm:block absolute -left-6 lg:-left-10 top-16 w-64 p-4 rounded-2xl"
        style={{
          background: "var(--lp-paper)",
          border: "1px solid var(--lp-border)",
          boxShadow: "var(--shadow-card-landing)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{
              background: "var(--lp-ink)",
              color: "var(--lp-paper)",
            }}
          >
            <span
              className="text-[10px] tracking-wider"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
              }}
            >
              AC
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-sm truncate"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--lp-ink)",
              }}
            >
              Athleisure Co.
            </div>
            <div
              className="text-[10px] truncate"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--lp-muted)",
              }}
            >
              awaiting approval
            </div>
          </div>
        </div>
        <div
          className="text-xs leading-relaxed truncate"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--lp-muted)",
          }}
        >
          <span style={{ color: "var(--lp-gold-deep)" }}>brief →</span> Priya
          in white sneakers, soft pink…
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div
            className="flex-1 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center gap-1"
            style={{
              background: "var(--lp-ink)",
              color: "var(--lp-paper)",
            }}
          >
            <CheckCheck size={12} /> Approve · ₹1,875
          </div>
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center"
            style={{ border: "1px solid var(--lp-border)" }}
          >
            <span style={{ color: "var(--lp-muted)" }}>×</span>
          </div>
        </div>
      </div>

      {/* Floating: wallet */}
      <div
        className="hidden sm:flex absolute -right-4 lg:-right-6 -bottom-4 items-center gap-3 px-5 py-4 rounded-2xl"
        style={{
          background: "var(--lp-ink)",
          color: "var(--lp-paper)",
          boxShadow: "0 24px 60px -22px rgba(26,20,16,0.45)",
        }}
      >
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(251,247,238,0.10)" }}
        >
          <IndianRupee size={18} strokeWidth={2.5} />
        </div>
        <div>
          <div
            className="text-[10px] opacity-80"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Wallet · this month
          </div>
          <div
            className="text-2xl leading-none mt-0.5"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
            }}
          >
            ₹42,500
          </div>
          <div
            className="text-[10px] opacity-70 mt-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            +₹12,400 this week
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · HERO STATS
   ══════════════════════════════════════════════════════════════════════════ */

function HeroStats() {
  const stats = [
    { v: "75%", l: "Creator earnings" },
    { v: "48h", l: "Approval window" },
    { v: "₹0", l: "Signup fee" },
    { v: "INR", l: "Bank payouts" },
    { v: "You", l: "Control your price" },
  ] as const;

  return (
    <section className="px-5 pb-12 md:pb-16">
      <div className="lp-container">
        <div
          className="rounded-[20px] overflow-hidden"
          style={{
            background: "var(--lp-paper-2)",
            border: "1px solid var(--lp-border)",
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-5">
            {stats.map((s, i) => (
              <div
                key={s.l}
                className="px-6 py-7 text-center md:text-left"
                style={{
                  borderLeft:
                    i > 0 && i < stats.length
                      ? "1px solid var(--lp-border)"
                      : "none",
                  // Mobile: 2-col grid — every 3rd item gets a top border to mimic divide-y
                  // (cleaner than fighting Tailwind divide-* utilities for our token).
                }}
              >
                <div
                  className="leading-none"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
                    letterSpacing: "-0.02em",
                    color: "var(--lp-ink)",
                  }}
                >
                  {s.v}
                </div>
                <div
                  className="mt-2 text-[11px]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--lp-muted)",
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2b · GO LIVE IN 4 STEPS — visual journey
   The "share-a-link → brands reach out" story, told as a flow of four cards.
   Each card maps to one of the actual onboarding steps:
     1. Upload reference photos        (/creator/likeness)
     2. Get your AI likeness           (/creator/profile/setup · Style Previews)
     3. Share your link in your bio    (/creators/<slug>)
     4. Let brands reach out           (/creator/requests · /creator/approvals)
   ══════════════════════════════════════════════════════════════════════════ */

function GoLiveJourney() {
  const steps = [
    {
      n: "01",
      icon: Upload,
      t: "Upload your images",
      d: "Drop a few clean photos. We use them to train your private AI face model — never shared, never reused.",
      preview: (
        <PreviewCard label="Reference photos">
          <div className="grid grid-cols-4 gap-1.5">
            <div className="aspect-square rounded-md" style={{ background: "var(--lp-gold-tint)" }} />
            <div className="aspect-square rounded-md" style={{ background: "var(--lp-paper-2)" }} />
            <div className="aspect-square rounded-md" style={{ background: "var(--lp-gold-tint)" }} />
            <div
              className="aspect-square rounded-md flex items-center justify-center text-[14px]"
              style={{
                background: "var(--lp-paper-2)",
                border: "1px dashed var(--lp-gold-soft)",
                color: "var(--lp-gold-deep)",
              }}
            >
              +
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span
              className="text-[10px]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--lp-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              3 of 30
            </span>
            <span
              className="text-[10px]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--lp-gold-deep)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              KYC verified
            </span>
          </div>
        </PreviewCard>
      ),
    },
    {
      n: "02",
      icon: Wand2,
      t: "Get your AI likeness",
      d: "Pick the categories you want to be discovered in — your Style Previews auto-build with you in each.",
      preview: (
        <PreviewCard label="Style Previews">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="aspect-[4/5] rounded-md" style={{ background: "linear-gradient(135deg, var(--lp-gold-tint), var(--lp-paper-2))" }} />
            <div className="aspect-[4/5] rounded-md" style={{ background: "linear-gradient(135deg, var(--lp-paper-2), var(--lp-gold-tint))" }} />
            <div className="aspect-[4/5] rounded-md" style={{ background: "linear-gradient(225deg, var(--lp-gold-tint), var(--lp-paper-2))" }} />
            <div className="aspect-[4/5] rounded-md" style={{ background: "linear-gradient(45deg, var(--lp-paper-2), var(--lp-gold-tint))" }} />
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {["Fashion", "Beauty", "Travel", "Tech"].map((c) => (
              <span
                key={c}
                className="text-[9px] px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--lp-paper-2)",
                  color: "var(--lp-ink-soft)",
                  border: "1px solid var(--lp-border)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </PreviewCard>
      ),
    },
    {
      n: "03",
      icon: Link2,
      t: "Share it in your bio",
      d: "Drop your faiceoff.com/@handle link in your Instagram bio. One link, your whole licensing setup.",
      preview: (
        <PreviewCard label="Your creator link">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: "var(--lp-paper-2)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <Link2 size={12} style={{ color: "var(--lp-gold-deep)" }} />
            <span
              className="flex-1 text-[12px] truncate"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--lp-ink)",
              }}
            >
              faiceoff.com/@anya
            </span>
            <span
              className="px-2 py-1 rounded text-[9px] font-bold"
              style={{
                fontFamily: "var(--font-mono)",
                background: "var(--lp-ink)",
                color: "var(--lp-paper)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Copy
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full"
              style={{ background: "var(--lp-gold-tint)", border: "1px solid var(--lp-gold-soft)" }}
            />
            <span
              className="text-[10px]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--lp-muted)",
                letterSpacing: "0.10em",
              }}
            >
              @anya · Mumbai · Lifestyle
            </span>
          </div>
        </PreviewCard>
      ),
    },
    {
      n: "04",
      icon: Inbox,
      t: "Let brands reach out",
      d: "Verified brands brief you. You approve every image before it ships. Get paid in INR to your bank.",
      preview: (
        <PreviewCard label="Brand request inbox">
          <div
            className="px-3 py-2.5 rounded-lg"
            style={{
              background: "var(--lp-paper-2)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: "var(--lp-ink)",
                  color: "var(--lp-paper)",
                  fontFamily: "var(--font-display)",
                }}
              >
                AC
              </div>
              <span
                className="text-[11px] truncate"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                }}
              >
                Athleisure Co.
              </span>
              <span
                className="ml-auto text-[9px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--lp-gold-deep)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                ₹1,875
              </span>
            </div>
            <p
              className="text-[10.5px] leading-relaxed truncate"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--lp-muted)",
              }}
            >
              You in white sneakers, soft pink…
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className="flex-1 px-2 py-1 rounded text-[10px] flex items-center justify-center gap-1"
              style={{
                background: "var(--lp-ink)",
                color: "var(--lp-paper)",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
              }}
            >
              <CheckCheck size={10} /> Approve
            </span>
            <span
              className="px-2 py-1 rounded text-[10px]"
              style={{
                border: "1px solid var(--lp-border)",
                color: "var(--lp-muted)",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
              }}
            >
              Skip
            </span>
          </div>
        </PreviewCard>
      ),
    },
  ];

  return (
    <section className={SECTION_CLASS}>
      <div className="lp-container">
        <div className="grid lg:grid-cols-[1fr_1.15fr] gap-12 lg:gap-20 items-start">
          {/* Left: editorial copy + 4 step labels */}
          <div className="lg:sticky lg:top-28">
            <span className="lp-pill lp-pill-gold">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--lp-gold-deep)" }}
              />
              Go live in 4 steps
            </span>

            <h2
              className="mt-6 text-[clamp(2.1rem,4.8vw,3.8rem)] leading-[1.02]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                letterSpacing: "-0.025em",
                color: "var(--lp-ink)",
              }}
            >
              Your next brand shoot starts with{" "}
              <span style={{ fontStyle: "italic", fontWeight: 500 }}>
                a link
              </span>
              .
            </h2>

            <p
              className="mt-6 max-w-md text-base leading-relaxed"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              No studio bookings, no agency middlemen, no DMs to chase. License
              your face once — keep earning every time a brand briefs you.
            </p>

            {/* 4 mini step labels (echoes the journey on the right) */}
            <ul className="mt-9 space-y-5">
              {steps.map((s) => (
                <li key={s.t} className="flex items-start gap-4">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: "var(--lp-paper)",
                      border: "1px solid var(--lp-gold-soft)",
                      color: "var(--lp-gold-deep)",
                    }}
                  >
                    <s.icon size={16} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[15px]"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        color: "var(--lp-ink)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {s.n.replace(/^0/, "")}. {s.t}.
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10">
              <Link href="/auth/signup/creator" className="lp-btn-primary">
                Start the 4 steps
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* Right: 4 step cards in a vertical flow */}
          <div className="relative">
            {/* Vertical connector line behind the cards (decorative) */}
            <div
              aria-hidden
              className="hidden md:block absolute left-[26px] top-12 bottom-12 w-px"
              style={{
                background:
                  "repeating-linear-gradient(180deg, var(--lp-gold-soft) 0 6px, transparent 6px 14px)",
              }}
            />

            <ol className="space-y-6 md:space-y-7">
              {steps.map((s) => (
                <li
                  key={s.n}
                  className="relative grid md:grid-cols-[56px_1fr] gap-4 md:gap-6"
                >
                  {/* Numbered badge */}
                  <div className="flex md:block">
                    <div
                      className="relative h-13 w-13 md:h-14 md:w-14 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: "var(--lp-paper)",
                        border: "1px solid var(--lp-gold-soft)",
                        boxShadow: "0 4px 12px -6px rgba(168,122,42,0.25)",
                      }}
                    >
                      <span
                        className="text-[13px]"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          color: "var(--lp-gold-deep)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {s.n}
                      </span>
                    </div>
                  </div>

                  {/* Card */}
                  <div
                    className="rounded-2xl p-5 md:p-6"
                    style={{
                      background: "var(--lp-paper)",
                      border: "1px solid var(--lp-border)",
                      boxShadow: "var(--shadow-card-landing)",
                    }}
                  >
                    <h3
                      className="text-[18px] md:text-[20px] mb-2 leading-snug"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        color: "var(--lp-ink)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {s.t}
                    </h3>
                    <p
                      className="text-[13.5px] leading-relaxed"
                      style={{ color: "var(--lp-ink-soft)" }}
                    >
                      {s.d}
                    </p>
                    <div className="mt-5">{s.preview}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small framed preview used inside each GoLiveJourney step card. */
function PreviewCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: "var(--lp-paper-2)",
        border: "1px solid var(--lp-border)",
      }}
    >
      <div
        className="text-[9.5px] mb-2.5"
        style={{
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--lp-muted)",
          fontWeight: 600,
        }}
      >
        ▸ {label}
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · CREATOR PROMISE
   ══════════════════════════════════════════════════════════════════════════ */

function CreatorPromise() {
  return (
    <section className={SECTION_CLASS}>
      <div className="lp-container">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center">
          <div>
            <span className="lp-eyebrow">Your guarantee</span>
            <h2
              className="mt-5 text-[clamp(2rem,4.4vw,3.6rem)] leading-[1.04]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--lp-ink)",
              }}
            >
              Your{" "}
              <span style={{ fontStyle: "italic", fontWeight: 500 }}>
                likeness
              </span>
              . Your rules.
            </h2>
          </div>

          <div className="space-y-5">
            <p
              className="text-base md:text-lg leading-relaxed"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              Your face should never be used without your permission. With
              Faiceoff, brands can only generate campaign images through your
              licensed AI model. Every image comes to you for approval before
              it is delivered.
            </p>
            <p
              className="text-lg md:text-xl leading-snug"
              style={{
                color: "var(--lp-ink)",
                fontWeight: 600,
                fontFamily: "var(--font-display)",
              }}
            >
              Approve it — you earn. Reject it — it does not ship.
            </p>

            <div className="pt-3 grid grid-cols-3 gap-3 max-w-md">
              {[
                { icon: Lock, l: "Private model" },
                { icon: ShieldCheck, l: "Per-image approval" },
                { icon: Ban, l: "Block categories" },
              ].map((x) => (
                <div
                  key={x.l}
                  className="flex items-center gap-2 px-3 py-2 rounded-full"
                  style={{
                    background: "var(--lp-paper-2)",
                    border: "1px solid var(--lp-border)",
                  }}
                >
                  <x.icon
                    size={13}
                    style={{ color: "var(--lp-gold-deep)" }}
                  />
                  <span
                    className="text-[11px]"
                    style={{
                      color: "var(--lp-ink-soft)",
                      fontWeight: 500,
                    }}
                  >
                    {x.l}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · LIVE INBOX (BrandDemo)
   ══════════════════════════════════════════════════════════════════════════ */

function LiveInbox() {
  return (
    <section className={SECTION_CLASS}>
      <div className="lp-container">
        <div className="max-w-3xl mb-10 md:mb-14">
          <span className="lp-eyebrow">Live preview</span>
          <h2
            className="mt-4 text-[clamp(1.9rem,4vw,3.4rem)] leading-[1.05]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--lp-ink)",
            }}
          >
            Your brand requests in{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>
              one simple inbox
            </span>
            .
          </h2>
          <p
            className="mt-5 text-base md:text-lg max-w-2xl leading-relaxed"
            style={{ color: "var(--lp-ink-soft)" }}
          >
            See the brand. See the brief. See the image. See the payment. Then
            decide.
          </p>
        </div>

        <BrandDemo />
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · HOW IT WORKS — 8 steps
   ══════════════════════════════════════════════════════════════════════════ */

function HowItWorks() {
  const steps = [
    {
      t: "Sign up",
      d: "Create your Faiceoff creator profile in minutes.",
    },
    {
      t: "Upload reference photos",
      d: "Clear photos so your private AI face profile is set.",
    },
    {
      t: "Give consent",
      d: "You decide how your likeness can be used.",
    },
    {
      t: "Set your price",
      d: "Per-image rate.",
    },
    {
      t: "Block unwanted categories",
      d: "Alcohol, politics, adult, or anything you choose.",
    },
    {
      t: "Get brand requests",
      d: "Inbox of campaign requests from verified brands.",
    },
    {
      t: "Approve or reject",
      d: "Final say on every image, every time.",
    },
    {
      t: "Get paid",
      d: "Wallet credit on approval. Withdraw to bank anytime.",
    },
  ];

  return (
    <section
      className={SECTION_CLASS}
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-12 md:mb-16">
          <span className="lp-eyebrow">How it works</span>
          <h2
            className="mt-4 text-[clamp(1.9rem,4vw,3.4rem)] leading-[1.05]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--lp-ink)",
            }}
          >
            Eight steps from{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>
              signup to payout
            </span>
            .
          </h2>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <li
              key={s.t}
              className="relative p-6 rounded-[18px] flex flex-col"
              style={{
                background: "var(--lp-paper)",
                border: "1px solid var(--lp-border)",
                boxShadow: "var(--shadow-card-landing)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="lp-pill lp-pill-gold"
                  style={{ minWidth: "44px", justifyContent: "center" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="h-px flex-1"
                  style={{ background: "var(--lp-border)" }}
                />
              </div>

              <h3
                className="text-[18px] md:text-[20px] mb-2 leading-snug"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                  letterSpacing: "-0.01em",
                }}
              >
                {s.t}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--lp-ink-soft)" }}
              >
                {s.d}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · WHY CREATORS USE FAICEOFF
   ══════════════════════════════════════════════════════════════════════════ */

function WhyCreators() {
  const cards = [
    {
      icon: Sparkles,
      t: "Earn without shoots",
      d: "AI campaign images use your licensed likeness. No travel, scheduling, or studios.",
    },
    {
      icon: ShieldCheck,
      t: "Protect your image",
      d: "Every image needs your approval. Your face cannot be used freely or secretly.",
    },
    {
      icon: Coins,
      t: "Set your own price",
      d: "You decide your per-image rate. Change it as your demand grows.",
    },
    {
      icon: Ban,
      t: "Say no anytime",
      d: "Reject any image that doesn't match your values, style, or audience.",
    },
    {
      icon: IndianRupee,
      t: "Get paid in INR",
      d: "Approved image = wallet credit. Withdraw to your Indian bank account.",
    },
    {
      icon: Receipt,
      t: "Stay tax-ready",
      d: "Statements, invoices, deductions — all organised.",
    },
  ];

  return (
    <section className={SECTION_CLASS}>
      <div className="lp-container">
        <div className="max-w-3xl mb-12 md:mb-16">
          <span className="lp-eyebrow">Why creators choose us</span>
          <h2
            className="mt-4 text-[clamp(1.9rem,4vw,3.4rem)] leading-[1.05]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--lp-ink)",
            }}
          >
            Built for creators who want{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>
              control and income
            </span>
            .
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((c) => (
            <div
              key={c.t}
              className="p-7 rounded-[18px] flex flex-col"
              style={{
                background: "var(--lp-paper)",
                border: "1px solid var(--lp-border)",
                boxShadow: "var(--shadow-card-landing)",
              }}
            >
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center mb-5"
                style={{
                  background: "var(--lp-gold-tint)",
                  border: "1px solid var(--lp-gold-soft)",
                  color: "var(--lp-gold-deep)",
                }}
              >
                <c.icon size={20} strokeWidth={1.8} />
              </div>
              <h3
                className="text-[19px] mb-2 leading-snug"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                  letterSpacing: "-0.01em",
                }}
              >
                {c.t}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--lp-ink-soft)" }}
              >
                {c.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · CREATOR CONTROL / PITCH
   ══════════════════════════════════════════════════════════════════════════ */

function CreatorControl() {
  return (
    <section className={SECTION_CLASS}>
      <div className="lp-container">
        <div
          className="relative overflow-hidden rounded-[24px] px-7 py-14 md:px-16 md:py-20 text-center"
          style={{
            background:
              "linear-gradient(135deg, var(--lp-gold-tint) 0%, var(--lp-paper) 100%)",
            border: "1px solid var(--lp-gold-soft)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 80% 0%, rgba(201,169,110,0.18), transparent 55%)",
            }}
          />

          <div className="relative max-w-3xl mx-auto">
            <span className="lp-eyebrow">For the long game</span>
            <h2
              className="mt-5 text-[clamp(2rem,4.6vw,3.8rem)] leading-[1.04]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--lp-ink)",
              }}
            >
              You are not just a face.
              <br />
              You are the{" "}
              <span style={{ fontStyle: "italic", fontWeight: 500 }}>
                owner
              </span>
              .
            </h2>
            <p
              className="mt-7 text-base md:text-lg leading-relaxed max-w-2xl mx-auto"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              Faiceoff gives creators a safer way to work with AI. You choose
              your rate. You choose your categories. You approve every image.
              You earn from every approved use.
            </p>

            <div className="mt-9 flex justify-center">
              <Link href="/auth/signup/creator" className="lp-btn-primary">
                Start as a Creator
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · FAQ — native <details> accordion (no client JS needed)
   ══════════════════════════════════════════════════════════════════════════ */

function FAQ() {
  const faqs = [
    {
      q: "Will brands use my real photos?",
      a: "No. Brands generate AI images using your licensed likeness. Original reference photos train your private AI face profile.",
    },
    {
      q: "Can a brand use my face without approval?",
      a: "No. Every image needs your approval before it is delivered.",
    },
    {
      q: "Can I reject a campaign?",
      a: "Yes. You can reject any image or campaign request.",
    },
    {
      q: "Can I block categories?",
      a: "Yes. Block any category you don't want to be associated with.",
    },
    {
      q: "When do I get paid?",
      a: "When you approve the image.",
    },
    {
      q: "Do I need to go for shoots?",
      a: "No. Faiceoff is built for AI-generated campaign images.",
    },
  ];

  return (
    <section
      className={SECTION_CLASS}
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16">
          <div>
            <span className="lp-eyebrow">FAQ</span>
            <h2
              className="mt-4 text-[clamp(1.9rem,4vw,3.2rem)] leading-[1.05]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--lp-ink)",
              }}
            >
              Questions, answered{" "}
              <span style={{ fontStyle: "italic", fontWeight: 500 }}>
                straight
              </span>
              .
            </h2>
            <p
              className="mt-5 text-base leading-relaxed max-w-md"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              Still unsure? Sign up — onboarding is free, and you can leave
              anytime.
            </p>
          </div>

          <div
            className="rounded-[20px] overflow-hidden"
            style={{
              background: "var(--lp-paper)",
              border: "1px solid var(--lp-border)",
            }}
          >
            {faqs.map((f, i) => (
              <details
                key={f.q}
                className="group"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--lp-border)",
                }}
              >
                <summary
                  className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none"
                  style={{ color: "var(--lp-ink)" }}
                >
                  <span
                    className="text-[15.5px] md:text-base"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {f.q}
                  </span>
                  <span
                    className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center transition-transform group-open:rotate-45"
                    style={{
                      border: "1px solid var(--lp-border)",
                      background: "var(--lp-paper-2)",
                      color: "var(--lp-ink)",
                    }}
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <div
                  className="px-6 pb-6 text-[14.5px] leading-relaxed"
                  style={{ color: "var(--lp-ink-soft)" }}
                >
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · FINAL CTA
   ══════════════════════════════════════════════════════════════════════════ */

function FinalCTA() {
  return (
    <section className="relative px-5 py-20 md:py-28 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 1100px 500px at 50% 100%, rgba(201,169,110,0.30), transparent 60%), radial-gradient(ellipse 600px 400px at 0% 0%, rgba(201,169,110,0.08), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--lp-border)" }}
      />

      <div className="lp-container relative text-center">
        <span className="lp-eyebrow">Get started</span>
        <h2
          className="mt-5 text-[clamp(2.2rem,5.4vw,4.4rem)] leading-[1.04] max-w-3xl mx-auto"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "var(--lp-ink)",
          }}
        >
          Your face has{" "}
          <span style={{ fontStyle: "italic", fontWeight: 500 }}>
            value
          </span>
          .
          <br />
          License it safely.
        </h2>

        <p
          className="mt-6 max-w-xl mx-auto text-base md:text-lg leading-relaxed"
          style={{ color: "var(--lp-ink-soft)" }}
        >
          5 free credits when you sign up. No commitment. Withdraw the moment
          your first image is approved.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signup/creator"
            className="lp-btn-primary"
            style={{ padding: "16px 28px", fontSize: "15px" }}
          >
            Start Earning
            <ArrowRight size={17} />
          </Link>
          <Link href="/for-brands" className="lp-btn-secondary">
            I&apos;m a Brand
          </Link>
        </div>

        <p
          className="mt-7 text-[12px]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--lp-muted)",
            letterSpacing: "0.04em",
          }}
        >
          75% creator earnings · 48-hour approval window · INR bank payouts
        </p>
      </div>
    </section>
  );
}
