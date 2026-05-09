"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MessageSquare,
  ImageIcon,
  Info,
  Loader2,
  CheckCircle2,
  Zap,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Timer,
  AtSign,
  Globe,
  Image as ImageIconSm,
  Sparkles,
  Activity,
  Receipt,
  FileCheck2,
  TrendingUp,
  Maximize2,
  X,
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

interface BrandSummary {
  company_name: string | null;
  avatar_url: string | null;
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
  brand: BrandSummary;
  request: RequestSnapshot | null;
  licenses: LicenseRow[];
}

type Tab = "images" | "chat" | "details";

const TIER_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bar: string;
    chipBg: string;
    chipText: string;
  }
> = {
  frame: {
    label: "Frame",
    icon: ImageIconSm,
    bar: "bg-sky-500",
    chipBg: "bg-sky-500",
    chipText: "text-white",
  },
  feature: {
    label: "Feature",
    icon: Zap,
    bar: "bg-[var(--color-primary)]",
    chipBg: "bg-[var(--color-primary)]",
    chipText: "text-[var(--color-primary-foreground)]",
  },
  cover: {
    label: "Cover",
    icon: Globe,
    bar: "bg-violet-500",
    chipBg: "bg-violet-500",
    chipText: "text-white",
  },
};

const STATUS_META: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    dot: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  active: {
    label: "Active",
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    icon: Zap,
  },
  completed: {
    label: "Completed",
    color: "text-[var(--color-primary)]",
    bg: "bg-[var(--color-primary)]/10",
    dot: "bg-[var(--color-primary)]",
    icon: CheckCircle2,
  },
  paused: {
    label: "Paused",
    color: "text-yellow-600",
    bg: "bg-yellow-500/10",
    dot: "bg-yellow-500",
    icon: Clock,
  },
};

const USAGE_LABELS: Record<string, string> = {
  social_organic: "Organic social",
  social_paid: "Paid social",
  digital_full: "Full digital",
};

// Creator share of the package price (matches PLATFORM_COMMISSION)
const CREATOR_SHARE = 0.7;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export default function CreatorCollabWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CollabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("images");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch(`/api/collabs/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Lightbox close on Escape
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

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
        <p className="text-[var(--color-muted-foreground)]">
          Collab not found.
        </p>
        <Link
          href="/creator/collabs"
          className="mt-4 block text-sm text-[var(--color-primary)]"
        >
          Back to collabs
        </Link>
      </div>
    );
  }

  const { session, conversation_id, generations, brand, request, licenses } = data;
  const tier = session.package_tier
    ? TIER_META[session.package_tier] ?? TIER_META.frame
    : TIER_META.frame;
  const TierIcon = tier.icon;
  const statusMeta = STATUS_META[session.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;

  const approved = session.approved_count;
  const targetImages = session.final_images_target ?? 0;
  const progress =
    targetImages > 0 ? Math.round((approved / targetImages) * 100) : 0;

  const pendingImages = generations.filter(
    (g) => g.status === "ready_for_approval",
  );
  const approvedImages = generations.filter((g) => g.status === "approved");

  const expectedEarning =
    session.package_price_paise != null
      ? Math.round(session.package_price_paise * CREATOR_SHARE)
      : null;

  const TABS: {
    id: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: "images",
      label: "Images",
      icon: ImageIcon,
      badge: pendingImages.length,
    },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "details", label: "Details", icon: Info },
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Back link */}
      <Link
        href="/creator/collabs"
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

            <span
              className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] ${tier.chipBg} ${tier.chipText}`}
            >
              <TierIcon className="h-3 w-3" />
              {tier.label}
            </span>

            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-700 text-white backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusMeta.dot} opacity-60`}
                />
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
                />
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

              {/* Brand info */}
              <div className="mt-3 flex items-center gap-2.5">
                {brand.avatar_url ? (
                  <Image
                    src={brand.avatar_url}
                    alt={brand.company_name ?? "Brand"}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[12px] font-700 text-[var(--color-foreground)] ring-2 ring-[var(--color-border)]">
                    {(brand.company_name ?? "B").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-700 text-[var(--color-foreground)]">
                    with {brand.company_name ?? "Brand"}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Brand
                  </p>
                </div>
              </div>

              {request?.brief_one_liner && (
                <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                  &ldquo;{request.brief_one_liner}&rdquo;
                </p>
              )}
            </div>

            {/* Progress strip */}
            {targetImages > 0 && (
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
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Stats row ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={Activity}
          label="Awaiting review"
          value={String(pendingImages.length)}
          sub={pendingImages.length > 0 ? "needs your action" : "all clear"}
          tone={pendingImages.length > 0 ? "warn" : "default"}
        />
        <Stat
          icon={CheckCircle2}
          label="Approved"
          value={String(approved)}
          sub={`of ${targetImages}`}
          tone="success"
        />
        <Stat
          icon={TrendingUp}
          label="Your earning"
          value={expectedEarning ? fmt(expectedEarning) : "—"}
          sub={
            session.package_price_paise
              ? `70% of ${fmt(session.package_price_paise)}`
              : "70% of package"
          }
          tone="primary"
        />
        <Stat
          icon={Sparkles}
          label="Total images"
          value={String(generations.length)}
          sub="generated"
          tone="default"
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
                <span
                  className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-700 ${
                    activeTab === t.id
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "bg-[var(--color-border)] text-[var(--color-foreground)]"
                  }`}
                >
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
        {activeTab === "images" && (
          <ImagesTab
            pending={pendingImages}
            approvedList={approvedImages}
            onAction={reload}
            onZoom={(url) => setLightboxUrl(url)}
          />
        )}
        {activeTab === "chat" && (
          <ChatTab
            conversationId={conversation_id}
            counterpartyName={brand.company_name ?? "Brand"}
          />
        )}
        {activeTab === "details" && (
          <DetailsTab
            session={session}
            licenses={licenses}
            generations={generations}
            role="creator"
          />
        )}
      </motion.div>

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-full max-w-[1400px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Full size"
              className="max-h-[92vh] max-w-full rounded-lg object-contain shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
            />
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full bg-black/55 p-2 text-white backdrop-blur-md transition hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat tile ── */
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
    warn: "text-amber-500",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    warn: "bg-amber-500/10 text-amber-500",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p
        className={`mt-2 font-display text-[24px] font-800 leading-none ${toneStyles[tone]}`}
      >
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

/* ── Images Tab ── */
function ImagesTab({
  pending,
  approvedList,
  onAction,
  onZoom,
}: {
  pending: Generation[];
  approvedList: Generation[];
  onAction: () => void;
  onZoom: (url: string) => void;
}) {
  const [acting, setActing] = useState<Record<string, boolean>>({});

  async function handleApprove(genId: string) {
    const approvalRes = await fetch(`/api/generations/${genId}/approval-id`);
    if (!approvalRes.ok) return;
    const { approval_id } = await approvalRes.json();
    if (!approval_id) return;
    setActing((p) => ({ ...p, [genId]: true }));
    await fetch(`/api/approvals/${approval_id}/approve`, { method: "POST" });
    setActing((p) => ({ ...p, [genId]: false }));
    onAction();
  }

  async function handleReject(genId: string) {
    const reason = window.prompt("Reason for rejection (optional):");
    if (reason === null) return;
    const approvalRes = await fetch(`/api/generations/${genId}/approval-id`);
    if (!approvalRes.ok) return;
    const { approval_id } = await approvalRes.json();
    if (!approval_id) return;
    setActing((p) => ({ ...p, [genId]: true }));
    await fetch(`/api/approvals/${approval_id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: reason }),
    });
    setActing((p) => ({ ...p, [genId]: false }));
    onAction();
  }

  if (pending.length === 0 && approvedList.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <ImageIcon className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
          No images yet
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          The brand is generating images. They&apos;ll appear here once sent
          for your review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
            Awaiting your review — {pending.length}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((g) => (
              <ApprovalCard
                key={g.id}
                gen={g}
                acting={!!acting[g.id]}
                onApprove={() => handleApprove(g.id)}
                onReject={() => handleReject(g.id)}
                onZoom={onZoom}
              />
            ))}
          </div>
        </section>
      )}
      {approvedList.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Approved — {approvedList.length}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {approvedList.map((g) => (
              <button
                type="button"
                key={g.id}
                onClick={() => g.image_url && onZoom(g.image_url)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]"
              >
                {g.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.image_url}
                    alt="Approved"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                  </div>
                )}
                <div className="absolute right-2 top-2 rounded-full bg-black/55 p-1 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                  <Maximize2 className="h-3 w-3 text-white" />
                </div>
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 font-mono text-[9px] font-700 text-white backdrop-blur-sm">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Approved
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ApprovalCard({
  gen,
  acting,
  onApprove,
  onReject,
  onZoom,
}: {
  gen: Generation;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onZoom: (url: string) => void;
}) {
  const expiresAt = gen.structured_brief?.expires_at as string | undefined;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => gen.image_url && onZoom(gen.image_url)}
        className="group relative block aspect-square w-full bg-[var(--color-secondary)]"
      >
        {gen.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gen.image_url}
            alt="Pending approval"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          </div>
        )}
        <div className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3 w-3 text-white" />
        </div>
        {expiresAt && (
          <div className="absolute bottom-2 left-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] text-white backdrop-blur-sm">
              <Timer className="h-2.5 w-2.5" />
              {timeLeft(expiresAt)}
            </span>
          </div>
        )}
      </button>
      <div className="p-3">
        <p className="mb-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          Sent{" "}
          {new Date(gen.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-[12px] font-700 text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {acting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ThumbsUp className="h-3.5 w-3.5" />
            )}
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] py-2 text-[12px] font-700 text-[var(--color-foreground)] transition active:scale-[0.98] disabled:opacity-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Chat Tab — embeds ChatThread inline (no redirect) ── */
function ChatTab({
  conversationId,
  counterpartyName,
}: {
  conversationId: string | null;
  counterpartyName: string;
}) {
  if (!conversationId) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <MessageSquare className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
          Chat not yet available
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Chat unlocks once the brand pays for the collab.
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
          avatar_url: null,
          subtitle: "Brand",
        }}
      />
    </div>
  );
}

/* ── Details Tab ── */
function DetailsTab({
  session,
  licenses,
  generations,
  role,
}: {
  session: Session;
  licenses: LicenseRow[];
  generations: Generation[];
  role: "brand" | "creator";
}) {
  const tierLabel = session.package_tier
    ? TIER_META[session.package_tier]?.label ?? session.package_tier
    : null;
  const usageLabel = session.usage_scope
    ? USAGE_LABELS[session.usage_scope] ?? session.usage_scope
    : null;

  const expectedEarning =
    session.package_price_paise != null
      ? Math.round(session.package_price_paise * CREATOR_SHARE)
      : null;

  const groups: {
    title: string;
    rows: {
      icon?: React.ComponentType<{ className?: string }>;
      label: string;
      value: string;
    }[];
  }[] = [
    {
      title: "Package",
      rows: [
        ...(tierLabel ? [{ icon: Sparkles, label: "Tier", value: tierLabel }] : []),
        ...(session.package_price_paise
          ? [
              {
                icon: Receipt,
                label: "Brand paid",
                value: fmt(session.package_price_paise),
              },
            ]
          : []),
        ...(expectedEarning != null
          ? [
              {
                icon: TrendingUp,
                label: "Your share (70%)",
                value: fmt(expectedEarning),
              },
            ]
          : []),
        ...(session.final_images_target
          ? [
              {
                icon: ImageIcon,
                label: "Final images",
                value: String(session.final_images_target),
              },
            ]
          : []),
        ...(usageLabel
          ? [{ icon: FileCheck2, label: "Usage scope", value: usageLabel }]
          : []),
      ],
    },
    {
      title: "Timeline",
      rows: [
        { icon: Clock, label: "Started", value: fmtDate(session.created_at) },
        ...(session.license_expires_at
          ? [
              {
                icon: Clock,
                label: "License expires",
                value: fmtDate(session.license_expires_at),
              },
            ]
          : []),
        { icon: Info, label: "Collab ID", value: session.id },
      ],
    },
  ];

  // Build a lookup of generation thumbnails so each license card can show
  // its associated image.
  const genById = new Map(generations.map((g) => [g.id, g]));

  return (
    <div className="space-y-4">
      {/* Licenses & documents */}
      <LicenseSection
        licenses={licenses}
        generations={genById}
        approvedTarget={session.final_images_target ?? 0}
        sessionStatus={session.status}
        role={role}
      />

      {/* Package + Timeline */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.title}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
          >
            <p className="mb-4 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              {g.title}
            </p>
            <div className="space-y-3">
              {g.rows.map((r) => {
                const Icon = r.icon;
                return (
                  <div
                    key={r.label}
                    className="flex items-start justify-between gap-3 text-[13px]"
                  >
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

/* ── License documents section ── */
function LicenseSection({
  licenses,
  generations,
  approvedTarget,
  sessionStatus,
  role,
}: {
  licenses: LicenseRow[];
  generations: Map<string, Generation>;
  approvedTarget: number;
  sessionStatus: string;
  role: "brand" | "creator";
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
              Licenses & documents
            </p>
            <p className="text-[12px] text-[var(--color-muted-foreground)]">
              {role === "creator"
                ? "Each approval issues a signed licence PDF — appears here once images are approved."
                : "Each approval issues a signed licence PDF — appears here once the creator approves."}
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
              Licenses & documents
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
                  <img
                    src={gen.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
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
                  Issued {fmtDate(lic.issued_at)} · expires{" "}
                  {fmtDate(lic.expires_at)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {lic.cert_url ? (
                    <a
                      href={lic.cert_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                    >
                      <FileCheck2 className="h-2.5 w-2.5" />
                      Certificate
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                      Cert generating…
                    </span>
                  )}
                  {gen?.image_url && (
                    <a
                      href={`/api/vault/${lic.generation_id}/download?format=original`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                    >
                      <FileCheck2 className="h-2.5 w-2.5" />
                      Pack (zip)
                    </a>
                  )}
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
