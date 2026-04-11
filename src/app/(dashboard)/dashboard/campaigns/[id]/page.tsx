"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  ImageIcon,
  IndianRupee,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Shield,
  Eye,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

/* ================================================================
   Types
   ================================================================ */

interface CampaignData {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  budget_paise: number;
  spent_paise: number;
  generation_count: number;
  max_generations: number;
  created_at: string;
  creator_id: string;
  brand_id: string;
  creator_display_name: string;
  brand_display_name: string;
}

interface Generation {
  id: string;
  status: string;
  assembled_prompt: string | null;
  structured_brief: Record<string, string> | null;
  image_url: string | null;
  cost_paise: number | null;
  created_at: string;
  replicate_prediction_id: string | null;
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

const campaignStatusColors: Record<string, string> = {
  active: "bg-[var(--color-mint)] text-[var(--color-ink)]",
  paused: "bg-[var(--color-ocean)] text-[var(--color-ink)]",
  completed: "bg-[var(--color-lilac)] text-[var(--color-ink)]",
  cancelled: "bg-[var(--color-blush)] text-[var(--color-ink)]",
};

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

/** Check if any generation is in-progress (needs polling) */
const IN_PROGRESS_STATUSES = [
  "draft",
  "compliance_check",
  "generating",
  "output_check",
];

function hasInProgressGenerations(gens: Generation[]): boolean {
  return gens.some((g) => IN_PROGRESS_STATUSES.includes(g.status));
}

/* ================================================================
   Component
   ================================================================ */

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();

  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const campaignId = params.id;

  const fetchData = useCallback(
    async (silent = false) => {
      if (!campaignId) return;
      if (!silent) setLoading(true);

      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = await res.json();
        setCampaign(data.campaign);
        setGenerations(data.generations ?? []);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh when generations are in-progress
  useEffect(() => {
    if (hasInProgressGenerations(generations)) {
      pollRef.current = setInterval(() => {
        fetchData(true); // silent refresh
      }, 4000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generations, fetchData]);

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  /* ── Not Found ── */
  if (notFound || !campaign) {
    return (
      <div className="max-w-2xl py-24 text-center">
        <h2 className="text-xl font-700 text-[var(--color-ink)] mb-2">
          Campaign not found
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-6">
          This campaign does not exist or you do not have access.
        </p>
        <Link href="/dashboard/campaigns">
          <Button
            variant="outline"
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)]"
          >
            <ArrowLeft className="size-4" />
            Back to Campaigns
          </Button>
        </Link>
      </div>
    );
  }

  const canAddGeneration =
    campaign.status === "active" &&
    campaign.generation_count < campaign.max_generations;
  const budgetPercent =
    campaign.budget_paise > 0
      ? Math.min(
          100,
          Math.round((campaign.spent_paise / campaign.budget_paise) * 100)
        )
      : 0;
  const genPercent =
    campaign.max_generations > 0
      ? Math.min(
          100,
          Math.round(
            (campaign.generation_count / campaign.max_generations) * 100
          )
        )
      : 0;
  const isPolling = hasInProgressGenerations(generations);
  const isDevMode = generations.some(
    (g) => g.replicate_prediction_id?.startsWith("dev_")
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-5xl"
    >
      {/* Back link */}
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] mb-6 transition-colors no-underline"
      >
        <ArrowLeft className="size-4" />
        Back to Campaigns
      </Link>

      {/* Dev mode banner */}
      {isDevMode && (
        <div className="mb-4 rounded-[var(--radius-input)] border border-amber-300 bg-amber-50 px-4 py-2.5">
          <p className="text-xs font-600 text-amber-800">
            DEV MODE — LoRA model not yet trained. Using placeholder images
            instead of AI-generated content.
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-800 tracking-tight text-[var(--color-ink)]">
              {campaign.name}
            </h1>
            <span
              className={`rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-600 capitalize ${
                campaignStatusColors[campaign.status] ??
                campaignStatusColors.active
              }`}
            >
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-[var(--color-neutral-500)]">
            Creator: {campaign.creator_display_name}
          </p>
          {campaign.description && (
            <p className="text-sm text-[var(--color-neutral-500)] mt-1">
              {campaign.description}
            </p>
          )}
        </div>
        {canAddGeneration && (
          <Button
            onClick={() =>
              router.push(
                `/dashboard/campaigns/new?creator=${campaign.creator_id}`
              )
            }
            className="shrink-0 rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]"
          >
            <Plus className="size-4" />
            New Generation
          </Button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {/* Budget */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-mint)]/40">
              <IndianRupee className="size-4 text-[var(--color-neutral-600)]" />
            </div>
            <h3 className="text-sm font-600 text-[var(--color-ink)]">
              Budget Used
            </h3>
          </div>
          <p className="text-2xl font-700 text-[var(--color-ink)]">
            {formatINR(campaign.spent_paise)}
            <span className="text-base font-500 text-[var(--color-neutral-400)]">
              {" "}
              / {formatINR(campaign.budget_paise)}
            </span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
            <div
              className="h-full rounded-full bg-[var(--color-gold)] transition-all"
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>

        {/* Generations */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-ocean)]/40">
              <ImageIcon className="size-4 text-[var(--color-neutral-600)]" />
            </div>
            <h3 className="text-sm font-600 text-[var(--color-ink)]">
              Generations
            </h3>
          </div>
          <p className="text-2xl font-700 text-[var(--color-ink)]">
            {campaign.generation_count}
            <span className="text-base font-500 text-[var(--color-neutral-400)]">
              {" "}
              / {campaign.max_generations}
            </span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
            <div
              className="h-full rounded-full bg-[var(--color-ocean-deep)] transition-all"
              style={{ width: `${genPercent}%` }}
            />
          </div>
        </div>
      </div>

      <Separator className="mb-8" />

      {/* ── Generation History ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-700 text-[var(--color-ink)]">
            Generation History
          </h2>
          {isPolling && (
            <span className="inline-flex items-center gap-1.5 text-xs font-500 text-[var(--color-gold)]">
              <RefreshCw className="size-3 animate-spin" />
              Processing...
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--color-neutral-400)]">
          {generations.length} generation{generations.length !== 1 ? "s" : ""}
        </p>
      </div>

      {generations.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
            <Sparkles className="size-5 text-[var(--color-neutral-400)]" />
          </div>
          <p className="text-sm font-600 text-[var(--color-ink)] mb-1">
            No generations yet
          </p>
          <p className="text-xs text-[var(--color-neutral-500)]">
            Generations will appear here once they are created.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {generations.map((gen, i) => {
            const cfg = genStatusConfig[gen.status] ?? genStatusConfig.draft;
            const StatusIcon = cfg.icon;
            const isInProgress = IN_PROGRESS_STATUSES.includes(gen.status);
            const isDevImage = gen.replicate_prediction_id?.startsWith("dev_");

            return (
              <Link
                key={gen.id}
                href={`/dashboard/generations/${gen.id}`}
                className="no-underline"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className={`group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4 transition-shadow hover:shadow-[var(--shadow-elevated)] ${
                    isInProgress ? "border-[var(--color-ocean)]/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Image or placeholder */}
                    <div className="shrink-0 size-16 rounded-[var(--radius-input)] bg-[var(--color-neutral-100)] flex items-center justify-center overflow-hidden">
                      {gen.image_url ? (
                        <img
                          src={gen.image_url}
                          alt="Generated"
                          className="size-full object-cover"
                        />
                      ) : isInProgress ? (
                        <Loader2 className="size-6 text-[var(--color-ocean)] animate-spin" />
                      ) : (
                        <ImageIcon className="size-6 text-[var(--color-neutral-300)]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-600 ${cfg.bg}`}
                        >
                          <StatusIcon
                            className={`size-3 ${gen.status === "generating" ? "animate-spin" : ""}`}
                          />
                          {cfg.label}
                        </span>
                        {isDevImage && (
                          <span className="rounded-[var(--radius-pill)] bg-amber-100 px-2 py-0.5 text-[10px] font-600 text-amber-700">
                            DEV
                          </span>
                        )}
                        <span className="text-xs text-[var(--color-neutral-400)]">
                          {formatDate(gen.created_at)}
                        </span>
                      </div>
                      {gen.assembled_prompt && (
                        <p className="text-sm text-[var(--color-neutral-600)] line-clamp-2 leading-relaxed group-hover:text-[var(--color-ink)] transition-colors">
                          {gen.assembled_prompt}
                        </p>
                      )}
                      {gen.cost_paise != null && gen.cost_paise > 0 && (
                        <p className="mt-1 text-xs text-[var(--color-neutral-400)]">
                          Cost: {formatINR(gen.cost_paise)}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
