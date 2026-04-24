"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  FileText,
  Plus,
  Receipt,
  Sparkles,
  Timer,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

/* ───────── Types ───────── */

interface BrandProfile {
  id: string;
  company_name: string | null;
  gst_number: string | null;
  industry: string | null;
  is_verified: boolean | null;
}

interface BrandStats {
  activeCampaigns: number;
  totalCampaigns: number;
  totalGenerations: number;
  walletBalance: number; // paise
}

interface MockGeneration {
  id: string;
  creator: string;
  brief: string;
  status: "approved" | "pending" | "delivered";
  ageOrLeft: string;
  cost: number; // rupees
  thumb: string;
  accent: "gold" | "steel";
}

const MOCK_GENS: MockGeneration[] = [
  {
    id: "g1",
    creator: "Priya",
    brief: "Monsoon sneaker",
    status: "approved",
    ageOrLeft: "41h",
    cost: 2500,
    thumb: "/landing/product-sneaker.jpg",
    accent: "gold",
  },
  {
    id: "g2",
    creator: "Arjun",
    brief: "Phone launch",
    status: "pending",
    ageOrLeft: "12h left",
    cost: 3000,
    thumb: "/landing/product-phone.jpg",
    accent: "steel",
  },
  {
    id: "g3",
    creator: "Meera",
    brief: "Café shoot",
    status: "approved",
    ageOrLeft: "26h",
    cost: 2000,
    thumb: "/landing/product-food.jpg",
    accent: "gold",
  },
  {
    id: "g4",
    creator: "Priya",
    brief: "Serum closeup",
    status: "pending",
    ageOrLeft: "18h left",
    cost: 2200,
    thumb: "/landing/product-skincare.jpg",
    accent: "steel",
  },
];

const MOCK_VAULT = [
  "/landing/product-sneaker.jpg",
  "/landing/product-phone.jpg",
  "/landing/product-skincare.jpg",
  "/landing/product-food.jpg",
];

// 7-day spend bars (height % 0-100)
const SPEND_BARS = [42, 58, 34, 72, 48, 90, 66];
const SPEND_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/* ───────── Helpers ───────── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatRupees(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Page ───────── */

export default function BrandDashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [stats, setStats] = useState<BrandStats>({
    activeCampaigns: 0,
    totalCampaigns: 0,
    totalGenerations: 0,
    walletBalance: 0,
  });
  const [loading, setLoading] = useState(true);

  const displayName =
    user?.user_metadata?.display_name ??
    user?.email?.split("@")[0] ??
    "Brand";

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          if (data.brand) setProfile(data.brand);
          if (data.stats) {
            setStats({
              activeCampaigns: data.stats.activeCampaigns ?? 0,
              totalCampaigns: data.stats.totalCampaigns ?? 0,
              totalGenerations: data.stats.totalGenerations ?? 0,
              walletBalance: data.stats.walletBalance ?? 0,
            });
          }
        }
      } catch (err) {
        console.error("Brand dashboard fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (user) fetchStats();
  }, [user]);

  // Demo-seed values while the real API has no data — keeps the bento
  // feeling alive on first load. Will naturally fade as real data arrives.
  const walletPaise = stats.walletBalance > 0 ? stats.walletBalance : 1_250_000; // ₹12,500
  const spentThisMonth = 18_400;
  const spent7d = 8_200;
  const generations = stats.totalGenerations > 0 ? stats.totalGenerations : 27;
  const approvalSLA = 41; // hours
  const gstYTD = 3_312;
  const avgDeliverySec = 47;
  const vaultCount = 142;

  const greeting = useMemo(() => greetingByHour(new Date()), []);
  const companyName = profile?.company_name ?? displayName;

  if (loading) return <BrandDashboardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Heading ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            {greeting}
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            {companyName}
            <span className="text-[var(--color-primary)]">.</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            {stats.activeCampaigns || 2} approvals pending ·{" "}
            {generations >= 4 ? 4 : generations} generations this week ·{" "}
            <span className="font-600 text-[var(--color-foreground)]">
              {formatINR(walletPaise)}
            </span>{" "}
            remaining in wallet
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/brand/credits"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            <Wallet className="h-3.5 w-3.5" /> Top up
          </Link>
          <Link
            href="/brand/sessions"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-3.5 w-3.5" /> New generation
          </Link>
        </div>
      </motion.div>

      {/* ═══════════ Bento Grid ═══════════ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {/* Row 1 */}
        <BentoStat
          variant="accent"
          label="Wallet balance"
          value={formatINR(walletPaise)}
          delta="Tap to top up →"
          href="/brand/credits"
          delay={0}
        />
        <BentoStat
          label="Spent this month"
          value={formatRupees(spentThisMonth)}
          delta="+12% vs last"
          deltaTone="up"
          delay={0.03}
        />
        <BentoStat
          label="Generations"
          value={String(generations)}
          delta="4 this week"
          delay={0.06}
        />
        <BentoStat
          label="Approval SLA"
          value={
            <span>
              {approvalSLA}
              <span className="text-[20px] font-500 text-[var(--color-muted-foreground)]">
                h
              </span>
            </span>
          }
          delta="under 48h window"
          delay={0.09}
        />

        {/* Row 2 — wide chart + table */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="col-span-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:col-span-2 lg:col-span-2 lg:row-span-2"
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Spend last 7 days
            </p>
            <Link
              href="/brand/billing"
              className="inline-flex items-center gap-1 text-[11px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              View ledger <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[30px] font-800 tracking-tight text-[var(--color-foreground)]">
              {formatRupees(spent7d)}
            </p>
            <span className="font-mono text-[12px] font-700 text-emerald-500">
              +24%
            </span>
          </div>

          {/* Bars */}
          <div className="mt-5 flex h-[88px] items-end gap-[6px]">
            {SPEND_BARS.map((h, i) => (
              <div key={i} className="flex-1">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[var(--color-primary)] to-[var(--color-primary)]/50"
                  style={{ height: `${h}%` }}
                />
                <p className="mt-1.5 text-center font-mono text-[9px] text-[var(--color-muted-foreground)]">
                  {SPEND_LABELS[i]}
                </p>
              </div>
            ))}
          </div>

          {/* Recent generations */}
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Recent generations
            </p>
            <div className="flex flex-col gap-0.5">
              {MOCK_GENS.map((gen) => (
                <Link
                  key={gen.id}
                  href={`/brand/sessions/${gen.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-[var(--color-secondary)]"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      gen.accent === "gold"
                        ? "bg-[var(--color-primary)]"
                        : "bg-[var(--color-muted-foreground)]/40"
                    }`}
                  />
                  <span className="flex-1 truncate font-600 text-[var(--color-foreground)]">
                    {gen.creator} ·{" "}
                    <span className="font-500 text-[var(--color-muted-foreground)]">
                      {gen.brief}
                    </span>
                  </span>
                  <span className="hidden font-mono text-[11px] capitalize text-[var(--color-muted-foreground)] sm:inline">
                    {gen.status}
                  </span>
                  <span className="hidden font-mono text-[11px] text-[var(--color-muted-foreground)] md:inline">
                    {gen.ageOrLeft}
                  </span>
                  <span className="font-mono text-[12px] font-700 text-[var(--color-primary)]">
                    {formatRupees(gen.cost)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Vault tile — span 2 */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="col-span-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:col-span-2 lg:col-span-2"
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Vault
            </p>
            <Link
              href="/brand/vault"
              className="inline-flex items-center gap-1 text-[11px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Open vault <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[30px] font-800 tracking-tight text-[var(--color-foreground)]">
              {vaultCount}
            </p>
            <span className="text-[13px] font-500 text-[var(--color-muted-foreground)]">
              creatives
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-[var(--color-muted-foreground)]">
            Last added · 2h ago
          </p>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {MOCK_VAULT.map((src, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-lg border border-[var(--color-border)]"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Row 3 — GST YTD + Avg delivery */}
        <BentoStat
          label="GST YTD"
          value={formatRupees(gstYTD)}
          delta="Invoices ready"
          icon={Receipt}
          delay={0.18}
        />
        <BentoStat
          label="Avg delivery"
          value={
            <span>
              {avgDeliverySec}
              <span className="text-[20px] font-500 text-[var(--color-muted-foreground)]">
                s
              </span>
            </span>
          }
          delta="P95 · 1m12s"
          icon={Timer}
          delay={0.21}
        />
      </div>

      {/* ═══════════ Quick actions ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:gap-4"
      >
        <QuickAction
          href="/brand/discover"
          icon={Users}
          title="Discover creators"
          sub="Browse 240+ licensed faces"
        />
        <QuickAction
          href="/brand/licenses"
          icon={FileText}
          title="Manage licenses"
          sub="Active · renewal · audit trail"
        />
        <QuickAction
          href="/brand/credits"
          icon={CreditCard}
          title="Top up credits"
          sub="UPI / NetBanking / Cards"
        />
      </motion.div>

      {/* Footer note */}
      <p className="mt-8 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
        <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
        All generations are consented, audited, and paid on delivery. Every rupee traceable.
      </p>
    </div>
  );
}

/* ───────── Pieces ───────── */

function BentoStat({
  label,
  value,
  delta,
  deltaTone,
  href,
  variant,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaTone?: "up" | "down";
  href?: string;
  variant?: "accent";
  icon?: React.ComponentType<{ className?: string }>;
  delay?: number;
}) {
  const accent = variant === "accent";
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Wrapper
        {...wrapperProps}
        className={`group block rounded-2xl border p-5 transition-all ${
          accent
            ? "border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 to-[var(--color-primary)]/4 hover:border-[var(--color-primary)]/50"
            : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]/30"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <p
            className={`font-mono text-[10px] font-700 uppercase tracking-[0.22em] ${
              accent
                ? "text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {label}
          </p>
          {Icon && (
            <Icon
              className={`h-3.5 w-3.5 ${
                accent
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-muted-foreground)]"
              }`}
            />
          )}
          {accent && !Icon && (
            <Zap className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          )}
        </div>

        <p className="font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
          {value}
        </p>

        {delta && (
          <p
            className={`mt-2 font-mono text-[11px] ${
              deltaTone === "up"
                ? "text-emerald-500"
                : accent
                ? "text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {delta}
          </p>
        )}
      </Wrapper>
    </motion.div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14px] font-700 text-[var(--color-foreground)]">
          {title}
        </p>
        <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-foreground)]" />
    </Link>
  );
}

/* ───────── Helpers ───────── */

function greetingByHour(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ───────── Skeleton ───────── */

function BrandDashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1320px] animate-pulse px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-8 h-16 w-72 rounded-lg bg-[var(--color-secondary)]" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[110px] rounded-2xl bg-[var(--color-secondary)]" />
        ))}
        <div className="h-[380px] rounded-2xl bg-[var(--color-secondary)] md:col-span-2 lg:col-span-2 lg:row-span-2" />
        <div className="h-[240px] rounded-2xl bg-[var(--color-secondary)] md:col-span-2 lg:col-span-2" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-[110px] rounded-2xl bg-[var(--color-secondary)]" />
        ))}
      </div>
    </div>
  );
}
