"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import {
  ArrowRight,
  ArrowUpRight,
  Wallet,
  Layers,
  Sparkles,
  Users,
  ImageIcon,
  CreditCard,
  TrendingUp,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { BrandVerifyBanner } from "@/components/brand/verify-banner";

/* ───────── Types ───────── */

interface BrandProfile {
  id: string;
  company_name: string | null;
  gst_number: string | null;
  industry: string | null;
  is_verified: boolean | null;
  credits_balance_paise?: number | null;
}

interface BrandStats {
  activeCampaigns: number;
  activeCollabs?: number;
  totalCampaigns: number;
  totalGenerations: number;
  walletBalance: number; // paise
  approvalRate?: number | null;
}

interface CollabSession {
  id: string;
  status: string;
  created_at: string;
  max_generations: number | null;
  approved_count?: number | null;
  name?: string | null;
  counterpart_name?: string | null;
  counterpart_avatar_url?: string | null;
  product_image_url?: string | null;
  package_tier?: string | null;
  brand?: { company_name?: string | null } | null;
  creator?: { display_name?: string | null } | null;
}

interface VaultItem {
  id: string;
  image_url: string | null;
  status: string;
  created_at: string;
  creator?: { display_name?: string | null } | null;
  brief?: Record<string, unknown> | null;
}

/* ───────── Utilities ───────── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Done",
  pending: "Pending",
  draft: "Draft",
  cancelled: "Cancelled",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  completed: "bg-[var(--color-primary)]",
  pending: "bg-amber-400",
  draft: "bg-[var(--color-muted-foreground)]/50",
  cancelled: "bg-red-400",
};

/** Vault/generation status → human pill. */
function genStatusPill(status: string): { label: string; cls: string } {
  if (status === "approved")
    return {
      label: "Approved",
      cls: "bg-[var(--color-primary)]/22 text-[var(--color-primary)] border-[var(--color-primary)]/30",
    };
  if (status === "rejected" || status === "failed")
    return {
      label: "Needs fix",
      cls: "bg-red-500/18 text-red-300 border-red-500/30",
    };
  return {
    label: "In review",
    cls: "bg-white/12 text-[var(--color-foreground)]/85 border-white/14",
  };
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Page ───────── */

export default function BrandDashboardPage() {
  const { user } = useAuth();
  const enabled = !!user;

  const { data: statsData, loading: statsLoading } = useCachedFetch<{
    brand?: BrandProfile;
    stats?: {
      activeCampaigns?: number;
      activeCollabs?: number;
      totalCampaigns?: number;
      totalGenerations?: number;
      walletBalance?: number;
      approvalRate?: number | null;
    };
    generationsSeries?: number[];
    approvalBreakdown?: { approved: number; inReview: number; needsFix: number };
  }>("/api/dashboard/stats", { enabled });

  const { data: collabsData, loading: collabsLoading } = useCachedFetch<
    CollabSession[] | { collabs?: CollabSession[]; sessions?: CollabSession[] }
  >("/api/collabs", { enabled });

  const { data: billingData, loading: billingLoading } = useCachedFetch<{
    wallet_available_paise?: number;
    wallet_balance_paise?: number;
    credits_remaining?: number;
  }>("/api/billing/balance", { enabled });

  const { data: vaultData, loading: vaultLoading } = useCachedFetch<{
    items?: VaultItem[];
  }>("/api/vault?pageSize=6", { enabled });

  const loading =
    statsLoading && collabsLoading && billingLoading && vaultLoading;

  const profile: BrandProfile | null = statsData?.brand ?? null;

  const liveWalletPaise: number | null =
    typeof billingData?.wallet_available_paise === "number"
      ? billingData.wallet_available_paise
      : typeof billingData?.wallet_balance_paise === "number"
        ? billingData.wallet_balance_paise
        : null;
  const liveCredits: number | null =
    typeof billingData?.credits_remaining === "number"
      ? billingData.credits_remaining
      : null;

  const stats: BrandStats = useMemo(
    () => ({
      activeCampaigns: statsData?.stats?.activeCampaigns ?? 0,
      activeCollabs: statsData?.stats?.activeCollabs,
      totalCampaigns: statsData?.stats?.totalCampaigns ?? 0,
      totalGenerations: statsData?.stats?.totalGenerations ?? 0,
      walletBalance: liveWalletPaise ?? statsData?.stats?.walletBalance ?? 0,
      approvalRate: statsData?.stats?.approvalRate ?? null,
    }),
    [statsData, liveWalletPaise],
  );

  const series: number[] = useMemo(
    () => statsData?.generationsSeries ?? [],
    [statsData],
  );
  const breakdown = statsData?.approvalBreakdown ?? {
    approved: 0,
    inReview: 0,
    needsFix: 0,
  };

  const collabs: CollabSession[] = useMemo(() => {
    if (!collabsData) return [];
    const list: CollabSession[] = Array.isArray(collabsData)
      ? collabsData
      : (collabsData.collabs ?? collabsData.sessions ?? []);
    return list.slice(0, 5);
  }, [collabsData]);

  const vaultItems: VaultItem[] = useMemo(
    () => (vaultData?.items ?? []).slice(0, 6),
    [vaultData],
  );

  const creditsBalance = liveCredits ?? 0;
  const walletPaise = stats.walletBalance;
  const activeCount = stats.activeCollabs ?? stats.activeCampaigns;
  const company = profile?.company_name?.trim() || "there";

  if (loading && !statsData && !collabsData) return <BrandDashboardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-5 pb-12 lg:px-8">
      {/* ── Verification nudge (hidden once verified) ── */}
      <BrandVerifyBanner />

      {/* ── HEADER ── */}
      <motion.header
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-[12px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-2 font-display text-[30px] font-800 leading-[1.04] tracking-tight text-[var(--color-foreground)] lg:text-[34px]">
            {greeting()},{" "}
            <span className="text-[var(--color-primary)]">{company}</span>
          </h1>
          <p className="mt-2 text-[14px] text-[var(--color-muted-foreground)]">
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? "collab is" : "collabs are"} active — generate, review, and ship.`
              : "Discover creators and start your first licensed campaign."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {profile?.is_verified ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/14 px-3 py-1.5 text-[11px] font-700 uppercase tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Verified brand
            </span>
          ) : (
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-1.5 text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Unverified
            </span>
          )}
          <Link
            href="/brand/discover"
            className="hidden items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5 sm:inline-flex"
          >
            <Plus className="h-4 w-4" /> New collab
          </Link>
        </div>
      </motion.header>

      {/* ── METRIC STRIP ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard delay={0.06} lead>
          <MetricHead icon={<Wallet className="h-[18px] w-[18px]" />} lead />
          <MetricValue>{formatINR(walletPaise)}</MetricValue>
          <MetricLabel>Wallet balance</MetricLabel>
          <Link
            href="/brand/wallet"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)]"
          >
            Top up <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </MetricCard>

        <MetricCard delay={0.09}>
          <MetricHead
            icon={<Users className="h-[18px] w-[18px]" />}
            trend={activeCount > 0 ? `${activeCount} live` : undefined}
          />
          <MetricValue>{activeCount}</MetricValue>
          <MetricLabel>Active collabs</MetricLabel>
          {collabs.length > 0 ? (
            <AvatarStack collabs={collabs} />
          ) : (
            <Link
              href="/brand/collabs"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)]"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </MetricCard>

        <MetricCard delay={0.12}>
          <MetricHead icon={<ImageIcon className="h-[18px] w-[18px]" />} />
          <MetricValue>{stats.totalGenerations}</MetricValue>
          <MetricLabel>Generations · all time</MetricLabel>
          {series.length > 1 && series.some((n) => n > 0) ? (
            <Sparkline data={series} className="mt-3 text-[var(--color-primary)]" />
          ) : (
            <div className="mt-3 h-[30px]" />
          )}
        </MetricCard>

        <MetricCard delay={0.15}>
          <MetricHead icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
          <MetricValue>
            {stats.approvalRate != null ? (
              <>
                {stats.approvalRate}
                <span className="text-[18px] text-[var(--color-muted-foreground)]">
                  %
                </span>
              </>
            ) : (
              "—"
            )}
          </MetricValue>
          <MetricLabel>Creator approval rate</MetricLabel>
          <BreakdownBar breakdown={breakdown} />
        </MetricCard>
      </div>

      {/* ── ACTIVITY CHART + APPROVAL RING ── */}
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 lg:p-6"
        >
          <div className="mb-1 flex items-start justify-between">
            <div>
              <h3 className="font-display text-[17px] font-700 tracking-tight text-[var(--color-foreground)]">
                Generation activity
              </h3>
              <p className="mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
                Images created · last 8 weeks
              </p>
            </div>
            <Link
              href="/brand/vault"
              className="flex items-center gap-1 text-[13px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-primary)]"
            >
              Open vault <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {series.some((n) => n > 0) ? (
            <AreaChart data={series} />
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center text-center">
              <p className="text-[14px] font-600 text-[var(--color-foreground)]">
                No generations yet
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
                Your weekly activity will chart here once you start generating.
              </p>
            </div>
          )}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 lg:p-6"
        >
          <h3 className="font-display text-[17px] font-700 tracking-tight text-[var(--color-foreground)]">
            Approval health
          </h3>
          <p className="mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
            Last 8 weeks of generations
          </p>
          <ApprovalRing
            rate={stats.approvalRate ?? 0}
            breakdown={breakdown}
          />
        </motion.div>
      </div>

      {/* ── RECENT GENERATIONS GALLERY ── */}
      {vaultItems.length > 0 && (
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[18px] font-700 tracking-tight text-[var(--color-foreground)]">
              Recent generations
            </h2>
            <Link
              href="/brand/vault"
              className="flex items-center gap-1 text-[13px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-primary)]"
            >
              Open vault <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {vaultItems.map((item) => (
              <GenTile key={item.id} item={item} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ── RECENT COLLABS + SIDEBAR ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-[18px] font-700 tracking-tight text-[var(--color-foreground)]">
              Recent collabs
            </h2>
            <Link
              href="/brand/collabs"
              className="flex items-center gap-1 text-[13px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-primary)]"
            >
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {collabs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-secondary)]">
                <Layers
                  className="h-6 w-6 text-[var(--color-muted-foreground)]"
                  strokeWidth={1.8}
                />
              </div>
              <p className="font-700 text-[15px] text-[var(--color-foreground)]">
                No collabs yet
              </p>
              <p className="mt-1 max-w-xs text-[13px] text-[var(--color-muted-foreground)]">
                Discover creators to start your first campaign. Active and past
                collabs appear here.
              </p>
              <Link
                href="/brand/discover"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <Users className="h-3.5 w-3.5" /> Discover creators
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {collabs.map((collab) => {
                const collabName =
                  collab.name ?? collab.creator?.display_name ?? "Untitled collab";
                const counterpart =
                  collab.counterpart_name ?? collab.creator?.display_name ?? null;
                const status = collab.status ?? "draft";
                const dotClass =
                  STATUS_DOT[status] ?? "bg-[var(--color-muted-foreground)]/40";
                const statusLabel = STATUS_LABEL[status] ?? status;
                const approved = collab.approved_count ?? 0;
                const total = collab.max_generations ?? 0;

                return (
                  <Link
                    key={collab.id}
                    href={`/brand/collabs/${collab.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]">
                      {collab.product_image_url ? (
                        <Image
                          src={collab.product_image_url}
                          alt={collabName}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-display text-[16px] font-800 text-[var(--color-foreground)]">
                          {collabName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-700 text-[14px] text-[var(--color-foreground)]">
                        {collabName}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
                        />
                        <span className="text-[12px] text-[var(--color-muted-foreground)]">
                          {statusLabel}
                        </span>
                        {counterpart && (
                          <>
                            <span className="text-[var(--color-border)]">·</span>
                            <span className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                              with {counterpart}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">
                        {relativeFrom(collab.created_at)}
                      </span>
                      {total > 0 && (
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                            style={{
                              width: `${Math.min(100, Math.round((approved / total) * 100))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* RIGHT: Sidebar */}
        <motion.aside
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.34, ease: [0.22, 1, 0.36, 1] as const }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                <Wallet className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                Wallet
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-[var(--color-muted-foreground)]">
                  Available balance
                </span>
                <span className="font-display font-800 text-[16px] text-[var(--color-foreground)]">
                  {formatINR(walletPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="text-[12.5px] text-[var(--color-muted-foreground)]">
                  Credits remaining
                </span>
                <span className="font-display font-700 text-[14px] text-[var(--color-foreground)]">
                  {creditsBalance.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <Link
              href="/brand/wallet"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] py-2.5 text-[12.5px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
            >
              Top up wallet <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <p className="mb-4 font-display text-[15px] font-700 text-[var(--color-foreground)]">
              Quick actions
            </p>
            <div className="space-y-2">
              <QuickAction
                href="/brand/discover"
                icon={<Users className="h-4 w-4" />}
                title="Discover creators"
                sub="Find licensed faces for your brief"
              />
              <QuickAction
                href="/brand/licenses"
                icon={<CreditCard className="h-4 w-4" />}
                title="View licenses"
                sub="Download approved license PDFs"
              />
            </div>
          </div>

          <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-[var(--color-muted-foreground)]">
            <Sparkles
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]"
              strokeWidth={2}
            />
            <span>
              Every generation is consented, audited, and paid on delivery.
              Unused credits never expire.
            </span>
          </p>
        </motion.aside>
      </div>
    </div>
  );
}

/* ───────── Metric card primitives ───────── */

function MetricCard({
  children,
  delay,
  lead,
}: {
  children: React.ReactNode;
  delay: number;
  lead?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const }}
      className={`rounded-2xl border p-4 lg:p-5 ${
        lead
          ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.06]"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      {children}
    </motion.div>
  );
}

function MetricHead({
  icon,
  trend,
  lead,
}: {
  icon: React.ReactNode;
  trend?: string;
  lead?: boolean;
}) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          lead
            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
            : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
        }`}
      >
        {icon}
      </div>
      {trend && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/12 px-2 py-1 font-display text-[11px] font-700 text-[var(--color-primary)]">
          <TrendingUp className="h-3 w-3" /> {trend}
        </span>
      )}
    </div>
  );
}

function MetricValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
      {children}
    </p>
  );
}

function MetricLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[12.5px] text-[var(--color-muted-foreground)]">
      {children}
    </p>
  );
}

function AvatarStack({ collabs }: { collabs: CollabSession[] }) {
  const tints = [
    "from-[#E8C98E] to-[#C9A96E]",
    "from-[#9FB7D8] to-[#6E89B0]",
    "from-[#C8A6D6] to-[#9A6FB0]",
    "from-[#A6D6BC] to-[#6FB08C]",
  ];
  const shown = collabs.slice(0, 4);
  const extra = Math.max(0, collabs.length - shown.length);
  return (
    <div className="mt-3.5 flex">
      {shown.map((c, i) => {
        const label = (c.counterpart_name ?? c.name ?? "?")
          .charAt(0)
          .toUpperCase();
        return (
          <span
            key={c.id}
            className={`-ml-2 grid h-7 w-7 place-items-center rounded-lg border-2 border-[var(--color-card)] bg-gradient-to-br ${tints[i % tints.length]} text-[10.5px] font-700 text-[#16140c] first:ml-0`}
          >
            {label}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="-ml-2 grid h-7 w-7 place-items-center rounded-lg border-2 border-[var(--color-card)] bg-[var(--color-secondary)] text-[10.5px] font-700 text-[var(--color-muted-foreground)]">
          +{extra}
        </span>
      )}
    </div>
  );
}

function BreakdownBar({
  breakdown,
}: {
  breakdown: { approved: number; inReview: number; needsFix: number };
}) {
  const total =
    breakdown.approved + breakdown.inReview + breakdown.needsFix || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="mt-3.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
      <span
        className="bg-[var(--color-primary)]"
        style={{ width: seg(breakdown.approved) }}
      />
      <span
        className="bg-[var(--color-primary)]/35"
        style={{ width: seg(breakdown.inReview) }}
      />
      <span className="bg-red-400/70" style={{ width: seg(breakdown.needsFix) }} />
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-700 text-[13px] text-[var(--color-foreground)]">
          {title}
        </p>
        <p className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ───────── Generation tile ───────── */

function GenTile({ item }: { item: VaultItem }) {
  const pill = genStatusPill(item.status);
  const creatorName = item.creator?.display_name?.trim() || null;
  const productName =
    (item.brief && typeof item.brief.product_name === "string"
      ? (item.brief.product_name as string)
      : null) || null;

  return (
    <Link
      href="/brand/vault"
      className="group relative block aspect-[3/3.7] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] transition-all hover:-translate-y-1 hover:border-[var(--color-primary)]/40"
    >
      {item.image_url ? (
        <Image
          src={item.image_url}
          alt={productName ?? "Generation"}
          fill
          sizes="200px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-6 w-6 text-[var(--color-muted-foreground)]/50" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/82 via-black/10 to-transparent" />
      <span
        className={`absolute left-2 top-2 inline-flex items-center rounded-full border px-2 py-0.5 font-display text-[10.5px] font-700 backdrop-blur ${pill.cls}`}
      >
        {pill.label}
      </span>
      {(creatorName || productName) && (
        <div className="absolute inset-x-2.5 bottom-2.5">
          {creatorName && (
            <p className="flex items-center gap-1 font-display text-[12.5px] font-700 text-white">
              <span className="truncate">{creatorName}</span>
              <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--color-primary)]" />
            </p>
          )}
          {productName && (
            <p className="truncate text-[10.5px] text-white/65">{productName}</p>
          )}
        </div>
      )}
    </Link>
  );
}

/* ───────── Data-viz primitives (hand-built SVG, theme via currentColor) ───────── */

function Sparkline({
  data,
  className = "",
}: {
  data: number[];
  className?: string;
}) {
  const W = 200;
  const H = 30;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) =>
    pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  let d = `M${x(0)} ${y(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    d += ` C${xc} ${y(data[i - 1])} ${xc} ${y(data[i])} ${x(i)} ${y(data[i])}`;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`block h-[30px] w-full ${className}`}
    >
      <path
        d={`${d} L${W} ${H} L0 ${H} Z`}
        fill="currentColor"
        opacity={0.13}
      />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.6} fill="currentColor" />
    </svg>
  );
}

function AreaChart({ data }: { data: number[] }) {
  const W = 720;
  const H = 230;
  const L = 30;
  const R = 10;
  const T = 14;
  const B = 24;
  const max = Math.max(...data, 1);
  const x = (i: number) => L + (i / (data.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  let line = `M${x(0)} ${y(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    line += ` C${xc} ${y(data[i - 1])} ${xc} ${y(data[i])} ${x(i)} ${y(data[i])}`;
  }
  const area = `${line} L${x(data.length - 1)} ${H - B} L${x(0)} ${H - B} Z`;
  const peak = data.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="mt-4 block w-full overflow-visible text-[var(--color-primary)]"
    >
      {[0, max / 2, max].map((g, i) => (
        <line
          key={i}
          x1={L}
          y1={y(g)}
          x2={W - R}
          y2={y(g)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
      ))}
      <path d={area} fill="currentColor" opacity={0.14} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={i === peak ? 4.5 : 2.6}
          fill={i === peak ? "currentColor" : "var(--color-card)"}
          stroke="currentColor"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

function ApprovalRing({
  rate,
  breakdown,
}: {
  rate: number;
  breakdown: { approved: number; inReview: number; needsFix: number };
}) {
  const r = 56;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.max(0, Math.min(100, rate)) / 100);
  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="relative h-[136px] w-[136px]">
        <svg width="136" height="136" viewBox="0 0 136 136">
          <circle
            cx="68"
            cy="68"
            r={r}
            fill="none"
            className="text-[var(--color-foreground)]"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={12}
          />
          <circle
            cx="68"
            cy="68"
            r={r}
            fill="none"
            className="text-[var(--color-primary)]"
            stroke="currentColor"
            strokeWidth={12}
            strokeLinecap="round"
            transform="rotate(-90 68 68)"
            strokeDasharray={C}
            strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.3,.9,.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <b className="font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {rate}%
          </b>
          <small className="mt-1 text-[10.5px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Approved
          </small>
        </div>
      </div>
      <div className="mt-5 w-full space-y-2.5">
        <RingLegend
          color="bg-[var(--color-primary)]"
          label="Approved"
          value={breakdown.approved}
        />
        <RingLegend
          color="bg-[var(--color-primary)]/35"
          label="In review"
          value={breakdown.inReview}
        />
        <RingLegend
          color="bg-red-400/70"
          label="Needs fix"
          value={breakdown.needsFix}
        />
      </div>
    </div>
  );
}

function RingLegend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${color}`} />
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <b className="ml-auto font-display font-700 text-[var(--color-foreground)]">
        {value}
      </b>
    </div>
  );
}

/* ───────── Skeleton ───────── */

function BrandDashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 lg:px-8 lg:py-10">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-[var(--color-secondary)]" />
        <div className="h-10 w-80 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-5 w-64 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[140px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <div className="h-[280px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-[280px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="aspect-[3/3.7] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
          />
        ))}
      </div>
    </div>
  );
}
