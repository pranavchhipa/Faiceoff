"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MessageSquare,
  Wand2,
  ImageIcon,
  Info,
  Loader2,
  CheckCircle2,
  Zap,
  Clock,
  Download,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

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

interface CollabData {
  session: Session;
  role: "brand" | "creator";
  conversation_id: string | null;
  generations: Generation[];
}

type Tab = "studio" | "vault" | "chat" | "details";

const TIER_LABELS: Record<string, string> = { frame: "Frame", feature: "Feature", cover: "Cover" };

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600", bg: "bg-emerald-500/10", icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600", bg: "bg-yellow-500/10", icon: Clock },
};

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(paise / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const APPROVED_STATUSES = new Set(["approved"]);
const VAULT_STATUSES = new Set(["approved"]);

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

  const { session, conversation_id, generations } = data;
  const statusMeta = STATUS_META[session.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;
  const progress = session.final_images_target
    ? Math.round((session.approved_count / session.final_images_target) * 100)
    : null;
  const creditsLeft = session.gen_credits_total != null
    ? session.gen_credits_total - session.gen_credits_used
    : null;
  const vaultGens = generations.filter((g) => VAULT_STATUSES.has(g.status));

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "studio", label: "Studio", icon: Wand2 },
    { id: "vault",  label: `Vault${vaultGens.length > 0 ? ` (${vaultGens.length})` : ""}`, icon: ImageIcon },
    { id: "chat",   label: "Chat", icon: MessageSquare },
    { id: "details", label: "Details", icon: Info },
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/brand/collabs"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All collabs
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-[26px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {session.name}
            </h1>
            {session.description && (
              <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">{session.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[9px] font-700 uppercase ${statusMeta.bg} ${statusMeta.color}`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusMeta.label}
            </span>
            {session.package_tier && (
              <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 font-mono text-[9px] text-[var(--color-muted-foreground)]">
                {TIER_LABELS[session.package_tier] ?? session.package_tier}
              </span>
            )}
          </div>
        </div>

        {/* Progress strip */}
        {progress !== null && (
          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
              <span>{session.approved_count}/{session.final_images_target} images approved</span>
              {creditsLeft !== null && <span>{creditsLeft} gen credits left</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-1">
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
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {activeTab === "studio" && <StudioTab collabId={id} session={session} creditsLeft={creditsLeft} />}
        {activeTab === "vault"   && <VaultTab generations={vaultGens} />}
        {activeTab === "chat"    && <ChatTab conversationId={conversation_id} />}
        {activeTab === "details" && <DetailsTab session={session} />}
      </motion.div>
    </div>
  );
}

/* ---------- Studio Tab ---------- */
function StudioTab({ collabId, session, creditsLeft }: { collabId: string; session: Session; creditsLeft: number | null }) {
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
    <div className="space-y-4">
      {noCredits && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3 text-[13px] text-yellow-700">
          No generation credits remaining. All credits for this collab have been used.
        </div>
      )}

      <Link
        href={`/brand/collabs/${collabId}/studio`}
        className={`group flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_24px_-8px_rgba(201,169,110,0.25)] ${noCredits ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)]/10">
            <Wand2 className="h-6 w-6 text-[var(--color-primary)]" />
          </div>
          <div>
            <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">Open Studio</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
              Generate AI images using {session.name}&apos;s likeness
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </Link>

      {creditsLeft !== null && creditsLeft > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-3">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Credits available
          </p>
          <p className="mt-1 font-display text-[24px] font-800 text-[var(--color-foreground)]">
            {creditsLeft} <span className="text-[14px] font-500 text-[var(--color-muted-foreground)]">generations</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Vault Tab ---------- */
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
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {generations.map((g) => (
          <div
            key={g.id}
            className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] aspect-square"
          >
            {g.image_url ? (
              <img
                src={g.image_url}
                alt="Approved generation"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
              </div>
            )}
            {g.image_url && (
              <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/40 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <a
                  href={g.image_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-black/60 p-1.5 text-white backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Chat Tab ---------- */
function ChatTab({ conversationId }: { conversationId: string | null }) {
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
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[var(--color-primary)]" />
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Direct chat</p>
      </div>
      <Link
        href={`/brand/inbox?conversation=${conversationId}`}
        className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-3 transition-colors hover:border-[var(--color-primary)]/30"
      >
        <span className="text-[13px] font-600 text-[var(--color-foreground)]">Open conversation</span>
        <ExternalLink className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
      </Link>
    </div>
  );
}

/* ---------- Details Tab ---------- */
function DetailsTab({ session }: { session: Session }) {
  const rows: { label: string; value: string }[] = [
    ...(session.package_tier ? [{ label: "Package", value: TIER_LABELS[session.package_tier] ?? session.package_tier }] : []),
    ...(session.package_price_paise ? [{ label: "Amount paid", value: fmt(session.package_price_paise) }] : []),
    ...(session.final_images_target ? [{ label: "Final images", value: String(session.final_images_target) }] : []),
    ...(session.gen_credits_total ? [{ label: "Gen credits", value: String(session.gen_credits_total) }] : []),
    ...(session.usage_scope ? [{ label: "Usage scope", value: session.usage_scope }] : []),
    ...(session.license_expires_at ? [{ label: "License expires", value: fmtDate(session.license_expires_at) }] : []),
    { label: "Started", value: fmtDate(session.created_at) },
    { label: "Collab ID", value: session.id.slice(0, 8) + "…" },
  ];

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="mb-4 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        Collab details
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 text-[13px]">
            <span className="text-[var(--color-muted-foreground)]">{r.label}</span>
            <span className="font-600 text-[var(--color-foreground)] text-right">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
