"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Wand2,
  ImageIcon,
  Info,
  Loader2,
  CheckCircle2,
  Zap,
  Clock,
  Download,
  ChevronRight,
  Sparkles,
  AtSign,
  Activity,
  Globe,
  Image as ImageIconSm,
  FileCheck2,
  Receipt,
} from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";

interface Session {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  brand_id: string;
  creator_id: string;
  package_tier: string | null;
  package_price_paise: number | null;
  final_images_target: number | null;
  approved_count: number;
  gen_credits_total: number | null;
  gen_credits_used: number;
  usage_scope: string | null;
  license_expires_at: string | null;
  collab_request_id: string | null;
}

interface Generation {
  id: string;
  status: string;
  image_url: string | null;
  cost_paise: number | null;
  created_at: string;
  structured_brief: Record<string, unknown> | null;
}

interface Creator {
  name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

interface BrandSummary {
  company_name: string | null;
}

interface RequestSnapshot {
  product_image_url: string | null;
  brief_one_liner: string | null;
}

interface LicenseRow {
  id: string;
  generation_id: string;
  scope: string;
  issued_at: string;
  expires_at: string;
  status: string;
  cert_url: string | null;
  amount_paid_paise: number;
  creator_share_paise: number;
}

interface CollabData {
  session: Session;
  role: "brand" | "creator";
  conversation_id: string | null;
  generations: Generation[];
  creator: Creator;
  brand: BrandSummary;
  request: RequestSnapshot | null;
  licenses: LicenseRow[];
}

type Tab = "studio" | "vault" | "chat" | "details";

const TIER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; bar: string; chipBg: string; chipText: string }> = {
  frame:   { label: "Frame",   icon: ImageIconSm, bar: "bg-sky-500",                chipBg: "bg-sky-500",                chipText: "text-white" },
  feature: { label: "Feature", icon: Zap,         bar: "bg-[var(--color-primary)]", chipBg: "bg-[var(--color-primary)]", chipText: "text-[var(--color-primary-foreground)]" },
  cover:   { label: "Cover",   icon: Globe,       bar: "bg-violet-500",             chipBg: "bg-violet-500",             chipText: "text-white" },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600",            bg: "bg-emerald-500/10",            dot: "bg-emerald-500", icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", dot: "bg-[var(--color-primary)]", icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600",             bg: "bg-yellow-500/10",             dot: "bg-yellow-500", icon: Clock },
};

const USAGE_LABELS: Record<string, string> = {
  social_organic: "Organic social",
  social_paid:    "Paid social",
  digital_full:   "Full digital",
};

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(paise / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const VAULT_STATUSES = new Set(["approved"]);
// Brand needs to act (Send / Retry / Discard) only on ready_for_brand_review.
const BRAND_PENDING_STATUSES = new Set(["ready_for_brand_review"]);
// Awaiting creator decision — informational for brand, no action needed.
const CREATOR_PENDING_STATUSES = new Set(["ready_for_approval"]);

export default function BrandCollabWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CollabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("studio");

  useEffect(() => {
    fetch(`/api/collabs/${id}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-[var(--color-muted-foreground)]">Collab not found.</p>
        <Link href="/brand/collabs" className="mt-4 block text-sm text-[var(--color-primary)]">Back to collabs</Link>
      </div>
    );
  }

  const { session, conversation_id, generations, creator, request, licenses } = data;
  const tier = session.package_tier ? TIER_META[session.package_tier] ?? TIER_META.frame : TIER_META.frame;
  const TierIcon = tier.icon;
  const statusMeta = STATUS_META[session.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;

  const creditsLeft = session.gen_credits_total != null
    ? session.gen_credits_total - session.gen_credits_used
    : null;
  const approved = session.approved_count;
  const targetImages = session.final_images_target ?? 0;
  const progress = targetImages > 0 ? Math.round((approved / targetImages) * 100) : 0;

  const vaultGens   = generations.filter((g) => VAULT_STATUSES.has(g.status));
  const brandPending   = generations.filter((g) => BRAND_PENDING_STATUSES.has(g.status)).length;
  const creatorPending = generations.filter((g) => CREATOR_PENDING_STATUSES.has(g.status)).length;
  const pendingGens    = brandPending + creatorPending; // total for stat tile only

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: "studio", label: "Studio", icon: Wand2 },
    { id: "vault",  label: "Vault", icon: ImageIcon, badge: vaultGens.length },
    { id: "chat",   label: "Chat", icon: MessageSquare },
    { id: "details", label: "Details", icon: Info },
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">

      {/* Back link */}
      <Link
        href="/brand/collabs"
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All collabs
      </Link>

      {/* ── Hero card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      >
        <div className={`h-[3px] w-full ${tier.bar}`} />

        <div className="flex flex-col gap-0 sm:flex-row">
          {/* Product image */}
          <div className="relative aspect-[16/10] w-full shrink-0 sm:aspect-[4/5] sm:w-[260px]">
            {request?.product_image_url ? (
              <Image
                src={request.product_image_url}
                alt={session.name}
                fill
                sizes="260px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--color-secondary)]">
                <ImageIcon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
              </div>
            )}

            {/* Tier chip overlay */}
            <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] ${tier.chipBg} ${tier.chipText}`}>
              <TierIcon className="h-3 w-3" />
              {tier.label}
            </span>

            {/* Status chip overlay (top right) */}
            <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-700 text-white backdrop-blur-md`}>
              <span className={`relative flex h-1.5 w-1.5`}>
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusMeta.dot} opacity-60`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
              </span>
              {statusMeta.label}
            </span>
          </div>

          {/* Right: details */}
          <div className="flex flex-1 flex-col justify-between gap-5 p-5 sm:p-6">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Collab workspace
              </p>
              <h1 className="mt-1 font-display text-[26px] font-800 leading-[1.1] tracking-tight text-[var(--color-foreground)] sm:text-[30px]">
                {session.name}
              </h1>

              <div className="mt-3 flex items-center gap-2.5">
                {creator.avatar_url ? (
                  <Image
                    src={creator.avatar_url}
                    alt={creator.name ?? "Creator"}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[12px] font-700 text-[var(--color-foreground)] ring-2 ring-[var(--color-border)]">
                    {(creator.name ?? "C").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-700 text-[var(--color-foreground)]">
                    with {creator.name ?? "Creator"}
                  </p>
                  {creator.handle && (
                    <p className="flex items-center gap-0.5 truncate text-[11px] text-[var(--color-muted-foreground)]">
                      <AtSign className="h-2.5 w-2.5" />
                      {creator.handle.replace(/^@/, "")}
                    </p>
                  )}
                </div>
              </div>

              {request?.brief_one_liner && (
                <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                  &ldquo;{request.brief_one_liner}&rdquo;
                </p>
              )}
            </div>

            {/* Progress strip */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                  Progress
                </span>
                <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  {approved}/{targetImages} approved
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className={`absolute inset-y-0 left-0 rounded-full ${tier.bar}`}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Stats row (4 metrics) ──
          Single-pool model: actual credit balance lives in topbar (brands.credits_remaining).
          Workspace stats track per-collab progress only. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={Zap}
          label="Iterations left"
          value={creditsLeft != null ? creditsLeft.toString() : "—"}
          sub={creditsLeft != null && session.gen_credits_total != null ? `of ${session.gen_credits_total}` : undefined}
          tone="primary"
        />
        <Stat
          icon={Sparkles}
          label="Generated"
          value={session.gen_credits_used.toString()}
          sub="in this collab"
          tone="default"
        />
        <Stat
          icon={Activity}
          label="Pending review"
          value={pendingGens.toString()}
          sub={
            brandPending > 0
              ? `${brandPending} needs action`
              : creatorPending > 0
              ? `${creatorPending} with creator`
              : "all clear"
          }
          tone={brandPending > 0 ? "warn" : "default"}
        />
        <Stat
          icon={CheckCircle2}
          label="Approved"
          value={approved.toString()}
          sub={`of ${targetImages}`}
          tone="success"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="mt-6 mb-4 flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-600 transition-all ${
                activeTab === t.id
                  ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-700 ${
                  activeTab === t.id ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "bg-[var(--color-border)] text-[var(--color-foreground)]"
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab panels ── */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {activeTab === "studio" && (
          <StudioTab collabId={id} session={session} creditsLeft={creditsLeft} brandPending={brandPending} creatorPending={creatorPending} conversationId={conversation_id} />
        )}
        {activeTab === "vault"   && <VaultTab generations={vaultGens} />}
        {activeTab === "chat"    && (
          <ChatTab
            conversationId={conversation_id}
            counterpartyName={creator.name ?? "Creator"}
            counterpartyAvatar={creator.avatar_url}
          />
        )}
        {activeTab === "details" && (
          <DetailsTab
            session={session}
            licenses={licenses}
            generations={generations}
          />
        )}
      </motion.div>
    </div>
  );
}

/* ───────────────────── Stat tile ───────────────────── */
function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "warn" | "success";
}) {
  const toneStyles = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    warn:    "text-amber-500",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    warn:    "bg-amber-500/10 text-amber-500",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p className={`mt-2 font-display text-[26px] font-800 leading-none ${toneStyles[tone]}`}>
        {value}
        {sub && (
          <span className="ml-1.5 align-middle font-display text-[11px] font-600 text-[var(--color-muted-foreground)]">
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}

/* ───────────────────── Studio Tab ───────────────────── */
function StudioTab({
  collabId,
  session,
  creditsLeft,
  brandPending,
  creatorPending,
  conversationId,
}: {
  collabId: string;
  session: Session;
  creditsLeft: number | null;
  brandPending: number;
  creatorPending: number;
  conversationId: string | null;
}) {
  if (session.status !== "active") {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <Wand2 className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">Studio unavailable</p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          This collab is {session.status}. Studio is only available for active collabs.
        </p>
      </div>
    );
  }

  const noCredits = creditsLeft !== null && creditsLeft <= 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">

      {/* Primary CTA — Open Studio */}
      <Link
        href={`/brand/collabs/${collabId}/studio`}
        className={`group relative flex items-center justify-between overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-12px_rgba(201,169,110,0.3)] ${noCredits ? "pointer-events-none opacity-50" : ""}`}
      >
        {/* Decorative gradient */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[var(--color-primary)]/5 blur-3xl transition-opacity group-hover:opacity-150" />

        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary)]/70 shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)]">
            <Wand2 className="h-7 w-7 text-[var(--color-primary-foreground)]" />
          </div>
          <div>
            <p className="font-display text-[19px] font-800 text-[var(--color-foreground)]">Open Studio</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-muted-foreground)]">
              Generate AI images with {session.name}&apos;s likeness
            </p>
          </div>
        </div>
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-secondary)] transition-transform group-hover:translate-x-0.5">
          <ChevronRight className="h-5 w-5 text-[var(--color-foreground)]" />
        </div>
      </Link>

      {/* Right column: actions / hints */}
      <div className="space-y-3">
        {/* Brand-action pending: brand needs to send/retry/discard */}
        {brandPending > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                {brandPending} awaiting your review
              </p>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-amber-700/80 dark:text-amber-400/80">
              Open Studio to send them to the creator or retry.
            </p>
          </div>
        )}

        {/* Creator-action pending: informational, no brand action */}
        {creatorPending > 0 && (
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-500" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-violet-700 dark:text-violet-400">
                {creatorPending} with creator for approval
              </p>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-violet-700/80 dark:text-violet-400/80">
              Creator has 48h to approve or reject. You&apos;ll be notified.
            </p>
          </div>
        )}

        {/* No credits warning */}
        {noCredits && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3.5">
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-red-600">
              Out of credits
            </p>
            <p className="mt-1 text-[12px] leading-snug text-red-700/90 dark:text-red-400/90">
              All {session.gen_credits_total} generation credits used. Once approvals complete, this collab will close.
            </p>
          </div>
        )}

        {/* Chat shortcut */}
        {conversationId && (
          <Link
            href={`/brand/inbox?conversation=${conversationId}`}
            className="group flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 transition-all hover:border-[var(--color-primary)]/30"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
                <MessageSquare className="h-4 w-4 text-[var(--color-foreground)]" />
              </span>
              <div>
                <p className="text-[13px] font-700 text-[var(--color-foreground)]">Direct chat</p>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">Realtime with creator</p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {/* Tip card */}
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Tip
            </p>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">
            Each generation deducts 1 credit from your wallet. This collab is capped at {session.gen_credits_total ?? "—"} iterations — pick the keeper from each batch and send for approval.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Vault Tab ───────────────────── */
function VaultTab({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <ImageIcon className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No approved images yet</p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Images appear here once the creator approves them.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {generations.length} approved image{generations.length !== 1 ? "s" : ""}
        </p>
        <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
          Original quality · ZIP includes licence cert
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {generations.map((g) => (
          <VaultCell key={g.id} gen={g} />
        ))}
      </div>
    </div>
  );
}

/* ── Single vault cell with proper download (routes through /api/vault) ── */
function VaultCell({ gen }: { gen: Generation }) {
  const [downloading, setDownloading] = useState<null | "original" | "image">(null);

  async function downloadOriginalZip() {
    if (downloading) return;
    setDownloading("original");
    try {
      const res = await fetch(`/api/vault/${gen.id}/download?format=original`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faiceoff-${gen.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[vault download]", err);
      alert("Download failed. Try again.");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadImageOnly() {
    if (downloading || !gen.image_url) return;
    setDownloading("image");
    try {
      // Fetch as blob so the browser respects the download attribute even
      // for cross-origin R2 URLs.
      const res = await fetch(gen.image_url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext =
        (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      const a = document.createElement("a");
      a.href = url;
      a.download = `faiceoff-${gen.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[image download]", err);
      // Fallback: open in new tab so user can right-click save
      if (gen.image_url) window.open(gen.image_url, "_blank");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]">
      {gen.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gen.image_url}
          alt="Approved generation"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
        </div>
      )}
      {gen.image_url && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-stretch justify-end gap-1.5 bg-gradient-to-t from-black/65 via-black/15 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={downloadImageOnly}
            disabled={!!downloading}
            className="pointer-events-auto inline-flex items-center justify-center gap-1 rounded-lg bg-white/15 px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-60"
          >
            {downloading === "image" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Image
          </button>
          <button
            type="button"
            onClick={downloadOriginalZip}
            disabled={!!downloading}
            className="pointer-events-auto inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--color-primary)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-primary-foreground)] backdrop-blur-md transition hover:bg-[var(--color-primary)]/90 disabled:opacity-60"
          >
            {downloading === "original" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Pack ZIP
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Chat Tab — embeds ChatThread inline ───────────────────── */
function ChatTab({
  conversationId,
  counterpartyName,
  counterpartyAvatar,
}: {
  conversationId: string | null;
  counterpartyName: string;
  counterpartyAvatar: string | null;
}) {
  if (!conversationId) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <MessageSquare className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">Chat not yet available</p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Chat unlocks when the creator accepts your collab request.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[640px] overflow-hidden rounded-2xl border border-[var(--color-border)]">
      <ChatThread
        conversationId={conversationId}
        counterparty={{
          name: counterpartyName,
          avatar_url: counterpartyAvatar,
          subtitle: "Creator",
        }}
      />
    </div>
  );
}

/* ───────────────────── Details Tab ───────────────────── */
function DetailsTab({
  session,
  licenses,
  generations,
}: {
  session: Session;
  licenses: LicenseRow[];
  generations: Generation[];
}) {
  const tierLabel = session.package_tier ? TIER_META[session.package_tier]?.label ?? session.package_tier : null;
  const usageLabel = session.usage_scope ? USAGE_LABELS[session.usage_scope] ?? session.usage_scope : null;

  const groups: { title: string; rows: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }[] }[] = [
    {
      title: "Package",
      rows: [
        ...(tierLabel ? [{ icon: Sparkles, label: "Tier", value: tierLabel }] : []),
        ...(session.package_price_paise ? [{ icon: Receipt, label: "Amount paid", value: fmt(session.package_price_paise) }] : []),
        ...(session.final_images_target ? [{ icon: ImageIcon, label: "Final images", value: String(session.final_images_target) }] : []),
        ...(session.gen_credits_total ? [{ icon: Zap, label: "Generation credits", value: String(session.gen_credits_total) }] : []),
        ...(usageLabel ? [{ icon: FileCheck2, label: "Usage scope", value: usageLabel }] : []),
      ],
    },
    {
      title: "Timeline",
      rows: [
        { icon: Clock, label: "Started", value: fmtDate(session.created_at) },
        ...(session.license_expires_at ? [{ icon: Clock, label: "License expires", value: fmtDate(session.license_expires_at) }] : []),
        { icon: Info, label: "Collab ID", value: session.id },
      ],
    },
  ];

  const genById = new Map(generations.map((g) => [g.id, g]));

  return (
    <div className="space-y-4">
      {/* Licenses & documents */}
      <BrandLicenseSection
        licenses={licenses}
        generations={genById}
        approvedTarget={session.final_images_target ?? 0}
        sessionStatus={session.status}
      />

      {/* Package + Timeline */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <p className="mb-4 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              {g.title}
            </p>
            <div className="space-y-3">
              {g.rows.map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.label} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {r.label}
                    </span>
                    <span className="font-mono text-right text-[12px] font-600 text-[var(--color-foreground)] break-all">
                      {r.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── License documents section (brand) ── */
function BrandLicenseSection({
  licenses,
  generations,
  approvedTarget,
  sessionStatus,
}: {
  licenses: LicenseRow[];
  generations: Map<string, Generation>;
  approvedTarget: number;
  sessionStatus: string;
}) {
  const allComplete = approvedTarget > 0 && licenses.length >= approvedTarget;
  const isCompleted = sessionStatus === "completed";

  if (licenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
            <FileCheck2 className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          </div>
          <div>
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              Licences & documents
            </p>
            <p className="text-[12px] text-[var(--color-muted-foreground)]">
              Each approval issues a signed licence PDF + downloadable pack — appears here once the creator approves.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <FileCheck2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              Licences & documents
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {licenses.length} licence{licenses.length !== 1 ? "s" : ""} issued
              {approvedTarget > 0 && ` · ${approvedTarget} target`}
            </p>
          </div>
        </div>
        {allComplete && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            All issued
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {licenses.map((lic) => {
          const gen = generations.get(lic.generation_id);
          return (
            <div
              key={lic.id}
              className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-[var(--color-card)]">
                {gen?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gen.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-[var(--color-muted-foreground)]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                  Licence · {lic.scope.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--color-foreground)]">
                  Issued {fmtDate(lic.issued_at)} · expires {fmtDate(lic.expires_at)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/licenses/${lic.id}/cert`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                  >
                    <FileCheck2 className="h-2.5 w-2.5" />
                    Certificate
                  </a>
                  <a
                    href={`/api/vault/${lic.generation_id}/download?format=original`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                  >
                    <Download className="h-2.5 w-2.5" />
                    Pack ZIP
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isCompleted && allComplete && (
        <p className="mt-3 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
          All target images approved — collab will move to Completed shortly.
        </p>
      )}
    </div>
  );
}
