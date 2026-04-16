"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ImageIcon,
  IndianRupee,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  MessageSquare,
  Calendar,
  Sparkles,
  Shield,
  Eye,
} from "lucide-react";

/* ================================================================
   Types
   ================================================================ */

interface GenerationDetail {
  id: string;
  campaign_id: string;
  creator_id: string;
  brand_id: string;
  status: string;
  assembled_prompt: string | null;
  structured_brief: Record<string, string> | null;
  image_url: string | null;
  cost_paise: number | null;
  created_at: string;
  updated_at: string;
  campaign: {
    id: string;
    name: string;
  } | null;
}

interface ApprovalRecord {
  id: string;
  status: string;
  feedback: string | null;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
}

/* ================================================================
   Helpers
   ================================================================ */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ================================================================
   Status Config (same pattern as campaigns/[id])
   ================================================================ */

const genStatusConfig: Record<
  string,
  { bg: string; icon: typeof Clock; label: string }
> = {
  draft: {
    bg: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]",
    icon: FileText,
    label: "Draft",
  },
  compliance_check: {
    bg: "bg-[var(--color-ocean)]/60 text-[var(--color-ink)]",
    icon: Shield,
    label: "Compliance Check",
  },
  generating: {
    bg: "bg-[var(--color-ocean)] text-[var(--color-ink)]",
    icon: Loader2,
    label: "Generating",
  },
  output_check: {
    bg: "bg-[var(--color-ocean)] text-[var(--color-ink)]",
    icon: Eye,
    label: "Output Check",
  },
  ready_for_approval: {
    bg: "bg-[var(--color-lilac)] text-[var(--color-ink)]",
    icon: Clock,
    label: "Awaiting Approval",
  },
  approved: {
    bg: "bg-[var(--color-mint)] text-[var(--color-ink)]",
    icon: CheckCircle2,
    label: "Approved",
  },
  rejected: {
    bg: "bg-[var(--color-blush)] text-[var(--color-ink)]",
    icon: XCircle,
    label: "Rejected",
  },
  failed: {
    bg: "bg-[var(--color-blush)] text-[var(--color-ink)]",
    icon: XCircle,
    label: "Failed",
  },
};

/* ================================================================
   Timeline Config
   ================================================================ */

interface TimelineEntry {
  label: string;
  date: string;
  icon: typeof Clock;
  color: string;
}

function buildTimeline(
  gen: GenerationDetail,
  approval: ApprovalRecord | null
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  entries.push({
    label: "Generation created",
    date: gen.created_at,
    icon: Sparkles,
    color: "var(--color-ocean)",
  });

  if (
    gen.status !== "draft" &&
    gen.status !== "compliance_check" &&
    gen.created_at !== gen.updated_at
  ) {
    // We infer intermediate states from the current status
    if (
      [
        "generating",
        "output_check",
        "ready_for_approval",
        "approved",
        "rejected",
      ].includes(gen.status)
    ) {
      entries.push({
        label: "Compliance check passed",
        date: gen.created_at, // approximate
        icon: Shield,
        color: "var(--color-ocean)",
      });
    }
  }

  if (approval) {
    entries.push({
      label: "Sent for creator approval",
      date: approval.created_at,
      icon: Clock,
      color: "var(--color-lilac)",
    });

    if (approval.status === "approved" && approval.decided_at) {
      entries.push({
        label: "Approved by creator",
        date: approval.decided_at,
        icon: CheckCircle2,
        color: "var(--color-mint)",
      });
    }

    if (approval.status === "rejected" && approval.decided_at) {
      entries.push({
        label: "Rejected by creator",
        date: approval.decided_at,
        icon: XCircle,
        color: "var(--color-blush)",
      });
    }
  }

  return entries;
}

/* ================================================================
   Animation Variants
   ================================================================ */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      delay,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
};

/* ================================================================
   Component
   ================================================================ */

export default function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, isLoading: authLoading } = useAuth();

  const [generation, setGeneration] = useState<GenerationDetail | null>(null);
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionDone, setActionDone] = useState(false);

  /* ── Fetch data via API route (bypasses RLS) ── */
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/generations/${id}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const data = await res.json();

      const d = data.generation;
      const gen: GenerationDetail = {
        id: d.id,
        campaign_id: d.campaign_id,
        creator_id: d.creator_id,
        brand_id: d.brand_id,
        status: d.status,
        assembled_prompt: d.assembled_prompt,
        structured_brief: d.structured_brief,
        image_url: d.image_url,
        cost_paise: d.cost_paise,
        created_at: d.created_at,
        updated_at: d.updated_at,
        campaign: d.campaign ?? null,
      };

      setGeneration(gen);
      setIsCreator(data.is_creator ?? false);

      if (data.approval) {
        setApproval(data.approval as ApprovalRecord);
      }
    } catch {
      setNotFound(true);
    }

    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Handle approve / reject ── */
  async function handleAction(action: "approve" | "reject") {
    if (!generation) return;
    setActioningId(action);

    try {
      const res = await fetch(
        `/api/generations/${generation.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            ...(action === "reject" && feedback ? { feedback } : {}),
          }),
        }
      );

      if (res.ok) {
        setActionDone(true);
        setShowRejectForm(false);
        setFeedback("");
        // Refresh data to show updated status
        await fetchData();
      }
    } finally {
      setActioningId(null);
    }
  }

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6">
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-neutral-200)]" />
        </div>
        <div className="animate-pulse rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-4">
            <div className="h-6 w-32 rounded bg-[var(--color-neutral-200)]" />
            <div className="h-5 w-24 rounded-full bg-[var(--color-neutral-100)]" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-4 w-full rounded bg-[var(--color-neutral-100)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--color-neutral-100)]" />
          </div>
          <div className="mt-6 h-64 w-full rounded-lg bg-[var(--color-neutral-100)]" />
        </div>
      </div>
    );
  }

  /* ── Not Found ── */
  if (notFound || !generation) {
    return (
      <div className="max-w-2xl py-24 text-center">
        <h2 className="text-xl font-700 text-[var(--color-ink)] mb-2">
          Generation not found
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-6">
          This generation does not exist or you do not have access.
        </p>
        <Link href="/dashboard">
          <Button
            variant="outline"
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)]"
          >
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const cfg = genStatusConfig[generation.status] ?? genStatusConfig.draft;
  const StatusIcon = cfg.icon;
  const timeline = buildTimeline(generation, approval);
  const canApprove =
    generation.status === "ready_for_approval" && isCreator && !actionDone;

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {generation.campaign ? (
          <Link
            href={`/dashboard/campaigns/${generation.campaign.id}`}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors no-underline"
          >
            <ArrowLeft className="size-4" />
            Back to {generation.campaign.name}
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors no-underline"
          >
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Link>
        )}
      </motion.div>

      {/* ── Header Card ── */}
      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-[var(--radius-card)] bg-white p-5 sm:p-8 shadow-[var(--shadow-card)]"
      >
        {/* Status + Campaign */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
              <h1 className="text-xl sm:text-2xl font-800 tracking-tight text-[var(--color-ink)]">
                Generation Detail
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-600 ${cfg.bg}`}
              >
                <StatusIcon
                  className={`size-3 ${generation.status === "generating" ? "animate-spin" : ""}`}
                />
                {cfg.label}
              </span>
            </div>
            {generation.campaign && (
              <Link
                href={`/dashboard/campaigns/${generation.campaign.id}`}
                className="text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-gold-hover)] transition-colors no-underline"
              >
                Campaign: {generation.campaign.name}
              </Link>
            )}
          </div>

          {/* Cost */}
          {generation.cost_paise != null && generation.cost_paise > 0 && (
            <div className="shrink-0 rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-mint)]/20 px-4 py-2.5 text-center">
              <div className="flex items-center gap-1.5 text-xs font-500 text-[var(--color-neutral-500)] mb-0.5">
                <IndianRupee className="size-3" />
                Cost
              </div>
              <p className="text-lg font-700 text-[var(--color-ink)]">
                {formatINR(generation.cost_paise)}
              </p>
            </div>
          )}
        </div>

        <Separator className="mb-6 bg-[var(--color-neutral-200)]" />

        {/* ── Assembled Prompt ── */}
        {generation.assembled_prompt && (
          <div className="mb-6">
            <h3 className="text-sm font-600 text-[var(--color-neutral-500)] mb-2">
              Assembled Prompt
            </h3>
            <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-[var(--color-paper)] p-4">
              <p className="text-sm text-[var(--color-ink)] leading-relaxed whitespace-pre-wrap">
                {generation.assembled_prompt}
              </p>
            </div>
          </div>
        )}

        {/* ── Product Reference ── */}
        {generation.structured_brief?.product_name && (
          <div className="mb-6 flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-ocean)]/10 p-4">
            {generation.structured_brief.product_image_url && (
              <img
                src={generation.structured_brief.product_image_url}
                alt={generation.structured_brief.product_name}
                className="size-16 shrink-0 rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] object-contain bg-white"
              />
            )}
            <div>
              <p className="text-xs font-600 text-[var(--color-neutral-500)]">
                Brand's Product
              </p>
              <p className="text-sm font-700 text-[var(--color-ink)]">
                {generation.structured_brief.product_name}
              </p>
              {generation.structured_brief.product_description && (
                <p className="text-xs text-[var(--color-neutral-500)] mt-0.5">
                  {generation.structured_brief.product_description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Generated Image ── */}
        <div className="mb-6">
          <h3 className="text-sm font-600 text-[var(--color-neutral-500)] mb-2">
            Generated Image
          </h3>
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]">
            {generation.image_url ? (
              <img
                src={generation.image_url}
                alt="AI-generated content"
                className="w-full max-h-[32rem] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <ImageIcon className="size-12 text-[var(--color-neutral-300)] mb-3" />
                <p className="text-sm font-500 text-[var(--color-neutral-400)]">
                  {generation.status === "generating"
                    ? "Image is being generated..."
                    : generation.status === "draft" ||
                        generation.status === "compliance_check"
                      ? "Image not yet generated"
                      : "No image available"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Approval Feedback (if rejected) ── */}
        {approval?.feedback && approval.status === "rejected" && (
          <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-blush)] bg-[var(--color-blush)]/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="size-4 text-[var(--color-ink)]" />
              <h3 className="text-sm font-600 text-[var(--color-ink)]">
                Creator Feedback
              </h3>
            </div>
            <p className="text-sm text-[var(--color-neutral-600)] leading-relaxed">
              {approval.feedback}
            </p>
          </div>
        )}

        {/* ── Approve / Reject Buttons (for creator when ready_for_approval) ── */}
        {canApprove && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.25, 0.46, 0.45, 0.94] as const,
            }}
            className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-lilac)] bg-[var(--color-lilac)]/20 p-5"
          >
            <h3 className="text-sm font-700 text-[var(--color-ink)] mb-1">
              Your approval is required
            </h3>
            <p className="text-xs text-[var(--color-neutral-500)] mb-4">
              Review the generated content above and approve or reject it.
            </p>

            {/* Reject form */}
            <AnimatePresence>
              {showRejectForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94] as const,
                  }}
                  className="overflow-hidden"
                >
                  <div className="mb-4">
                    <label className="block text-xs font-600 text-[var(--color-neutral-500)] mb-2">
                      <MessageSquare className="inline size-3.5 mr-1" />
                      Rejection feedback (optional)
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Describe what needs to change..."
                      rows={3}
                      className="w-full rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20 transition-all resize-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3">
              {!showRejectForm ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!actioningId}
                    onClick={() => setShowRejectForm(true)}
                    className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:border-[var(--color-blush)] hover:text-[var(--color-ink)] hover:bg-[var(--color-blush)]/20"
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={!!actioningId}
                    onClick={() => handleAction("approve")}
                    className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]"
                  >
                    {actioningId === "approve" ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Approve
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!actioningId}
                    onClick={() => {
                      setShowRejectForm(false);
                      setFeedback("");
                    }}
                    className="rounded-[var(--radius-button)] text-[var(--color-neutral-500)]"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!!actioningId}
                    onClick={() => handleAction("reject")}
                    className="rounded-[var(--radius-button)]"
                  >
                    {actioningId === "reject" ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                    Confirm Reject
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Success message after action */}
        <AnimatePresence>
          {actionDone && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.25, 0.46, 0.45, 0.94] as const,
              }}
              className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-mint)] bg-[var(--color-mint)]/20 p-4"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-ink)]" />
                <p className="text-sm font-600 text-[var(--color-ink)]">
                  Your response has been recorded.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Timeline ── */}
      <motion.div
        custom={0.15}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-6 rounded-[var(--radius-card)] bg-white p-5 sm:p-8 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
          Timeline
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-5">
          Status history for this generation.
        </p>

        <Separator className="mb-5 bg-[var(--color-neutral-200)]" />

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[var(--color-neutral-200)]" />

          <div className="flex flex-col gap-5">
            {timeline.map((entry, i) => {
              const Icon = entry.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.3 + i * 0.08,
                    ease: [0.25, 0.46, 0.45, 0.94] as const,
                  }}
                  className="flex items-start gap-4 relative"
                >
                  <div
                    className="flex size-[23px] shrink-0 items-center justify-center rounded-full z-10"
                    style={{ backgroundColor: entry.color }}
                  >
                    <Icon className="size-3 text-[var(--color-ink)]" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-600 text-[var(--color-ink)]">
                      {entry.label}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Calendar className="size-3 text-[var(--color-neutral-400)]" />
                      <p className="text-xs text-[var(--color-neutral-400)]">
                        {formatDateTime(entry.date)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ── Metadata Card ── */}
      <motion.div
        custom={0.3}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-6 rounded-[var(--radius-card)] bg-white p-5 sm:p-8 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
          Details
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-5">
          Technical details and metadata.
        </p>

        <Separator className="mb-5 bg-[var(--color-neutral-200)]" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-600 text-[var(--color-neutral-400)] uppercase tracking-wider mb-1">
              Generation ID
            </p>
            <p className="text-sm font-500 text-[var(--color-ink)] font-mono truncate">
              {generation.id}
            </p>
          </div>
          <div>
            <p className="text-xs font-600 text-[var(--color-neutral-400)] uppercase tracking-wider mb-1">
              Created
            </p>
            <p className="text-sm font-500 text-[var(--color-ink)]">
              {formatDate(generation.created_at)}
            </p>
          </div>
          <div>
            <p className="text-xs font-600 text-[var(--color-neutral-400)] uppercase tracking-wider mb-1">
              Last Updated
            </p>
            <p className="text-sm font-500 text-[var(--color-ink)]">
              {formatDateTime(generation.updated_at)}
            </p>
          </div>
          {generation.cost_paise != null && generation.cost_paise > 0 && (
            <div>
              <p className="text-xs font-600 text-[var(--color-neutral-400)] uppercase tracking-wider mb-1">
                Cost
              </p>
              <p className="text-sm font-700 text-[var(--color-ink)]">
                {formatINR(generation.cost_paise)}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
