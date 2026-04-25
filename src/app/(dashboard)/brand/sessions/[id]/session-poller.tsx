"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Shield,
  Sparkles,
  ImageIcon,
  ArrowRight,
  AlertTriangle,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface GenerationStatus {
  id: string;
  status: string;
  image_url: string | null;
  structured_brief: Record<string, string> | null;
  assembled_prompt: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionPollerProps {
  generationId: string;
  initialStatus: GenerationStatus | null;
}

/* ── Constants ── */

const TERMINAL_STATUSES = new Set(["approved", "rejected", "failed"]);
const POLL_INTERVAL_MS = 3000;

/* ── Stage pipeline ── */

const STAGES = [
  { key: "compliance", label: "Compliance", icon: Shield },
  { key: "generation", label: "Generation", icon: Sparkles },
  { key: "safety", label: "Safety", icon: Shield },
  { key: "approval", label: "Approval", icon: CheckCircle2 },
] as const;

function getStageIndex(status: string): number {
  if (status === "draft" || status === "compliance_check" || status === "pending_compliance") return 0;
  if (status === "generating" || status === "pending_replicate" || status === "processing") return 1;
  if (status === "output_check" || status === "pending_safety") return 2;
  if (
    status === "ready_for_approval" ||
    status === "pending_approval" ||
    status === "approved" ||
    status === "rejected"
  )
    return 3;
  return 0;
}

/* ── Status config ── */

interface StatusConfig {
  label: string;
  sublabel?: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  icon: typeof Clock;
  pulsing: boolean;
  terminal: boolean;
}

function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case "pending_compliance":
    case "compliance_check":
    case "draft":
      return {
        label: "Checking compliance",
        sublabel: "Vetting brief against creator's blocked categories",
        tone: "info",
        icon: Shield,
        pulsing: true,
        terminal: false,
      };
    case "generating":
    case "pending_replicate":
    case "processing":
      return {
        label: "Generating image",
        sublabel: "Faiceoff AI is producing your shot — typically 30–90 seconds",
        tone: "info",
        icon: Loader2,
        pulsing: true,
        terminal: false,
      };
    case "output_check":
    case "pending_safety":
      return {
        label: "Safety review",
        sublabel: "Running content moderation on the output",
        tone: "info",
        icon: Shield,
        pulsing: true,
        terminal: false,
      };
    case "ready_for_approval":
    case "pending_approval":
      return {
        label: "Awaiting creator approval",
        sublabel: "Creator has 48 hours to approve or reject",
        tone: "warning",
        icon: Clock,
        pulsing: true,
        terminal: false,
      };
    case "approved":
      return {
        label: "Approved",
        sublabel: "Image is ready in your vault",
        tone: "success",
        icon: CheckCircle2,
        pulsing: false,
        terminal: true,
      };
    case "rejected":
      return {
        label: "Rejected by creator",
        sublabel: "Your credits have been refunded",
        tone: "danger",
        icon: XCircle,
        pulsing: false,
        terminal: true,
      };
    case "failed":
      return {
        label: "Generation failed",
        sublabel: "Credits refunded — please try again",
        tone: "danger",
        icon: AlertTriangle,
        pulsing: false,
        terminal: true,
      };
    default:
      return {
        label: "Processing",
        tone: "neutral",
        icon: Loader2,
        pulsing: true,
        terminal: false,
      };
  }
}

const TONE_STYLES: Record<
  StatusConfig["tone"],
  { ring: string; iconBg: string; iconColor: string; accent: string }
> = {
  neutral: {
    ring: "ring-[var(--color-border)]",
    iconBg: "bg-[var(--color-secondary)]",
    iconColor: "text-[var(--color-muted-foreground)]",
    accent: "bg-[var(--color-muted-foreground)]",
  },
  info: {
    ring: "ring-[var(--color-primary)]/30",
    iconBg: "bg-[var(--color-primary)]/15",
    iconColor: "text-[var(--color-primary)]",
    accent: "bg-[var(--color-primary)]",
  },
  warning: {
    ring: "ring-[var(--color-mint)]/40",
    iconBg: "bg-[var(--color-mint)]/40",
    iconColor: "text-[var(--color-foreground)]",
    accent: "bg-[var(--color-mint)]",
  },
  success: {
    ring: "ring-[var(--color-primary)]/40",
    iconBg: "bg-[var(--color-primary)]",
    iconColor: "text-[var(--color-primary-foreground)]",
    accent: "bg-[var(--color-primary)]",
  },
  danger: {
    ring: "ring-red-500/30",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-500",
    accent: "bg-red-500",
  },
};

/* ── Elapsed time chip ── */

function ElapsedTime({ since }: { since: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    function compute() {
      const ms = Date.now() - new Date(since).getTime();
      const s = Math.floor(ms / 1000);
      if (s < 60) {
        setText(`${s}s elapsed`);
      } else if (s < 3600) {
        const m = Math.floor(s / 60);
        const rem = s % 60;
        setText(`${m}m ${rem}s elapsed`);
      } else {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        setText(`${h}h ${m}m elapsed`);
      }
    }
    compute();
    const t = setInterval(compute, 1000);
    return () => clearInterval(t);
  }, [since]);

  return (
    <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
      {text}
    </span>
  );
}

/* ── Pipeline progress (horizontal, compact) ── */

function PipelineProgress({ currentStage, terminal, failed }: { currentStage: number; terminal: boolean; failed: boolean }) {
  return (
    <div className="relative flex items-start">
      {STAGES.map((stage, i) => {
        const past = i < currentStage || (terminal && !failed);
        const active = i === currentStage && !terminal;
        const isLast = i === STAGES.length - 1;
        const Icon = stage.icon;

        return (
          <div key={stage.key} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              {/* Dot */}
              <motion.div
                className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  past
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : active
                    ? "border-[var(--color-primary)] bg-[var(--color-card)] text-[var(--color-primary)]"
                    : failed && i === currentStage
                    ? "border-red-500 bg-red-500/15 text-red-500"
                    : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)]"
                }`}
                animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : {}}
              >
                <Icon className="size-3.5" />
                {active && (
                  <motion.span
                    className="absolute inset-0 rounded-full ring-2 ring-[var(--color-primary)]"
                    animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
              </motion.div>

              {/* Connector */}
              {!isLast && (
                <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <motion.div
                    className="h-full origin-left bg-[var(--color-primary)]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: past ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>

            <span
              className={`text-[10px] font-600 leading-tight ${
                past || active
                  ? "text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)]"
              }`}
            >
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Image canvas: skeleton → image → approved CTA ── */

function ImageCanvas({
  imageUrl,
  status,
  failed,
}: {
  imageUrl: string | null;
  status: string;
  failed: boolean;
}) {
  const isGenerating =
    status === "generating" ||
    status === "pending_replicate" ||
    status === "processing" ||
    status === "compliance_check" ||
    status === "pending_compliance" ||
    status === "draft" ||
    status === "output_check" ||
    status === "pending_safety";

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-secondary)] shadow-[var(--shadow-card)]">
      {imageUrl ? (
        <motion.img
          key={imageUrl}
          src={imageUrl}
          alt="Generated"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-red-500/15">
            <AlertTriangle className="size-7 text-red-500" />
          </div>
          <p className="text-sm font-600 text-[var(--color-foreground)]">
            No image was produced
          </p>
          <p className="max-w-xs text-xs text-[var(--color-muted-foreground)]">
            Something went wrong during the pipeline. Your credits have been
            refunded — try again with a slightly different brief.
          </p>
        </div>
      ) : (
        <>
          {/* Animated shimmer */}
          {isGenerating && (
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 70%, transparent 100%)",
              }}
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-card)] ring-1 ring-[var(--color-border)]">
              <ImageIcon className="size-6 text-[var(--color-muted-foreground)]" />
            </div>
            <p className="text-sm font-600 text-[var(--color-foreground)]">
              {isGenerating ? "Crafting your shot…" : "Image will appear here"}
            </p>
            {isGenerating && (
              <p className="max-w-xs text-xs text-[var(--color-muted-foreground)]">
                Faiceoff AI is composing your scene with the creator&apos;s
                likeness + product anchor
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Copy ID button ── */

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1 text-[10px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
    >
      {copied ? (
        <>
          <Check className="size-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3" /> Copy ID
        </>
      )}
    </button>
  );
}

/* ── Main component ── */

export default function SessionPoller({
  generationId,
  initialStatus,
}: SessionPollerProps) {
  const [gen, setGen] = useState<GenerationStatus | null>(initialStatus);
  const [fetchError, setFetchError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = gen?.status ?? "draft";
  const cfg = getStatusConfig(status);
  const StatusIcon = cfg.icon;
  const tone = TONE_STYLES[cfg.tone];
  const stageIndex = getStageIndex(status);
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isFailed = status === "failed" || status === "rejected";

  /* ── Poll ── */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/generations/${generationId}`);
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = await res.json();
      const updated: GenerationStatus = {
        id: data.generation.id,
        status: data.generation.status,
        image_url: data.generation.image_url ?? null,
        structured_brief: data.generation.structured_brief ?? null,
        assembled_prompt: data.generation.assembled_prompt ?? null,
        created_at: data.generation.created_at,
        updated_at: data.generation.updated_at,
      };
      setGen(updated);
      setFetchError(false);

      if (TERMINAL_STATUSES.has(updated.status) && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch {
      setFetchError(true);
    }
  }, [generationId]);

  useEffect(() => {
    if (isTerminal) return;
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStatus, isTerminal]);

  const brief = gen?.structured_brief ?? {};
  const briefEntries = Object.entries({
    Product: brief.product_name,
    Setting: brief.setting,
    "Time & light": brief.time_lighting,
    Mood: brief.mood_palette,
    Pose: brief.pose_energy,
    Outfit: brief.outfit_style,
    Camera: brief.camera_framing,
    "Aspect ratio": brief.aspect_ratio,
  }).filter(([, v]) => v && typeof v === "string" && v.trim().length > 0) as [
    string,
    string,
  ][];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      {/* ───────── LEFT — Status panel (sticky on lg+) ───────── */}
      <div className="space-y-4 lg:sticky lg:top-6">
        {/* Status hero */}
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-soft)] ring-1 ${tone.ring}`}
        >
          {/* Subtle accent bar at top */}
          <div className={`absolute inset-x-0 top-0 h-0.5 ${tone.accent}`} />

          <div className="flex items-start gap-3.5">
            <motion.div
              className={`flex size-11 shrink-0 items-center justify-center rounded-full ${tone.iconBg}`}
              animate={cfg.pulsing ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={
                cfg.pulsing
                  ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                  : {}
              }
            >
              <StatusIcon
                className={`size-5 ${tone.iconColor} ${
                  status === "generating" ||
                  status === "pending_replicate" ||
                  status === "processing"
                    ? "animate-spin"
                    : ""
                }`}
              />
            </motion.div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
                Status
              </p>
              <h2 className="mt-0.5 text-base font-700 leading-tight tracking-tight text-[var(--color-foreground)] sm:text-lg">
                {cfg.label}
              </h2>
              {cfg.sublabel && (
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                  {cfg.sublabel}
                </p>
              )}

              {gen?.created_at && !isTerminal && (
                <div className="mt-2.5">
                  <ElapsedTime since={gen.created_at} />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Pipeline progress */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-3.5 flex items-center justify-between">
            <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
              Pipeline
            </p>
            <span className="text-[10px] font-600 text-[var(--color-muted-foreground)]">
              Step {Math.min(stageIndex + 1, STAGES.length)} of {STAGES.length}
            </span>
          </div>
          <PipelineProgress currentStage={stageIndex} terminal={isTerminal} failed={isFailed} />
        </div>

        {/* Brief recap */}
        {briefEntries.length > 0 && (
          <details className="group rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] [&_summary::-webkit-details-marker]:hidden" open>
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 pb-4">
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
                Your brief
              </p>
              <span className="text-[10px] font-600 text-[var(--color-muted-foreground)] transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="px-5 pb-5">
              {briefEntries.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {briefEntries.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        {k}
                      </dt>
                      <dd className="mt-0.5 truncate font-500 text-[var(--color-foreground)]">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </details>
        )}

        {/* Footer meta + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <CopyIdButton id={generationId} />
          {isTerminal && (
            <Link
              href="/brand/sessions"
              className="text-[11px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Back to sessions →
            </Link>
          )}
        </div>
      </div>

      {/* ───────── RIGHT — Image canvas + actions ───────── */}
      <div className="space-y-4">
        <ImageCanvas
          imageUrl={gen?.image_url ?? null}
          status={status}
          failed={isFailed}
        />

        {/* Action row — adapts to state */}
        <AnimatePresence mode="popLayout">
          {status === "approved" && gen?.image_url && (
            <motion.div
              key="approved-actions"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Link href="/brand/vault" className="flex-1">
                <Button className="w-full rounded-[var(--radius-button)] bg-[var(--color-primary)] font-700 text-[var(--color-primary-foreground)] shadow-sm hover:bg-[var(--color-primary)]/90">
                  View in vault
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a
                href={gen.image_url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
              >
                <Download className="size-4" />
                Download
              </a>
            </motion.div>
          )}

          {isFailed && (
            <motion.div
              key="failed-actions"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Link href="/brand/discover" className="flex-1">
                <Button className="w-full rounded-[var(--radius-button)] bg-[var(--color-primary)] font-700 text-[var(--color-primary-foreground)]">
                  Try another generation
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/brand/sessions" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full rounded-[var(--radius-button)] border-[var(--color-border)] bg-[var(--color-card)] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
                >
                  Back to sessions
                </Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fetch error banner */}
        <AnimatePresence>
          {fetchError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-blush)] px-4 py-3"
            >
              <AlertTriangle className="size-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-500">
                Couldn&apos;t fetch latest status. Retrying…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
