// ─────────────────────────────────────────────────────────────────────────────
// /pricing — Public pricing marketing page
//
// Light editorial aesthetic. Uses ONLY the `lp-*` token system. No Tailwind
// color utilities. No dark theme. Server component (FAQ uses native <details>).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles as SparklesIcon,
  Zap,
  Star,
  Building2,
  Wallet,
  Coins,
  ChevronDown,
  Gift,
  ShieldCheck,
  Receipt,
  Clock,
} from "lucide-react";

import { WALLET_BONUS_TIERS } from "@/lib/billing/wallet-bonus";

// ─────────────────────────────────────────────────────────────────────────────
export const metadata = {
  title: "Faiceoff Pricing | AI Face Licensing Credits & Creator Wallet",
  description:
    "Simple pricing for AI creator campaigns. Buy credits for AI image generation and use wallet balance to pay creator licensing fees. Start free with 5 credits.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="lp-eyebrow">{children}</div>;
}

function formatBpsAsPercent(bps: number): string {
  if (bps === 0) return "No bonus";
  return `${bps / 100}% bonus`;
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
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>Pricing</Eyebrow>

          <h1
            className="lp-display mt-6"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(40px, 6vw, 76px)",
              lineHeight: 1.04,
            }}
          >
            Simple pricing for{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                color: "var(--lp-gold-deep)",
              }}
            >
              AI creator
            </span>{" "}
            campaigns.
          </h1>

          <p
            className="mt-7 max-w-2xl mx-auto"
            style={{
              color: "var(--lp-ink-soft)",
              fontSize: "18px",
              lineHeight: 1.6,
            }}
          >
            Start free. Buy credits when you need them. Pay creators only when
            their approved likeness is used.
          </p>

          <div
            className="mt-7 max-w-2xl mx-auto"
            style={{
              color: "var(--lp-ink-soft)",
              fontSize: "16px",
              lineHeight: 1.7,
            }}
          >
            Faiceoff pricing has two parts:{" "}
            <strong style={{ color: "var(--lp-ink)" }}>Credits</strong> for AI
            generation.{" "}
            <strong style={{ color: "var(--lp-ink)" }}>Wallet balance</strong>{" "}
            for creator licensing fees. No monthly lock-in. No hidden
            production cost. No confusing usage rights.
          </div>

          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup/brand" className="lp-btn-primary">
              Start Free <ArrowRight size={16} />
            </Link>
            <Link href="#packs" className="lp-btn-secondary">
              See Credit Packs
            </Link>
          </div>

          <div
            className="lp-pill-gold mt-6 mx-auto"
            style={{ width: "fit-content" }}
          >
            <Gift size={11} />
            Get 5 free credits on signup. No card required.
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Credit packs grid
// ─────────────────────────────────────────────────────────────────────────────

interface PackData {
  id: string;
  name: string;
  subline: string;
  price: string;
  credits: string;
  perCredit: string;
  bullets: string[];
  cta: string;
  href: string;
  popular?: boolean;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

const PACKS: PackData[] = [
  {
    id: "spark",
    name: "Spark",
    subline: "Best for trying Faiceoff.",
    price: "₹300",
    credits: "10 credits",
    perCredit: "₹30 / credit, incl. GST",
    bullets: ["12-month validity"],
    cta: "Choose Spark",
    href: "/auth/signup/brand",
    icon: SparklesIcon,
  },
  {
    id: "flow",
    name: "Flow",
    subline: "Best for regular creators and small campaigns.",
    price: "₹1,200",
    credits: "60 credits (includes bonus)",
    perCredit: "₹20 / credit, incl. GST",
    bullets: ["12-month validity"],
    cta: "Choose Flow",
    href: "/auth/signup/brand",
    icon: Zap,
  },
  {
    id: "pro",
    name: "Pro",
    subline: "Best for growing brands.",
    price: "₹4,500",
    credits: "250 credits (includes bonus)",
    perCredit: "₹18 / credit, incl. GST",
    bullets: ["12-month validity"],
    cta: "Choose Pro",
    href: "/auth/signup/brand",
    popular: true,
    icon: Star,
  },
  {
    id: "studio",
    name: "Studio",
    subline: "Best for agencies and high-volume teams.",
    price: "₹12,000",
    credits: "800 credits (includes bonus)",
    perCredit: "₹15 / credit, incl. GST",
    bullets: ["12-month validity", "Priority bulk generation"],
    cta: "Choose Studio",
    href: "/auth/signup/brand",
    icon: Building2,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    subline: "Best for large teams and custom volume.",
    price: "₹50,000",
    credits: "2,800 credits (includes bonus)",
    perCredit: "Priority support",
    bullets: [
      "Dedicated account support",
      "Bulk generation priority",
      "12-month validity",
    ],
    cta: "Talk to Sales",
    href: "/auth/signup/brand",
    icon: Building2,
  },
];

function PackCard({ pack }: { pack: PackData }) {
  const { icon: Icon, popular } = pack;
  return (
    <div
      className="lp-card relative flex flex-col h-full"
      style={{
        padding: popular ? "32px 28px" : "28px 24px",
        borderColor: popular ? "var(--lp-gold)" : "var(--lp-border)",
        borderWidth: popular ? "1.5px" : "1px",
        boxShadow: popular
          ? "0 24px 70px -22px rgba(201,169,110,0.45), 0 1px 0 rgba(26,20,16,0.04)"
          : "var(--shadow-card-landing)",
        transform: popular ? "translateY(-8px)" : undefined,
      }}
    >
      {popular ? (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2"
          style={{
            background: "var(--lp-gold)",
            color: "var(--lp-ink)",
            padding: "5px 14px",
            borderRadius: "999px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Most Popular
        </div>
      ) : null}

      <div
        className="grid place-items-center rounded-xl"
        style={{
          background: popular ? "var(--lp-gold-tint)" : "var(--lp-paper-2)",
          width: 40,
          height: 40,
          marginBottom: "16px",
        }}
      >
        <Icon size={18} style={{ color: "var(--lp-gold-deep)" }} />
      </div>

      <h3
        className="lp-display"
        style={{
          fontSize: "24px",
          fontWeight: 600,
          color: "var(--lp-ink)",
        }}
      >
        {pack.name}
      </h3>
      <p
        className="mt-2"
        style={{
          fontSize: "13.5px",
          color: "var(--lp-ink-soft)",
          minHeight: "40px",
        }}
      >
        {pack.subline}
      </p>

      <div className="mt-5 mb-1 flex items-baseline gap-2">
        <span
          className="lp-display"
          style={{
            fontSize: "40px",
            fontWeight: 600,
            color: "var(--lp-ink)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {pack.price}
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "var(--lp-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          / one-time
        </span>
      </div>

      <div
        className="mt-3"
        style={{ fontSize: "14.5px", color: "var(--lp-ink)", fontWeight: 500 }}
      >
        {pack.credits}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: "12.5px",
          color: "var(--lp-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {pack.perCredit}
      </div>

      <ul
        className="mt-5 flex-1 space-y-2"
        style={{ borderTop: "1px solid var(--lp-border)", paddingTop: "16px" }}
      >
        {pack.bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2"
            style={{ fontSize: "13.5px", color: "var(--lp-ink-soft)" }}
          >
            <CheckCircle2
              size={14}
              style={{
                color: "var(--lp-emerald)",
                flexShrink: 0,
                marginTop: "3px",
              }}
            />
            {b}
          </li>
        ))}
      </ul>

      <Link
        href={pack.href}
        className={popular ? "lp-btn-primary" : "lp-btn-secondary"}
        style={{
          marginTop: "20px",
          width: "100%",
          justifyContent: "center",
          padding: "12px 20px",
          fontSize: "14px",
        }}
      >
        {pack.cta}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function CreditPacks() {
  return (
    <section id="packs" className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Credit Packs</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Pay-as-you-go{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
              }}
            >
              credit packs.
            </span>
          </h2>
          <p
            className="mt-4"
            style={{
              color: "var(--lp-ink-soft)",
              fontSize: "16px",
              maxWidth: "560px",
            }}
          >
            One credit = one AI image generation. All packs valid 12 months.
          </p>
        </div>

        <div
          className="grid gap-5 items-stretch"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {PACKS.map((p) => (
            <PackCard key={p.id} pack={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Pricing explainer (Credits + Wallet)
// ─────────────────────────────────────────────────────────────────────────────

function PricingExplainer() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>How Billing Works</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Credits + Wallet:{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
              }}
            >
              how Faiceoff billing works.
            </span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Credits card */}
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
                background: "var(--lp-gold)",
              }}
            />
            <div className="flex items-center gap-3 mb-5">
              <div
                className="grid place-items-center rounded-xl"
                style={{
                  background: "var(--lp-gold-tint)",
                  width: 44,
                  height: 44,
                }}
              >
                <Coins size={20} style={{ color: "var(--lp-gold-deep)" }} />
              </div>
              <div>
                <div
                  className="lp-mono"
                  style={{
                    fontSize: "10.5px",
                    color: "var(--lp-muted)",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  Layer 1
                </div>
                <h3
                  className="lp-display"
                  style={{
                    fontSize: "26px",
                    color: "var(--lp-ink)",
                    fontWeight: 600,
                  }}
                >
                  Credits
                </h3>
              </div>
            </div>
            <p
              style={{
                fontSize: "15.5px",
                color: "var(--lp-ink-soft)",
                lineHeight: 1.6,
                marginBottom: "20px",
              }}
            >
              Pay for AI image generation. 1 credit = 1 image generation
              request.
            </p>
            <ul className="space-y-3">
              {[
                "Bought upfront",
                "Used when you generate",
                "Valid for 12 months",
                "Non-refundable once purchased",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2"
                  style={{
                    fontSize: "14.5px",
                    color: "var(--lp-ink-soft)",
                  }}
                >
                  <CheckCircle2
                    size={15}
                    style={{
                      color: "var(--lp-gold-deep)",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Wallet card */}
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
            <div className="flex items-center gap-3 mb-5">
              <div
                className="grid place-items-center rounded-xl"
                style={{
                  background: "var(--lp-emerald-soft)",
                  width: 44,
                  height: 44,
                }}
              >
                <Wallet size={20} style={{ color: "var(--lp-emerald)" }} />
              </div>
              <div>
                <div
                  className="lp-mono"
                  style={{
                    fontSize: "10.5px",
                    color: "var(--lp-muted)",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  Layer 2
                </div>
                <h3
                  className="lp-display"
                  style={{
                    fontSize: "26px",
                    color: "var(--lp-ink)",
                    fontWeight: 600,
                  }}
                >
                  Wallet Balance
                </h3>
              </div>
            </div>
            <p
              style={{
                fontSize: "15.5px",
                color: "var(--lp-ink-soft)",
                lineHeight: 1.6,
                marginBottom: "20px",
              }}
            >
              Pays the creator licensing fee.
            </p>
            <ul className="space-y-3">
              {[
                "Depends on creator's rate",
                "Reserved when you request approval",
                "Returned if creator rejects",
                "Released to creator on approval",
                "Wallet balance does not expire",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2"
                  style={{
                    fontSize: "14.5px",
                    color: "var(--lp-ink-soft)",
                  }}
                >
                  <CheckCircle2
                    size={15}
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
// Section 4 — What happens when you generate (5-step flow)
// ─────────────────────────────────────────────────────────────────────────────

function GenerationFlow() {
  const steps = [
    {
      title: "Credit is used",
      body: "One credit deducted on submit.",
    },
    {
      title: "Creator fee is reserved",
      body: "Held from your wallet until approval.",
    },
    {
      title: "Creator reviews",
      body: "Approve or reject.",
    },
    {
      title: "You get the final creative",
      body: "Approved image moves to your Library with usage rights.",
    },
    {
      title: "Creator gets paid",
      body: "Released after approval.",
    },
  ];

  return (
    <section className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>The Generation Flow</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            What happens when you{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
              }}
            >
              generate.
            </span>
          </h2>
        </div>

        <div
          className="grid gap-5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="lp-card p-6 flex flex-col"
              style={{ borderRadius: "16px" }}
            >
              <div
                className="grid place-items-center rounded-full"
                style={{
                  background: "var(--lp-gold)",
                  color: "var(--lp-ink)",
                  width: 36,
                  height: 36,
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  marginBottom: "16px",
                }}
              >
                {i + 1}
              </div>
              <h3
                style={{
                  fontSize: "16.5px",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                  marginBottom: "6px",
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--lp-ink-soft)",
                  lineHeight: 1.55,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Wallet bonus tiers
// ─────────────────────────────────────────────────────────────────────────────

function WalletBonus() {
  return (
    <section
      className="lp-section-pad"
      style={{ background: "var(--lp-paper-2)" }}
    >
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Wallet Bonus</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Add more wallet balance.{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
              }}
            >
              Get more value.
            </span>
          </h2>
          <p
            className="mt-4"
            style={{
              color: "var(--lp-ink-soft)",
              fontSize: "16px",
              lineHeight: 1.7,
            }}
          >
            Wallet top-ups can include bonus balance based on the amount
            added. Use wallet balance to pay creator licensing fees.
          </p>
        </div>

        <div className="lp-card overflow-hidden max-w-3xl">
          <div
            className="grid"
            style={{
              gridTemplateColumns: "1.4fr 1fr",
              background: "var(--lp-paper-2)",
              padding: "16px 24px",
              borderBottom: "1px solid var(--lp-border)",
            }}
          >
            <div
              className="lp-mono"
              style={{
                fontSize: "11px",
                color: "var(--lp-muted)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Wallet Top-up
            </div>
            <div
              className="lp-mono"
              style={{
                fontSize: "11px",
                color: "var(--lp-muted)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
                textAlign: "right",
              }}
            >
              Bonus
            </div>
          </div>
          {WALLET_BONUS_TIERS.map((tier, i) => {
            const isLast = i === WALLET_BONUS_TIERS.length - 1;
            const isHighlight = tier.bonusBps >= 1500;
            return (
              <div
                key={tier.label}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1.4fr 1fr",
                  padding: "18px 24px",
                  borderBottom: isLast ? "none" : "1px solid var(--lp-border)",
                  background: isHighlight
                    ? "var(--lp-gold-tint)"
                    : "transparent",
                }}
              >
                <div
                  style={{
                    fontSize: "15.5px",
                    color: "var(--lp-ink)",
                    fontWeight: 500,
                  }}
                >
                  {tier.label}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontSize: "15.5px",
                    fontWeight: 600,
                    color:
                      tier.bonusBps === 0
                        ? "var(--lp-muted)"
                        : "var(--lp-gold-deep)",
                  }}
                >
                  {formatBpsAsPercent(tier.bonusBps)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — FAQ (native <details> for zero JS)
// ─────────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is a credit?",
    a: "Used to generate one AI image.",
  },
  {
    q: "What is wallet balance?",
    a: "Pays the creator's licensing fee after approval.",
  },
  {
    q: "Do I need both?",
    a: "Yes. Credits create the image. Wallet balance pays the creator.",
  },
  {
    q: "Are credits refundable?",
    a: "No. Credits cover AI generation cost and are bought upfront.",
  },
  {
    q: "What happens if a creator rejects my image?",
    a: "The creator fee returns to your wallet. You don't lose that wallet amount.",
  },
  {
    q: "Do credits expire?",
    a: "Yes. Valid for 12 months from purchase.",
  },
  {
    q: "Does wallet balance expire?",
    a: "No. Stays in your account until used.",
  },
  {
    q: "Are GST invoices available?",
    a: "Yes. Faiceoff generates GST-ready invoices for brand purchases.",
  },
  {
    q: "Is there a subscription?",
    a: "Not currently. Faiceoff is pay-as-you-go.",
  },
];

function FAQ() {
  return (
    <section className="lp-section-pad">
      <div className="lp-container">
        <div className="max-w-3xl mb-12">
          <Eyebrow>Questions</Eyebrow>
          <h2
            className="lp-display mt-5"
            style={{
              color: "var(--lp-ink)",
              fontSize: "clamp(32px, 4.2vw, 52px)",
            }}
          >
            Frequently asked{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
              }}
            >
              questions.
            </span>
          </h2>
        </div>

        <div className="max-w-3xl">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.q}
              className="lp-faq-item"
              style={{
                borderBottom: "1px solid var(--lp-border)",
                padding: "20px 0",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  fontSize: "17px",
                  fontWeight: 600,
                  color: "var(--lp-ink)",
                }}
              >
                <span className="flex items-baseline gap-3">
                  <span
                    className="lp-mono"
                    style={{
                      color: "var(--lp-gold-deep)",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.q}
                </span>
                <ChevronDown
                  size={18}
                  style={{
                    color: "var(--lp-muted)",
                    flexShrink: 0,
                    transition: "transform 0.2s ease",
                  }}
                  className="lp-faq-chevron"
                />
              </summary>
              <div
                className="mt-3 pl-8"
                style={{
                  fontSize: "15.5px",
                  color: "var(--lp-ink-soft)",
                  lineHeight: 1.65,
                }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>

        {/* tiny inline style to rotate chevron when open */}
        <style>{`
          .lp-faq-item summary::-webkit-details-marker { display: none; }
          .lp-faq-item[open] .lp-faq-chevron { transform: rotate(180deg); }
        `}</style>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Final CTA
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
            Start with{" "}
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                color: "var(--lp-gold-deep)",
              }}
            >
              5 free credits.
            </span>
          </h2>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup/brand" className="lp-btn-primary">
              Get Started Free <ArrowRight size={16} />
            </Link>
            <Link href="/auth/signup/brand" className="lp-btn-secondary">
              Buy Pro Pack
            </Link>
          </div>
          <div
            className="mt-7 flex flex-wrap items-center gap-4 justify-center"
            style={{ fontSize: "13px", color: "var(--lp-muted)" }}
          >
            <span className="flex items-center gap-1.5">
              <Receipt size={13} style={{ color: "var(--lp-gold-deep)" }} />
              GST invoices
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} style={{ color: "var(--lp-gold-deep)" }} />
              Commercial usage rights
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} style={{ color: "var(--lp-gold-deep)" }} />
              48-hour creator approval
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export
// ─────────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <>
      <Hero />
      <CreditPacks />
      <PricingExplainer />
      <GenerationFlow />
      <WalletBonus />
      <FAQ />
      <FinalCTA />
    </>
  );
}
