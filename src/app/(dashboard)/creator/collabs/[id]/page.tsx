"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Timer,
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

type Tab = "images" | "chat" | "details";

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600", bg: "bg-emerald-500/10", icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600", bg: "bg-yellow-500/10", icon: Clock },
};

const TIER_LABELS: Record<string, string> = { frame: "Frame", feature: "Feature", cover: "Cover" };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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

  const reload = useCallback(() => {
    fetch(`/api/collabs/${id}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

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
        <Link href="/creator/collabs" className="mt-4 block text-sm text-[var(--color-primary)]">Back to collabs</Link>
      </div>
    );
  }

  const { session, conversation_id, generations } = data;
  const statusMeta = STATUS_META[session.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;
  const progress = session.final_images_target
    ? Math.round((session.approved_count / session.final_images_target) * 100)
    : null;

  const pendingImages = generations.filter((g) => g.status === "ready_for_approval");
  const approvedImages = generations.filter((g) => g.status === "approved");
  const allReviewImages = [...pendingImages, ...approvedImages];

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "images",  label: `Images${pendingImages.length > 0 ? ` (${pendingImages.length})` : ""}`, icon: ImageIcon },
    { id: "chat",    label: "Chat", icon: MessageSquare },
    { id: "details", label: "Details", icon: Info },
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/creator/collabs"
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

        {progress !== null && (
          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
              <span>{session.approved_count}/{session.final_images_target} images approved</span>
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

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {activeTab === "images"  && <ImagesTab generations={allReviewImages} pendingIds={new Set(pendingImages.map(g => g.id))} onAction={reload} />}
        {activeTab === "chat"    && <ChatTab conversationId={conversation_id} />}
        {activeTab === "details" && <DetailsTab session={session} />}
      </motion.div>
    </div>
  );
}

/* ---------- Images Tab ---------- */
function ImagesTab({
  generations,
  pendingIds,
  onAction,
}: {
  generations: Generation[];
  pendingIds: Set<string>;
  onAction: () => void;
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

  if (generations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <ImageIcon className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No images yet</p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          The brand is generating images. They&apos;ll appear here once sent for your review.
        </p>
      </div>
    );
  }

  const pending = generations.filter((g) => pendingIds.has(g.id));
  const approved = generations.filter((g) => !pendingIds.has(g.id));

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
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
              />
            ))}
          </div>
        </section>
      )}
      {approved.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Approved — {approved.length}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {approved.map((g) => (
              <div key={g.id} className="relative overflow-hidden rounded-xl border border-[var(--color-border)] aspect-square bg-[var(--color-secondary)]">
                {g.image_url ? (
                  <img src={g.image_url} alt="Approved" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 font-mono text-[9px] font-700 text-white backdrop-blur-sm">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Approved
                  </span>
                </div>
              </div>
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
}: {
  gen: Generation;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const expiresAt = gen.structured_brief?.expires_at as string | undefined;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="relative aspect-square bg-[var(--color-secondary)]">
        {gen.image_url ? (
          <img src={gen.image_url} alt="Pending approval" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          </div>
        )}
        {expiresAt && (
          <div className="absolute bottom-2 left-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] text-white backdrop-blur-sm">
              <Timer className="h-2.5 w-2.5" />
              {timeLeft(expiresAt)}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="mb-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          Sent {new Date(gen.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-[12px] font-700 text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
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

/* ---------- Chat Tab ---------- */
function ChatTab({ conversationId }: { conversationId: string | null }) {
  if (!conversationId) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
        <MessageSquare className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">Chat not yet available</p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Chat unlocks after you accept the collab request.
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
        href={`/creator/inbox?conversation=${conversationId}`}
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
