// ─────────────────────────────────────────────────────────────────────────────
// /pricing — Public marketing pricing page (E20)
//
// Server component: fetches live credit pack data via getActivePacks().
// Falls back to static pack stubs if DB is unreachable (marketing page safety).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { getActivePacks } from "@/lib/billing";
import type { CreditPack } from "@/lib/billing";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  CheckCircle,
  Zap,
  Sparkles,
  Star,
  Building2,
  Rocket,
  ChevronDown,
  Gift,
  ArrowRight,
  Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Pricing — Faiceoff",
  description:
    "Simple, transparent credit-based pricing for AI likeness licensing. Buy a pack, start generating. 5 free credits on signup.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback packs (shown if DB unavailable — never leaves users stranded)
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_PACKS: CreditPack[] = [
  {
    id: "fallback-spark",
    code: "spark",
    display_name: "Spark",
    credits: 10,
    bonus_credits: 0,
    price_paise: 99900,
    is_popular: false,
    is_active: true,
    sort_order: 1,
    marketing_tagline: "Perfect for your first campaign",
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-flow",
    code: "flow",
    display_name: "Flow",
    credits: 50,
    bonus_credits: 5,
    price_paise: 449900,
    is_popular: false,
    is_active: true,
    sort_order: 2,
    marketing_tagline: "Scale your creative output",
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-pro",
    code: "pro",
    display_name: "Pro",
    credits: 200,
    bonus_credits: 50,
    price_paise: 1499900,
    is_popular: true,
    is_active: true,
    sort_order: 3,
    marketing_tagline: "Most loved by growing brands",
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-studio",
    code: "studio",
    display_name: "Studio",
    credits: 500,
    bonus_credits: 150,
    price_paise: 3299900,
    is_popular: false,
    is_active: true,
    sort_order: 4,
    marketing_tagline: "For agencies & power users",
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-enterprise",
    code: "enterprise",
    display_name: "Enterprise",
    credits: 2000,
    bonus_credits: 800,
    price_paise: 11999900,
    is_popular: false,
    is_active: true,
    sort_order: 5,
    marketing_tagline: "Unlimited scale, best per-credit rate",
    created_at: "",
    updated_at: "",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN");
}

/** Pick a Lucide icon per pack code */
function packIcon(code: string) {
  switch (code) {
    case "spark":
      return <Zap className="w-5 h-5" />;
    case "flow":
      return <Sparkles className="w-5 h-5" />;
    case "pro":
      return <Star className="w-5 h-5" />;
    case "studio":
      return <Rocket className="w-5 h-5" />;
    case "enterprise":
      return <Building2 className="w-5 h-5" />;
    default:
      return <Sparkles className="w-5 h-5" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet bonus tiers
// ─────────────────────────────────────────────────────────────────────────────

const WALLET_TIERS = [
  { label: "₹500–999", pct: "0%", note: "No bonus" },
  { label: "₹1,000–4,999", pct: "5%", note: "5% bonus" },
  { label: "₹5,000–9,999", pct: "10%", note: "10% bonus" },
  { label: "₹10,000–49,999", pct: "15%", note: "15% bonus" },
  { label: "₹50,000+", pct: "20%", note: "Best rate" },
];

// ─────────────────────────────────────────────────────────────────────────────
// FAQ items
// ─────────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What is a credit vs my wallet ₹?",
    a: "1 credit = 1 generation slot — it covers the AI compute cost of producing one image. Your wallet ₹ pays the creator their licensing fee per image (₹500–₹5,000 depending on creator tier). Both are required to generate.",
  },
  {
    q: "Are credits refundable?",
    a: "No — credits cover the AI compute we pre-paid to Replicate. However, wallet ₹ is fully refunded back to your wallet if a creator rejects your image during the 48-hour approval window.",
  },
  {
    q: "Do credits expire?",
    a: "Yes, credits expire 12 months from the date of purchase. Wallet ₹ never expires — it stays in your wallet until you use it.",
  },
  {
    q: "What about taxes?",
    a: "Prices shown include 18% GST on the platform fee component. Creator earnings have 1% TDS (Tax Deducted at Source) auto-deducted per India regulations. We handle all compliance — no paperwork required from you.",
  },
  {
    q: "Can I pay monthly / subscribe?",
    a: "Not yet. Faiceoff is a pay-as-you-go marketplace — buy credits when you need them. Subscribe to our newsletter to be first in line when subscription plans launch.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PackCard — individual credit pack card
// ─────────────────────────────────────────────────────────────────────────────

function PackCard({ pack }: { pack: CreditPack }) {
  const totalCredits = pack.credits + pack.bonus_credits;
  const pricePerCredit = Math.round(pack.price_paise / totalCredits / 100);
  const isPopular = pack.is_popular;

  return (
    <div
      className={[
        "relative flex flex-col rounded-[var(--radius-card)] border transition-all duration-300",
        "hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1",
        isPopular
          ? "border-primary shadow-[0_0_0_2px_var(--color-primary)] scale-[1.035] bg-surface-container-lowest z-10"
          : "border-outline-variant/20 bg-surface-container-lowest",
      ].join(" ")}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-[var(--radius-pill)] bg-primary text-on-primary text-[10px] font-label font-bold tracking-[0.15em] uppercase shadow-md whitespace-nowrap">
            <Star className="w-3 h-3 fill-current" />
            Most Popular
          </span>
        </div>
      )}

      {/* Card top */}
      <div className="px-6 pt-8 pb-4">
        {/* Icon + pack name */}
        <div className="flex items-center gap-2.5 mb-4">
          <span
            className={[
              "w-9 h-9 rounded-[var(--radius-button)] flex items-center justify-center flex-shrink-0",
              isPopular
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant",
            ].join(" ")}
          >
            {packIcon(pack.code)}
          </span>
          <span className="font-headline font-bold text-xl text-on-surface tracking-tight">
            {pack.display_name}
          </span>
        </div>

        {/* Credit count */}
        <div className="flex items-end gap-2 mb-1">
          <span className="font-display font-extrabold text-5xl leading-none text-on-surface tracking-tight">
            {totalCredits.toLocaleString("en-IN")}
          </span>
          <span className="font-body text-base text-on-surface-variant mb-1">
            credits
          </span>
        </div>
        {pack.bonus_credits > 0 && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-pill)] bg-mint-deep/40 text-[11px] font-label font-bold text-on-surface-variant tracking-wide">
              <Gift className="w-3 h-3" />+{pack.bonus_credits} bonus included
            </span>
          </div>
        )}

        {/* Marketing tagline */}
        {pack.marketing_tagline && (
          <p className="font-body text-sm text-on-surface-variant leading-snug mb-4">
            {pack.marketing_tagline}
          </p>
        )}

        {/* Divider */}
        <div className="h-px bg-outline-variant/15 mb-4" />

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display font-bold text-2xl text-on-surface">
            ₹{formatINR(pack.price_paise)}
          </span>
          <span className="font-body text-xs text-on-surface-variant">one-time</span>
        </div>
        <p className="font-body text-xs text-on-surface-variant">
          ₹{pricePerCredit}/credit &mdash; incl. 18% GST
        </p>
      </div>

      {/* Features list */}
      <div className="px-6 py-4 flex-1">
        <ul className="space-y-2.5">
          <li className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
            {pack.credits.toLocaleString("en-IN")} base + {pack.bonus_credits} bonus credits
          </li>
          <li className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
            Valid for 12 months from purchase
          </li>
          <li className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
            All creator tiers accessible
          </li>
          {pack.code === "enterprise" && (
            <li className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
              <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
              Priority support &amp; dedicated CSM
            </li>
          )}
          {(pack.code === "studio" || pack.code === "enterprise") && (
            <li className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
              <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
              Bulk generation queue priority
            </li>
          )}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-7 pt-2">
        <Link
          href={`/signup/brand?pack=${pack.code}`}
          className={[
            "block w-full text-center py-3 rounded-[var(--radius-button)] font-headline font-bold text-sm transition-all duration-200 no-underline",
            "hover:-translate-y-0.5 hover:shadow-md active:scale-95",
            isPopular
              ? "bg-primary text-on-primary shadow-[0_4px_16px_rgba(106,28,246,0.3)]"
              : "bg-surface-container text-on-surface border border-outline-variant/20 hover:bg-surface-container-high",
          ].join(" ")}
        >
          Choose {pack.display_name}
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WalletTierChip
// ─────────────────────────────────────────────────────────────────────────────

function WalletTierChip({
  label,
  pct,
  note,
  highlighted,
}: {
  label: string;
  pct: string;
  note: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center gap-1.5 px-4 py-3 rounded-[var(--radius-card)] border transition-colors",
        highlighted
          ? "bg-primary/5 border-primary/30"
          : "bg-surface-container-lowest border-outline-variant/15",
      ].join(" ")}
    >
      <span
        className={[
          "font-display font-bold text-xl",
          highlighted ? "text-primary" : "text-on-surface",
        ].join(" ")}
      >
        {pct}
      </span>
      <span className="font-body text-xs text-center text-on-surface-variant leading-tight">
        {label}
      </span>
      <span
        className={[
          "text-[10px] font-label font-bold uppercase tracking-wide",
          highlighted ? "text-primary" : "text-on-surface-variant/60",
        ].join(" ")}
      >
        {note}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FaqItem — uses native <details> for zero-JS accordion
// ─────────────────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-outline-variant/15 last:border-0">
      <summary className="flex items-center justify-between py-5 cursor-pointer list-none select-none">
        <span className="font-headline font-semibold text-base text-on-surface pr-4">
          {q}
        </span>
        <ChevronDown className="w-4 h-4 text-on-surface-variant flex-shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="pb-5 font-body text-sm text-on-surface-variant leading-relaxed">
        {a}
      </p>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page (server component)
// ─────────────────────────────────────────────────────────────────────────────

export default async function PricingPage() {
  // Fetch live packs; fall back to static stubs if DB is not ready
  let allPacks: CreditPack[] = [];
  try {
    allPacks = await getActivePacks();
  } catch {
    allPacks = FALLBACK_PACKS;
  }

  // Exclude free_signup pack — not directly purchasable
  const purchasablePacks = allPacks.filter((p) => p.code !== "free_signup");

  // Use fallback stubs if the DB returned an empty set (e.g. seeding not done)
  const displayPacks =
    purchasablePacks.length > 0 ? purchasablePacks : FALLBACK_PACKS;

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body antialiased">
      {/* ── Background decorative blobs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-primary/4 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-48 w-[500px] h-[500px] bg-secondary/3 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-tertiary/3 rounded-full blur-[80px]" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — Hero
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
        {/* Eyebrow badge */}
        <div className="flex justify-center mb-6">
          <Link
            href="/signup/brand"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-pill)] border border-primary/30 bg-primary/5 text-primary font-label text-xs font-bold tracking-widest uppercase no-underline hover:bg-primary/10 transition-colors"
          >
            <Gift className="w-3.5 h-3.5" />
            5 free credits on signup &mdash; no card required
          </Link>
        </div>

        {/* H1 */}
        <h1 className="font-display font-extrabold text-[2.4rem] sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-on-surface mb-6">
          Simple, transparent pricing
          <br />
          <span className="text-primary">for AI likeness licensing</span>
        </h1>

        {/* Subheading */}
        <p className="font-body text-lg sm:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-8">
          Pay per credit. Each credit = 1 high-quality generation. Bonus credits
          scale automatically with bigger packs — the more you buy, the more you
          get.
        </p>

        {/* CTA block */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup/brand"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-[var(--radius-button)] bg-primary text-on-primary font-headline font-bold text-base hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all duration-200 no-underline shadow-[0_4px_20px_rgba(106,28,246,0.25)]"
          >
            Start free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="font-body text-sm text-on-surface-variant">
            Free 5 credits on signup &bull; No card required
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — Pack grid
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Section label */}
        <div className="text-center mb-12">
          <p className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">
            Credit packs
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-on-surface tracking-tight">
            Pick the pack that fits your scale
          </h2>
        </div>

        {/* Cards grid — 5 columns at lg, 2 at md, 1 at mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-3 items-stretch py-6">
          {displayPacks.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </div>

        {/* Fine print */}
        <p className="text-center font-body text-xs text-on-surface-variant/60 mt-6 flex items-center justify-center gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          All prices include 18% GST on platform fee. Packs are non-refundable.
          Credits valid 12 months from purchase date.
        </p>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — Two-layer billing explainer
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-container-low">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <p className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">
              Two-layer billing
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-on-surface tracking-tight mb-4">
              Credits + Wallet — how it works
            </h2>
            <p className="font-body text-base text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
              Faiceoff uses a two-layer system so creators get paid fairly and
              you keep full control. Credits cover AI compute. Your wallet ₹
              pays the creator.
            </p>
          </div>

          {/* Two columns explanation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
            {/* Credits column */}
            <div className="bg-surface-container-lowest rounded-[var(--radius-card)] border border-outline-variant/15 p-7 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-[var(--radius-button)] bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </span>
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                    Layer 1
                  </p>
                  <h3 className="font-headline font-bold text-lg text-on-surface">
                    Credits
                  </h3>
                </div>
              </div>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-4">
                1 credit = 1 generation. Credits cover the Replicate AI compute
                we pay on your behalf. They are bought in packs upfront and
                deducted per generation request.
              </p>
              <ul className="space-y-2">
                {[
                  "Bought in packs (Spark → Enterprise)",
                  "Deducted at generation time",
                  "Expire after 12 months",
                  "Non-refundable (AI compute is pre-paid)",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm font-body text-on-surface-variant"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Wallet column */}
            <div className="bg-surface-container-lowest rounded-[var(--radius-card)] border border-outline-variant/15 p-7 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-[var(--radius-button)] bg-tertiary/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-tertiary" />
                </span>
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                    Layer 2
                  </p>
                  <h3 className="font-headline font-bold text-lg text-on-surface">
                    Wallet ₹
                  </h3>
                </div>
              </div>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-4">
                Your wallet ₹ pays creator licensing fees (₹500–₹5,000 per
                image depending on the creator's tier). Top-up any amount and
                get bonus ₹ on larger top-ups.
              </p>
              <ul className="space-y-2">
                {[
                  "Top-up any amount (₹500 minimum)",
                  "Reserved at approval request, released on rejection",
                  "Never expires — stays in your wallet",
                  "Up to 20% bonus on larger top-ups",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm font-body text-on-surface-variant"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Wallet bonus tier table */}
          <div>
            <h3 className="font-display font-bold text-xl text-on-surface text-center mb-6 tracking-tight">
              Wallet top-up bonus tiers
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {WALLET_TIERS.map((tier, i) => (
                <WalletTierChip
                  key={tier.label}
                  label={tier.label}
                  pct={tier.pct}
                  note={tier.note}
                  highlighted={i === WALLET_TIERS.length - 1}
                />
              ))}
            </div>
            <p className="text-center font-body text-xs text-on-surface-variant/60 mt-5">
              Bonus credited instantly to your wallet. Bonus ₹ is withdrawable
              after first successful generation.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — How a generation is billed (visual flow)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">
            Per generation billing
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-on-surface tracking-tight">
            What happens when you generate
          </h2>
        </div>

        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-10 left-[calc(16.666%+1rem)] right-[calc(16.666%+1rem)] h-px bg-outline-variant/20" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Credit deducted",
                body: "1 credit is deducted from your balance the moment you submit a generation request. This covers AI compute.",
                color: "bg-primary/8 text-primary border-primary/20",
                dot: "bg-primary",
              },
              {
                step: "02",
                title: "Wallet ₹ reserved",
                body: "The creator's fee is reserved (not yet spent) from your wallet. The creator reviews within 48 hours.",
                color: "bg-tertiary/8 text-tertiary border-tertiary/20",
                dot: "bg-tertiary",
              },
              {
                step: "03",
                title: "Creator paid on approval",
                body: "On approval the reserved ₹ is released to the creator. On rejection, it's returned to your wallet — no loss.",
                color: "bg-secondary/8 text-secondary border-secondary/20",
                dot: "bg-secondary",
              },
            ].map(({ step, title, body, color, dot }) => (
              <div
                key={step}
                className="relative bg-surface-container-lowest rounded-[var(--radius-card)] border border-outline-variant/15 p-7 shadow-[var(--shadow-soft)]"
              >
                {/* Step circle */}
                <div
                  className={`w-10 h-10 rounded-full border flex items-center justify-center mb-5 ${color}`}
                >
                  <span className="font-mono text-xs font-bold">{step}</span>
                </div>
                {/* Dot on connector */}
                <div
                  className={`hidden lg:block absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ${dot} border-2 border-surface`}
                />
                <h3 className="font-headline font-bold text-base text-on-surface mb-2">
                  {title}
                </h3>
                <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — FAQ
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-container-low">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">
              FAQ
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-on-surface tracking-tight">
              Common questions
            </h2>
          </div>
          <div className="bg-surface-container-lowest rounded-[var(--radius-card)] border border-outline-variant/15 shadow-[var(--shadow-soft)] divide-y divide-outline-variant/15 px-6">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 6 — Bottom CTA
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
        <div className="bg-on-surface rounded-[1.5rem] p-10 sm:p-16 relative overflow-hidden shadow-2xl">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/25 to-transparent pointer-events-none" />

          <div className="relative z-10">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-surface-container-lowest leading-tight tracking-tight mb-5">
              Ready to license your first creator?
            </h2>
            <p className="font-body text-base sm:text-lg text-surface-container-low mb-8 max-w-lg mx-auto">
              Start with 5 free credits — no card required. Add your wallet ₹
              and you&apos;re ready to generate.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup/brand"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-[var(--radius-button)] bg-surface-container-lowest text-on-surface font-headline font-extrabold text-base hover:scale-105 active:scale-95 transition-all duration-200 no-underline shadow-xl"
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/signup/brand?pack=pro"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-[var(--radius-button)] bg-primary text-on-primary font-headline font-bold text-base hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all duration-200 no-underline"
              >
                Buy Pro pack
              </Link>
            </div>
            <p className="font-body text-xs text-surface-variant mt-6 opacity-70">
              All purchases secured by Cashfree Payments &bull; DPDP Act
              compliant &bull; GST invoices auto-generated
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
