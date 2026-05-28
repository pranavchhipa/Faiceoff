"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  X,
  IndianRupee,
  Camera,
  Sparkles,
  Clock,
  ArrowUpRight,
  Wallet,
  CheckCircle2,
  Megaphone,
  Tags,
  Inbox,
  Share2,
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
  subcategories: string[];
}

interface CreatorStats {
  pendingApprovals: number;
  walletBalance: number;
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
  collab_session: { id: string; name: string | null } | null;
}

/* ───────── Utilities ───────── */

const ACCENTS = [
  "from-orange-400 to-rose-500",
  "from-sky-500 to-indigo-600",
  "from-amber-400 to-orange-500",
  "from-fuchsia-500 to-pink-600",
  "from-emerald-400 to-teal-500",
];

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
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
  initial: { opacity: 0, y: 16 },
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
  const [hasPackages, setHasPackages] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Creator";
  const firstName = displayName.split(" ")[0];

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [statsRes, earningsRes, approvalsRes, pkgRes, reqRes] = await Promise.allSettled([
        fetch("/api/dashboard/stats", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/earnings/dashboard", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/creator/approvals", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/creator/packages", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/creator/requests", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        ),
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
      if (pkgRes.status === "fulfilled" && pkgRes.value?.packages) {
        setHasPackages((pkgRes.value.packages as unknown[]).length > 0);
      }
      if (reqRes.status === "fulfilled" && reqRes.value?.requests) {
        const pendingReqs = (reqRes.value.requests as { status: string }[]).filter((r) => r.status === "pending");
        setPendingRequestsCount(pendingReqs.length);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isOnboardingComplete = profile?.onboarding_step === "complete";
  const needsOnboarding = profile && !isOnboardingComplete;
  // Only show LIVE if onboarding is complete AND the creator has been activated
  const isLive = isOnboardingComplete && profile?.is_active === true;

  // Suppress collab counts if onboarding not complete — avoids showing
  // stale test / seed data to a creator who hasn't gone live yet.
  const shownActiveCampaigns = isOnboardingComplete ? stats.activeCampaigns : 0;
  const shownTotalCampaigns = isOnboardingComplete ? stats.totalCampaigns : 0;

  const holdingRupees = earnings.holding_paise / 100;
  const photoTarget = 30;
  const photoPct = Math.min(100, Math.round((photoCount / photoTarget) * 100));
  const pendingCount = stats.pendingApprovals || approvals.length;
  const totalPending = pendingCount + pendingRequestsCount;

  if (loading) return <DashboardSkeleton />;

  async function decideApproval(id: string, decision: "approve" | "reject") {
    setApprovals((a) => a.filter((x) => x.id !== id));
    try {
      await fetch(`/api/approvals/${id}/${decision}`, { method: "POST" });
    } catch (err) {
      console.error("approval decision failed", err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">

      {/* ── HEADER ── */}
      <motion.header
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
        className="flex items-start justify-between gap-4"
      >
        <div className="min-w-0">
          <h1 className="font-display text-[36px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] lg:text-[48px]">
            Hi {firstName} —
          </h1>
          <p className="mt-1 font-display text-[18px] font-700 tracking-tight text-[var(--color-primary)] lg:text-[22px]">
            {pendingRequestsCount > 0
              ? `${pendingRequestsCount} brand request${pendingRequestsCount > 1 ? "s" : ""} waiting for you`
              : pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? "approval" : "approvals"} waiting`
              : !isOnboardingComplete
              ? "finish onboarding to go live."
              : !hasPackages
              ? "set up packages to start earning."
              : earnings.lifetime_earned_paise > 0
              ? "all caught up. nice work."
              : "no approvals yet — hang tight."}
          </p>
        </div>
        {isLive ? (
          <span className="mt-2 flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        ) : (
          <span className="mt-2 shrink-0 rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Not live
          </span>
        )}
      </motion.header>

      {/* ── ONBOARDING BANNER ── */}
      {needsOnboarding && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Link
            href="/dashboard/onboarding"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8 p-4 no-underline transition-colors hover:bg-[var(--color-primary)]/12"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                  Finish onboarding to go live
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  Step:{" "}
                  <span className="font-600 text-[var(--color-foreground)]">
                    {profile?.onboarding_step?.replace(/_/g, " ") ?? "photos"}
                  </span>
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[13px] font-700 text-[var(--color-primary)]">
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ── COLLAB REQUESTS BANNER ── */}
      {pendingRequestsCount > 0 && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.04 }}
        >
          <Link
            href="/creator/requests"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-amber-500/8 p-4 no-underline transition-colors hover:bg-amber-500/12"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <Inbox className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-800 text-amber-600">
                  {pendingRequestsCount}
                </span>
              </div>
              <div>
                <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                  {pendingRequestsCount} brand request{pendingRequestsCount > 1 ? "s" : ""} waiting
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  Accept to unlock the collab. Brand pays only after you accept.
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-700 text-amber-600">
              Review <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ── PUBLIC PROFILE CTA — share-link feature, shown when ready ── */}
      {isOnboardingComplete && hasPackages && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.06 }}
        >
          <Link
            href="/creator/profile/setup"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/10 via-[var(--color-primary)]/5 to-transparent p-4 no-underline transition-colors hover:from-emerald-500/15"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-[var(--color-primary)] text-white">
                <Share2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                  Build your Style Previews & share your creator link
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  Pick 4 categories → Style Previews auto-builds → drop the link in your IG bio.
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-700 text-emerald-600">
              Set up <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ── PACKAGES CTA — shown when onboarding done but no packages yet ── */}
      {isOnboardingComplete && !hasPackages && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.07 }}
        >
          <Link
            href="/creator/packages"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8 p-4 no-underline transition-colors hover:bg-[var(--color-primary)]/12"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
                <Tags className="h-4 w-4" />
              </div>
              <div>
                <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                  Set up My Packages to go live
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  Brands can&apos;t request you until you have at least one package active
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-700 text-[var(--color-primary)]">
              Set up <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ── METRIC STRIP ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Available to withdraw — gold */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.07 }}
        >
          <div className="relative overflow-hidden rounded-2xl bg-[var(--color-primary)] p-4 lg:p-5">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
              style={{
                background: "radial-gradient(circle, white, transparent 60%)",
              }}
            />
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary-foreground)]/70">
              Available
            </p>
            <p className="mt-1.5 font-display text-[22px] font-800 leading-none tracking-tight text-[var(--color-primary-foreground)] lg:text-[26px]">
              {formatINR(earnings.available_paise)}
            </p>
            <Link
              href="/creator/withdraw"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary-foreground)] opacity-90 hover:opacity-100"
            >
              Withdraw <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Pending approvals */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div
            className={`rounded-2xl border p-4 lg:p-5 ${
              totalPending > 0
                ? "border-amber-400/40 bg-amber-500/8"
                : "border-[var(--color-border)] bg-[var(--color-card)]"
            }`}
          >
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Pending
            </p>
            <p className="mt-1.5 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {totalPending}
            </p>
            <Link
              href={pendingRequestsCount > 0 ? "/creator/requests" : "/creator/approvals"}
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              Review all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Active collabs */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.13 }}
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:p-5">
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Active collabs
            </p>
            <p className="mt-1.5 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {shownActiveCampaigns}
            </p>
            <Link
              href="/creator/collabs"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Lifetime earned */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.16 }}
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:p-5">
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Lifetime earned
            </p>
            <p className="mt-1.5 font-display text-[22px] font-800 leading-none tracking-tight text-[var(--color-foreground)] lg:text-[24px]">
              {formatINR(earnings.lifetime_earned_paise)}
            </p>
            <Link
              href="/creator/earnings"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              Full history <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ── MAIN 2-COL ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

        {/* LEFT: Approval Queue */}
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.2 }}
        >
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Approval queue
              </p>
              <h2 className="mt-1 font-display text-[22px] font-700 tracking-tight text-[var(--color-foreground)]">
                Brands ask. You decide.
              </h2>
            </div>
            <Link
              href="/creator/approvals"
              className="flex items-center gap-1 text-[12px] font-600 text-[var(--color-primary)] hover:underline"
            >
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {approvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-secondary)]">
                  <CheckCircle2
                    className="h-6 w-6 text-[var(--color-muted-foreground)]"
                    strokeWidth={1.8}
                  />
                </div>
                <p className="font-700 text-[15px] text-[var(--color-foreground)]">
                  Queue empty
                </p>
                <p className="mt-1 max-w-xs text-[13px] text-[var(--color-muted-foreground)]">
                  No pending approvals right now. New requests land here as soon
                  as a brand sends one.
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {approvals.map((a, idx) => {
                  const brandName =
                    a.collab_session?.name ?? a.campaign?.name ?? "Brand";
                  const category =
                    a.generation?.structured_brief?.category ??
                    a.generation?.structured_brief?.title ??
                    "Generation";
                  const accent = ACCENTS[idx % ACCENTS.length];
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-colors hover:border-[var(--color-primary)]/30"
                    >
                      <div className="flex items-center gap-4 p-4">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white`}
                        >
                          <span className="font-display text-[18px] font-800">
                            {brandName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-700 text-[15px] text-[var(--color-foreground)]">
                            {brandName}
                          </p>
                          <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                            {category}
                          </p>
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-600 text-amber-600">
                            <Clock className="h-3 w-3" strokeWidth={2.4} />
                            Expires in {timeUntil(a.expires_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3">
                        <Link
                          href="/creator/approvals"
                          className="flex-1 text-center text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
                        >
                          View image →
                        </Link>
                        <button
                          onClick={() => decideApproval(a.id, "reject")}
                          className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 py-2 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:border-red-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                          Decline
                        </button>
                        <button
                          onClick={() => decideApproval(a.id, "approve")}
                          className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                          Approve
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Active collabs teaser — below queue */}
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]">
                <Megaphone className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div>
                <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                  {shownActiveCampaigns > 0
                    ? `${shownActiveCampaigns} active collab${shownActiveCampaigns > 1 ? "s" : ""}`
                    : "No active collabs yet"}
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  {shownTotalCampaigns} total · {earnings.pending_count} pending payout
                </p>
              </div>
            </div>
            <Link
              href="/creator/collabs"
              className="flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)]"
            >
              View <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.section>

        {/* RIGHT: Sidebar */}
        <motion.aside
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.25 }}
          className="space-y-4"
        >
          {/* Likeness card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                  <Camera className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                  My Likeness
                </p>
              </div>
              {photoCount >= 3 ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-emerald-600">
                  Ready
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-amber-600">
                  Incomplete
                </span>
              )}
            </div>

            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-muted-foreground)]">
                  Reference photos
                </span>
                <span className="font-700 text-[var(--color-foreground)]">
                  {photoCount} / {photoTarget}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
                  style={{ width: `${photoPct}%` }}
                />
              </div>
            </div>

            {categories.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {categories.slice(0, 4).map((cat) => (
                  <span
                    key={cat.category}
                    className="rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-[11px] font-600 capitalize text-[var(--color-foreground)]"
                  >
                    {cat.category}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-[12px] text-[var(--color-muted-foreground)]">
                Add categories during onboarding to start receiving brand requests.
              </p>
            )}

            <Link
              href="/creator/likeness"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] py-2.5 text-[13px] font-600 text-[var(--color-foreground)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Manage likeness <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Earnings breakdown */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                <Wallet className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                Earnings
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--color-muted-foreground)]">
                  Available to withdraw
                </span>
                <span className="font-700 text-[14px] text-[var(--color-foreground)]">
                  {formatINR(earnings.available_paise)}
                </span>
              </div>
              {holdingRupees > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--color-muted-foreground)]">
                    In escrow (clearing)
                  </span>
                  <span className="font-700 text-[14px] text-amber-600">
                    {formatINR(earnings.holding_paise)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="text-[12px] font-700 text-[var(--color-muted-foreground)]">
                  Lifetime total
                </span>
                <span className="font-800 text-[15px] text-[var(--color-foreground)]">
                  {formatINR(earnings.lifetime_earned_paise)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/creator/withdraw"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] py-2.5 text-[12px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
              >
                Withdraw <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/creator/earnings"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] py-2.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]"
              >
                <IndianRupee className="h-3.5 w-3.5" />
                History
              </Link>
            </div>
          </div>

          {/* Quick links strip */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/creator/licenses"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]"
            >
              Licenses
            </Link>
            <Link
              href="/creator/analytics"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]"
            >
              Analytics
            </Link>
          </div>
        </motion.aside>
      </div>

      {/* ── FOOTER ── */}
      <p className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
        <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        Approvals expire 48h after a brand sends them. Missing the window is fine
        — the brand can always resend.
      </p>
    </div>
  );
}

/* ───────── Skeleton ───────── */

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 lg:px-8 lg:py-10">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-[var(--color-secondary)]" />
        <div className="h-12 w-72 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-7 w-56 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[100px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[110px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
            />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-[200px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
          <div className="h-[180px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        </div>
      </div>
    </div>
  );
}
