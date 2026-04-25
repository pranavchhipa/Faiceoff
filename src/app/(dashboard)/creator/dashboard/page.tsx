"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  X,
  IndianRupee,
  Camera,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Clock,
  Wallet,
  ArrowUpRight,
  Fingerprint,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

/* ───────── Types ───────── */

interface CreatorProfile {
  id: string;
  onboarding_step: string | null;
  is_active: boolean;
  instagram_handle: string | null;
  bio: string | null;
  kyc_status: string | null;
}

interface CategoryInfo {
  category: string;
  price_per_generation_paise: number;
  subcategories: string[];
}

interface CreatorStats {
  pendingApprovals: number;
  walletBalance: number; // paise
  totalCampaigns: number;
  activeCampaigns: number;
}

interface EarningsSnapshot {
  available_paise: number;
  holding_paise: number;
  lifetime_earned_paise: number;
  pending_count: number;
}

interface ApprovalRow {
  id: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  generation: {
    id: string;
    image_url: string | null;
    structured_brief: { title?: string; category?: string } | null;
  } | null;
  campaign: { id: string; name: string | null } | null;
}

const ACCENTS = [
  "from-orange-400 to-rose-500",
  "from-red-500 to-rose-600",
  "from-amber-400 to-orange-500",
  "from-fuchsia-500 to-pink-600",
  "from-sky-500 to-indigo-600",
];

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

function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Page ───────── */

export default function CreatorDashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [stats, setStats] = useState<CreatorStats>({
    pendingApprovals: 0,
    walletBalance: 0,
    totalCampaigns: 0,
    activeCampaigns: 0,
  });
  const [earnings, setEarnings] = useState<EarningsSnapshot>({
    available_paise: 0,
    holding_paise: 0,
    lifetime_earned_paise: 0,
    pending_count: 0,
  });
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Creator";
  const firstName = displayName.split(" ")[0];
  const initial = firstName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [statsRes, earningsRes, approvalsRes] = await Promise.allSettled([
        fetch("/api/dashboard/stats", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/earnings/dashboard", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/creator/approvals", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      ]);

      if (cancelled) return;

      if (statsRes.status === "fulfilled" && statsRes.value) {
        const d = statsRes.value;
        if (d.creator) setProfile(d.creator);
        if (d.categories) setCategories(d.categories);
        if (typeof d.photoCount === "number") setPhotoCount(d.photoCount);
        if (d.stats) {
          setStats({
            pendingApprovals: d.stats.pendingApprovals ?? 0,
            walletBalance: d.stats.walletBalance ?? 0,
            totalCampaigns: d.stats.totalCampaigns ?? 0,
            activeCampaigns: d.stats.activeCampaigns ?? 0,
          });
        }
      }
      if (earningsRes.status === "fulfilled" && earningsRes.value) {
        const e = earningsRes.value;
        setEarnings({
          available_paise: e.available_paise ?? 0,
          holding_paise: e.holding_paise ?? 0,
          lifetime_earned_paise: e.lifetime_earned_paise ?? 0,
          pending_count: e.pending_count ?? 0,
        });
      }
      if (approvalsRes.status === "fulfilled" && approvalsRes.value?.approvals) {
        const list = (approvalsRes.value.approvals as ApprovalRow[])
          .filter((a) => a.status === "pending")
          .slice(0, 5);
        setApprovals(list);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const needsOnboarding = profile && profile.onboarding_step !== "complete";
  const kycVerified = profile?.kyc_status === "approved";

  // Real wallet (available payout balance from earnings ledger).
  const walletRupees = earnings.available_paise / 100;
  const lifetimeRupees = earnings.lifetime_earned_paise / 100;
  const holdingRupees = earnings.holding_paise / 100;
  const photoTarget = 30;
  const photoPct = Math.min(100, Math.round((photoCount / photoTarget) * 100));

  const pendingCount = stats.pendingApprovals || approvals.length;

  if (loading) {
    return <DashboardSkeleton />;
  }

  async function decideApproval(id: string, decision: "approve" | "reject") {
    // Optimistic remove
    setApprovals((a) => a.filter((x) => x.id !== id));
    try {
      const path = decision === "approve" ? "approve" : "reject";
      await fetch(`/api/approvals/${id}/${path}`, { method: "POST" });
    } catch (err) {
      console.error("approval decision failed", err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
      {/* ═══════════ Editorial Hero ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-8 overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-card)]"
      >
        <div className="grid lg:grid-cols-[1.4fr_1fr]">
          {/* Left: greeting on a soft gradient — no full-bleed avatar */}
          <div className="relative min-h-[280px] bg-gradient-to-br from-[var(--color-blush)] via-[var(--color-card)] to-[var(--color-lilac)] p-6 lg:p-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-foreground)] text-[var(--color-background)] font-display text-lg font-800 ring-2 ring-[var(--color-card)]">
                {initial}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--color-card)] px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-foreground)] shadow-sm">
                  Creator
                </span>
                {kycVerified && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-emerald-600">
                    <ShieldCheck className="h-3 w-3" strokeWidth={2.4} />
                    KYC verified
                  </span>
                )}
              </div>
            </div>

            <p className="mt-8 text-[11px] font-700 uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1 className="mt-2 font-display text-[32px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] lg:text-[44px]">
              Hi {firstName} —
              <br />
              <span className="text-[var(--color-primary)]">
                {pendingCount > 0
                  ? `${pendingCount} ${pendingCount === 1 ? "approval" : "approvals"} waiting`
                  : "no approvals waiting"}
              </span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-[var(--color-muted-foreground)]">
              {lifetimeRupees > 0 ? (
                <>
                  Lifetime earnings <span className="font-700 text-[var(--color-foreground)]">{formatRupees(lifetimeRupees)}</span>. Every approval unlocks a payout.
                </>
              ) : (
                <>You haven&apos;t received any briefs yet. Complete onboarding and brands will start finding you.</>
              )}
            </p>
          </div>

          {/* Right: gold wallet panel */}
          <div className="relative overflow-hidden bg-[var(--color-primary)] p-6 lg:p-8">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(255,255,255,0.6), transparent 60%)",
              }}
            />
            <div className="relative">
              <div className="mb-6 flex items-center justify-between text-[var(--color-primary-foreground)]">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" strokeWidth={2.4} />
                  <span className="text-[11px] font-700 uppercase tracking-[0.18em]">
                    Available to withdraw
                  </span>
                </div>
                <span className="rounded-full bg-[var(--color-primary-foreground)]/15 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider">
                  Live
                </span>
              </div>
              <div className="text-[var(--color-primary-foreground)]">
                <div className="flex items-baseline gap-1 font-display text-[54px] font-800 leading-none tracking-tight lg:text-[64px]">
                  <IndianRupee className="h-[34px] w-[34px] lg:h-[44px] lg:w-[44px]" strokeWidth={2.6} />
                  <span>{walletRupees.toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs font-600">
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.4} />
                  <span>
                    {holdingRupees > 0
                      ? `${formatRupees(holdingRupees)} clearing escrow`
                      : `Lifetime ${formatRupees(lifetimeRupees)}`}
                  </span>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Link
                  href="/creator/withdraw"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary-foreground)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary)] transition-transform hover:-translate-y-0.5"
                >
                  Withdraw
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.4} />
                </Link>
                <Link
                  href="/creator/earnings"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-primary-foreground)]/30 px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] backdrop-blur transition-colors hover:bg-[var(--color-primary-foreground)]/10"
                >
                  Earnings
                </Link>
              </div>
              <div className="mt-4 rounded-xl bg-[var(--color-primary-foreground)]/10 p-3 text-[var(--color-primary-foreground)]">
                <p className="text-[10px] font-700 uppercase tracking-wider opacity-70">
                  UPI payout
                </p>
                <p className="mt-0.5 text-[12px] font-600">
                  Lands in 30 seconds · no fees
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ═══════════ Onboarding CTA ═══════════ */}
      {needsOnboarding && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-8"
        >
          <Link
            href="/dashboard/onboarding"
            className="group flex flex-col gap-4 rounded-[20px] border border-[var(--color-primary)]/40 bg-gradient-to-br from-[var(--color-primary)]/10 via-[var(--color-card)] to-[var(--color-card)] p-5 no-underline md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-[17px] font-700 text-[var(--color-foreground)]">
                  Finish onboarding to go live
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-muted-foreground)]">
                  Current step:{" "}
                  <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 font-mono text-[11px] font-600 text-[var(--color-foreground)]">
                    {profile?.onboarding_step?.replace(/_/g, " ") ?? "photos"}
                  </span>
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform group-hover:-translate-y-0.5 md:self-auto">
              Continue <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ═══════════ Main two-column ═══════════ */}
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        {/* LEFT: Approval queue */}
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Approval queue
              </p>
              <h2 className="mt-1 font-display text-[22px] font-700 tracking-tight text-[var(--color-foreground)]">
                Brands ask. You decide.
              </h2>
            </div>
            <Link
              href="/creator/approvals"
              className="flex items-center gap-1 text-[13px] font-600 text-[var(--color-primary)] hover:underline"
            >
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {approvals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
                <p className="font-display text-lg font-700 text-[var(--color-foreground)]">
                  Queue empty
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  No pending approvals right now. New briefs land here as soon as a brand submits one.
                </p>
              </div>
            ) : (
              approvals.map((a, idx) => {
                const brandName = a.campaign?.name ?? "Brief";
                const category = a.generation?.structured_brief?.category ?? a.generation?.structured_brief?.title ?? "Generation";
                const accent = ACCENTS[idx % ACCENTS.length];
                return (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25, delay: idx * 0.04 }}
                    className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:border-[var(--color-primary)]/40"
                  >
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white`}
                    >
                      <span className="font-display text-lg font-800">
                        {brandName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-600 text-[15px] text-[var(--color-foreground)]">
                        {brandName}
                      </p>
                      <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                        {category}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-600 text-[var(--color-primary)]">
                        <Clock className="h-3 w-3" strokeWidth={2.4} />
                        Expires in {timeUntil(a.expires_at)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                      <Link
                        href={`/creator/approvals`}
                        className="text-[11px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      >
                        Review →
                      </Link>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => decideApproval(a.id, "reject")}
                          aria-label="Reject"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => decideApproval(a.id, "approve")}
                          aria-label="Approve"
                          className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-[12px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
                        >
                          <Check className="h-4 w-4" strokeWidth={2.4} />
                          Approve
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 sm:hidden">
                      <button
                        onClick={() => decideApproval(a.id, "reject")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => decideApproval(a.id, "approve")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.4} />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.section>

        {/* RIGHT: Likeness + summary */}
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.15 }}
          className="space-y-6"
        >
          {/* Likeness card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                  <Camera className="h-4 w-4" />
                </div>
                <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                  My Likeness
                </p>
              </div>
              {photoCount >= 3 && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-emerald-500">
                  Ready
                </span>
              )}
            </div>
            <div className="mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-muted-foreground)]">Reference photos</span>
                <span className="font-600 text-[var(--color-foreground)]">{photoCount} / {photoTarget}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${photoPct}%` }}
                />
              </div>
            </div>

            {categories.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {categories.slice(0, 3).map((cat) => (
                  <span
                    key={cat.category}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2.5 py-1 text-[11px] font-600"
                  >
                    <span className="capitalize text-[var(--color-foreground)]">{cat.category}</span>
                    <span className="font-mono text-[10px] font-700 text-[var(--color-primary)]">
                      {formatINR(cat.price_per_generation_paise)}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-[12px] text-[var(--color-muted-foreground)]">
                No categories set yet. Add them during onboarding to start receiving briefs.
              </p>
            )}

            <Link
              href="/creator/likeness"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] py-2.5 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Manage likeness <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* This month card (creator tint) */}
          <div
            className="overflow-hidden rounded-2xl border border-[var(--color-border)] p-5"
            style={{ background: "var(--color-blush)" }}
          >
            <p className="mb-1 text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Lifetime
            </p>
            <p className="font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {stats.totalCampaigns} {stats.totalCampaigns === 1 ? "brief" : "briefs"} shipped
            </p>
            <p className="mt-2 text-[12px] text-[var(--color-muted-foreground)]">
              {lifetimeRupees > 0 ? (
                <>You&apos;ve earned <span className="font-700 text-[var(--color-foreground)]">{formatRupees(lifetimeRupees)}</span> after the platform&apos;s 25% fee.</>
              ) : (
                <>Your earnings show here once approvals are paid out.</>
              )}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Active" value={String(stats.activeCampaigns)} />
              <Stat label="Pending" value={String(earnings.pending_count)} />
              <Stat label="Holding" value={holdingRupees > 0 ? formatRupees(holdingRupees) : "—"} />
            </div>
          </div>

          {/* KYC badge card */}
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
              <Fingerprint className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-600 text-[13px] text-[var(--color-foreground)]">
                {kycVerified ? "KYC verified · DPDP consent signed" : "KYC verification pending"}
              </p>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {kycVerified ? "You own every use of your face, always." : "Complete KYC to start earning."}
              </p>
            </div>
            <Link
              href="/creator/settings"
              className="shrink-0 text-[12px] font-600 text-[var(--color-primary)] hover:underline"
            >
              Review
            </Link>
          </div>
        </motion.section>
      </div>

      {/* Footer note */}
      <p className="mt-10 flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
        <Clock className="h-3.5 w-3.5" />
        Approval requests expire 48 hours after brief submission. Missing the window won&apos;t cost you — the brand requests a fresh one.
      </p>
    </div>
  );
}

/* ───────── Helpers ───────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[18px] font-800 text-[var(--color-foreground)]">
        {value}
      </p>
      <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-8 h-[340px] animate-pulse rounded-[28px] bg-[var(--color-secondary)]" />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        </div>
      </div>
    </div>
  );
}
