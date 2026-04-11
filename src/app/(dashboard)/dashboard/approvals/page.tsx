"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  MessageSquare,
  Megaphone,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/* ================================================================
   Types
   ================================================================ */

interface ApprovalItem {
  id: string;
  status: string;
  feedback: string | null;
  expires_at: string;
  created_at: string;
  generation: {
    id: string;
    assembled_prompt: string | null;
    image_url: string | null;
    structured_brief: Record<string, string> | null;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
}

/* ================================================================
   Helpers
   ================================================================ */

function timeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${minutes}m left`;
}

function isExpiringSoon(expiresAt: string): boolean {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 6 * 60 * 60 * 1000; // less than 6 hours
}

/* ================================================================
   Animation Variants
   ================================================================ */

const cardVariants = {
  initial: { opacity: 0, y: 16 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      delay: i * 0.06,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
  exit: {
    opacity: 0,
    x: -40,
    height: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    transition: {
      duration: 0.35,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

/* ================================================================
   Component
   ================================================================ */

export default function ApprovalsPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  /* -- Fetch creator ID -- */
  const fetchCreatorId = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single();
    return data?.id ?? null;
  }, [user, supabase]);

  /* -- Fetch approvals -- */
  const fetchApprovals = useCallback(
    async (cId: string) => {
      setLoading(true);

      const { data } = await supabase
        .from("approvals")
        .select(
          `id, status, feedback, expires_at, created_at,
         generation:generations!approvals_generation_id_fkey(id, assembled_prompt, image_url, structured_brief),
         campaign:generations!approvals_generation_id_fkey(campaign:campaigns!generations_campaign_id_fkey(id, name))`
        )
        .eq("creator_id", cId)
        .eq("status", "pending")
        .order("expires_at", { ascending: true });

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: ApprovalItem[] = data.map((row: any) => ({
          id: row.id,
          status: row.status,
          feedback: row.feedback,
          expires_at: row.expires_at,
          created_at: row.created_at,
          generation: row.generation
            ? {
                id: row.generation.id,
                assembled_prompt: row.generation.assembled_prompt,
                image_url: row.generation.image_url,
                structured_brief: row.generation.structured_brief ?? null,
              }
            : null,
          campaign: row.campaign?.campaign
            ? {
                id: row.campaign.campaign.id,
                name: row.campaign.campaign.name,
              }
            : null,
        }));
        setApprovals(items);
      }

      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (!user) return;

    (async () => {
      const cId = await fetchCreatorId();
      setCreatorId(cId);
      if (cId) {
        await fetchApprovals(cId);
      } else {
        setLoading(false);
      }
    })();
  }, [user, fetchCreatorId, fetchApprovals]);

  /* -- Handle approve / reject -- */
  async function handleAction(
    approvalId: string,
    generationId: string,
    action: "approve" | "reject"
  ) {
    setActioningId(approvalId);

    try {
      const res = await fetch(`/api/generations/${generationId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "reject" && feedback ? { feedback } : {}),
        }),
      });

      if (res.ok) {
        // Remove from list with animation
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
        setRejectingId(null);
        setFeedback("");
      }
    } finally {
      setActioningId(null);
    }
  }

  /* -- Loading -- */
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-outline-variant)]/30 border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-5xl"
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-800 tracking-tight text-[var(--color-on-surface)]">
          Approvals
        </h1>
        <p className="mt-1 text-[var(--color-outline)]">
          Review and approve AI-generated content using your likeness.
        </p>
      </div>

      {/* -- Empty state -- */}
      {approvals.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.4,
            ease: [0.25, 0.46, 0.45, 0.94] as const,
          }}
          className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-12 text-center shadow-[var(--shadow-card)]"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-mint)]/30">
            <Inbox className="size-6 text-[var(--color-outline)]" />
          </div>
          <h2 className="text-xl font-700 text-[var(--color-on-surface)] mb-2">
            No pending approvals
          </h2>
          <p className="text-sm text-[var(--color-outline)] max-w-sm mx-auto">
            You're all caught up! When brands generate content using your
            likeness, approval requests will appear here.
          </p>
        </motion.div>
      )}

      {/* -- Approval cards -- */}
      <AnimatePresence mode="popLayout">
        {approvals.map((approval, i) => {
          const gen = approval.generation;
          const campaign = approval.campaign;
          const expiringSoon = isExpiringSoon(approval.expires_at);
          const isRejecting = rejectingId === approval.id;
          const isActioning = actioningId === approval.id;

          return (
            <motion.div
              key={approval.id}
              custom={i}
              variants={cardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-card)]"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Image thumbnail or placeholder */}
                  <div className="shrink-0 size-20 rounded-xl bg-[var(--color-lilac)] flex items-center justify-center overflow-hidden">
                    {gen?.image_url ? (
                      <img
                        src={gen.image_url}
                        alt="Generated content"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Sparkles className="size-7 text-[var(--color-primary)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Campaign name + time */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {campaign && (
                        <Link
                          href={`/dashboard/campaigns/${campaign.id}`}
                          className="inline-flex items-center gap-1.5 text-sm font-700 text-[var(--color-on-surface)] hover:text-[var(--color-primary)] transition-colors no-underline"
                        >
                          <Megaphone className="size-3.5" />
                          {campaign.name}
                        </Link>
                      )}
                    </div>

                    {/* Prompt preview */}
                    {gen?.assembled_prompt && (
                      <p className="text-sm text-[var(--color-on-surface-variant)] line-clamp-2 leading-relaxed mb-2">
                        {gen.assembled_prompt}
                      </p>
                    )}

                    {/* Time remaining badge */}
                    <div className="flex items-center gap-1.5">
                      <Clock
                        className={`size-3.5 ${expiringSoon ? "text-[var(--color-error)]" : "text-[var(--color-outline-variant)]"}`}
                      />
                      <span
                        className={`text-xl font-700 ${
                          expiringSoon
                            ? "text-[var(--color-error)]"
                            : "text-[var(--color-on-surface)]"
                        }`}
                      >
                        {timeRemaining(approval.expires_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Product reference from brand */}
                {gen?.structured_brief?.product_name && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-low)] px-4 py-3">
                    {gen.structured_brief.product_image_url && (
                      <img
                        src={gen.structured_brief.product_image_url}
                        alt={gen.structured_brief.product_name}
                        className="size-12 shrink-0 rounded-lg border border-[var(--color-outline-variant)]/15 object-contain bg-white"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-600 text-[var(--color-outline)]">
                        Brand's Product
                      </p>
                      <p className="text-sm font-600 text-[var(--color-on-surface)] truncate">
                        {gen.structured_brief.product_name}
                      </p>
                      {gen.structured_brief.product_description && (
                        <p className="text-xs text-[var(--color-outline-variant)] line-clamp-1">
                          {gen.structured_brief.product_description}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Reject feedback textarea */}
                <AnimatePresence>
                  {isRejecting && (
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
                      <div className="mt-4 pt-4">
                        <label className="block text-xs font-600 text-[var(--color-outline)] mb-2">
                          <MessageSquare className="inline size-3.5 mr-1" />
                          Rejection feedback (optional)
                        </label>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Describe what needs to change..."
                          rows={3}
                          className="w-full rounded-xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline-variant)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all resize-none"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-4 pt-4">
                  {/* View detail link */}
                  {gen && (
                    <Link
                      href={`/dashboard/generations/${gen.id}`}
                      className="text-xs font-500 text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)] transition-colors no-underline mr-auto"
                    >
                      View details
                    </Link>
                  )}

                  {/* Reject */}
                  {!isRejecting ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isActioning}
                      onClick={() => setRejectingId(approval.id)}
                      className="rounded-xl border border-[var(--color-outline-variant)]/15 text-red-500 hover:border-red-300 hover:bg-red-50"
                    >
                      <XCircle className="size-4" />
                      Reject
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActioning}
                        onClick={() => {
                          setRejectingId(null);
                          setFeedback("");
                        }}
                        className="rounded-xl text-[var(--color-outline)]"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isActioning || !gen}
                        onClick={() => {
                          if (gen) {
                            handleAction(approval.id, gen.id, "reject");
                          }
                        }}
                        className="rounded-xl border border-[var(--color-outline-variant)]/15 bg-transparent text-red-500 hover:bg-red-50"
                      >
                        {isActioning ? (
                          <div className="size-4 animate-spin rounded-full border-2 border-red-200 border-t-red-500" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                        Confirm Reject
                      </Button>
                    </>
                  )}

                  {/* Approve */}
                  {!isRejecting && (
                    <Button
                      size="sm"
                      disabled={isActioning || !gen}
                      onClick={() => {
                        if (gen) {
                          handleAction(approval.id, gen.id, "approve");
                        }
                      }}
                      className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
                    >
                      {isActioning ? (
                        <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
