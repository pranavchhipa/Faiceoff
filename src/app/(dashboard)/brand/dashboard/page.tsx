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
  Clock,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

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
}

interface CollabSession {
  id: string;
  status: string;
  created_at: string;
  max_generations: number | null;
  approved_count?: number | null;
  // From /api/collabs response shape — actual collab name + counterpart
  name?: string | null;
  counterpart_name?: string | null;
  counterpart_avatar_url?: string | null;
  // Product image the brand uploaded at collab-request time (collab_requests
  // table). Shown as the row thumbnail so each collab is visually recognisable.
  product_image_url?: string | null;
  package_tier?: string | null;
  // Legacy / older fallback fields
  brand?: { company_name?: string | null } | null;
  creator?: { display_name?: string | null } | null;
}

interface VaultItem {
  id: string;
  image_url: string | null;
  delivered_at: string | null;
  created_at: string;
  status: string;
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

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Done",
  pending: "Pending",
  draft: "Draft",
  cancelled: "Cancelled",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  completed: "bg-[var(--color-primary)]",
  pending: "bg-amber-500",
  draft: "bg-[var(--color-muted-foreground)]/50",
  cancelled: "bg-red-400",
};

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Page ───────── */

export default function BrandDashboardPage() {
  const { user } = useAuth();

  // ── Cached fetchers — survive unmount/remount across tab switches ──
  // First visit fires the network; every subsequent visit paints from the
  // module-scoped cache instantly + revalidates in the background. The
  // 8s freshness window means "switch away → switch back inside 8 seconds"
  // does ZERO network calls — felt as instant.
  const enabled = !!user;
  const { data: statsData, loading: statsLoading } = useCachedFetch<{
    brand?: BrandProfile;
    stats?: {
      activeCampaigns?: number;
      activeCollabs?: number;
      totalCampaigns?: number;
      totalGenerations?: number;
      walletBalance?: number;
    };
  }>("/api/dashboard/stats", { enabled });

  const { data: collabsData, loading: collabsLoading } = useCachedFetch<
    | CollabSession[]
    | { collabs?: CollabSession[]; sessions?: CollabSession[] }
  >("/api/collabs", { enabled });

  const { data: billingData, loading: billingLoading } = useCachedFetch<{
    wallet_available_paise?: number;
    wallet_balance_paise?: number;
    credits_remaining?: number;
  }>("/api/billing/balance", { enabled });

  const { data: vaultData, loading: vaultLoading } = useCachedFetch<{
    items?: VaultItem[];
  }>("/api/vault?pageSize=4", { enabled });

  // We have data the moment ANY of the cached endpoints comes back. Skeleton
  // only paints when literally nothing is in cache yet (true cold visit).
  const loading =
    statsLoading && collabsLoading && billingLoading && vaultLoading;

  // ── Derive view state from the cached responses ──
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
      walletBalance:
        liveWalletPaise ?? statsData?.stats?.walletBalance ?? 0,
    }),
    [statsData, liveWalletPaise],
  );

  const collabs: CollabSession[] = useMemo(() => {
    if (!collabsData) return [];
    const list: CollabSession[] = Array.isArray(collabsData)
      ? collabsData
      : (collabsData.collabs ?? collabsData.sessions ?? []);
    return list.slice(0, 5);
  }, [collabsData]);

  const vaultItems: VaultItem[] = useMemo(
    () => (vaultData?.items ?? []).slice(0, 4),
    [vaultData],
  );
  const creditsBalance = liveCredits ?? 0;

  const walletPaise = stats.walletBalance;
  const activeCount = stats.activeCollabs ?? stats.activeCampaigns;

  if (loading && !statsData && !collabsData) return <BrandDashboardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">

      {/* ── HEADER ── */}
      <motion.header
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-700 uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <div className="flex items-center gap-2">
            {profile?.is_verified ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Verified
              </span>
            ) : (
              <span className="rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Unverified
              </span>
            )}
          </div>
        </div>

        <div className="mt-3">
          <h1 className="font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] lg:text-[48px]">
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? "collab" : "collabs"} active`
              : stats.totalCampaigns > 0
              ? "All collabs wrapped up."
              : "Discover creators to start."}
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--color-muted-foreground)]">
            Generate, review, and ship licensed AI imagery — all in one place.
          </p>
        </div>
      </motion.header>

      {/* ── METRIC STRIP ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        {/* Wallet balance — gold */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.07, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="relative overflow-hidden rounded-2xl bg-[var(--color-primary)] p-4 lg:p-5">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
              style={{
                background: "radial-gradient(circle, white, transparent 60%)",
              }}
            />
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary-foreground)]/70">
              Wallet
            </p>
            <p className="mt-1.5 font-display text-[22px] font-800 leading-none tracking-tight text-[var(--color-primary-foreground)] lg:text-[26px]">
              {formatINR(walletPaise)}
            </p>
            <Link
              href="/brand/wallet"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary-foreground)] opacity-90 hover:opacity-100"
            >
              Top up <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Active collabs */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div
            className={`rounded-2xl border p-4 lg:p-5 ${
              activeCount > 0
                ? "border-emerald-400/40 bg-emerald-500/8"
                : "border-[var(--color-border)] bg-[var(--color-card)]"
            }`}
          >
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Active collabs
            </p>
            <p className="mt-1.5 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {activeCount}
            </p>
            <Link
              href="/brand/collabs"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Total generations */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.13, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:p-5">
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Generations
            </p>
            <p className="mt-1.5 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {stats.totalGenerations}
            </p>
            <Link
              href="/brand/vault"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              Open vault <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Credits */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.16, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:p-5">
            <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Credits
            </p>
            <p className="mt-1.5 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {creditsBalance.toLocaleString("en-IN")}
            </p>
            <Link
              href="/brand/credits"
              className="mt-3 flex items-center gap-1 text-[11px] font-700 text-[var(--color-primary)]"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ── MAIN 2-COL ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

        {/* LEFT: Recent collabs list */}
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Recent collabs
              </p>
              <h2 className="mt-1 font-display text-[22px] font-700 tracking-tight text-[var(--color-foreground)]">
                Your campaigns at a glance.
              </h2>
            </div>
            <Link
              href="/brand/collabs"
              className="flex items-center gap-1 text-[12px] font-600 text-[var(--color-primary)] hover:underline"
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
                Discover creators to start your first campaign. All your active
                and past collabs will appear here.
              </p>
              <Link
                href="/brand/discover"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <Users className="h-3.5 w-3.5" /> Discover creators
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {collabs.map((collab) => {
                // Use real collab name (e.g. "Rajasthan Royals Jersey") with
                // counterpart creator as subtitle. Fallbacks chain through
                // older response shapes for safety.
                const collabName =
                  collab.name ??
                  collab.creator?.display_name ??
                  "Untitled collab";
                const counterpart =
                  collab.counterpart_name ??
                  collab.creator?.display_name ??
                  null;
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
                    className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:border-[var(--color-primary)]/30 hover:-translate-y-0.5"
                  >
                    {/* Product image thumbnail — falls back to initial pill
                        when collab has no linked product (legacy sessions). */}
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
                        {total > 0 && (
                          <>
                            <span className="text-[var(--color-border)]">·</span>
                            <span className="text-[12px] text-[var(--color-muted-foreground)]">
                              {approved}/{total} approved
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        {relativeFrom(collab.created_at)}
                      </span>
                      {total > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                              style={{
                                width: `${Math.min(100, Math.round((approved / total) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Vault preview teaser */}
          {vaultItems.length > 0 && (
            <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                    <ImageIcon className="h-4 w-4" strokeWidth={2.2} />
                  </div>
                  <p className="font-700 text-[14px] text-[var(--color-foreground)]">
                    Vault preview
                  </p>
                </div>
                <Link
                  href="/brand/vault"
                  className="flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)]"
                >
                  Open <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {vaultItems.map((item) => (
                  <div
                    key={item.id}
                    className="relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]"
                  >
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt=""
                        fill
                        sizes="100px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>

        {/* RIGHT: Sidebar */}
        <motion.aside
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] as const }}
          className="space-y-4"
        >
          {/* Wallet card */}
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
                <span className="text-[12px] text-[var(--color-muted-foreground)]">
                  Available balance
                </span>
                <span className="font-800 text-[16px] text-[var(--color-foreground)]">
                  {formatINR(walletPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="text-[12px] text-[var(--color-muted-foreground)]">
                  Credits remaining
                </span>
                <span className="font-700 text-[14px] text-[var(--color-foreground)]">
                  {creditsBalance.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <Link
                href="/brand/wallet"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] py-2.5 text-[12px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
              >
                Top up <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <p className="mb-4 font-display text-[15px] font-700 text-[var(--color-foreground)]">
              Quick actions
            </p>
            <div className="space-y-2">
              <Link
                href="/brand/discover"
                className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-700 text-[13px] text-[var(--color-foreground)]">
                    Discover creators
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    Find licensed faces for your brief
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
              </Link>

              <Link
                href="/brand/licenses"
                className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-700 text-[13px] text-[var(--color-foreground)]">
                    View licenses
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    Download approved license PDFs
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Quick links strip */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/brand/collabs"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]"
            >
              Collabs
            </Link>
            <Link
              href="/brand/settings"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]"
            >
              Settings
            </Link>
          </div>
        </motion.aside>
      </div>

      {/* ── FOOTER ── */}
      <p className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
        <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>
          <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          All generations are consented, audited, and paid on delivery.
          Credits deducted per generation — unused credits do not expire.
        </span>
      </p>
    </div>
  );
}

/* ───────── Skeleton ───────── */

function BrandDashboardSkeleton() {
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
              className="h-[80px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
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
