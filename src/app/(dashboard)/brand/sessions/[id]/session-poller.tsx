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
  ImageIcon,
  ArrowRight,
  AlertTriangle,
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
  { key: "compliance", label: "Compliance" },
  { key: "generation", label: "Generation" },
  { key: "safety", label: "Safety" },
  { key: "approval", label: "Approval" },
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
  bg: string;
  textColor: string;
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
        label: "Checking compliance...",
        bg: "bg-[var(--color-lilac)]",
        textColor: "text-[var(--color-foreground)]",
        icon: Shield,
        pulsing: true,
        terminal: false,
      };
    case "generating":
    case "pending_replicate":
    case "processing":
      return {
        label: "Generating image...",
        sublabel: "Typically takes 30–90 seconds",
        bg: "bg-[var(--color-lilac)]",
        textColor: "text-[var(--color-foreground)]",
        icon: Loader2,
        pulsing: true,
        terminal: false,
      };
    case "output_check":
    case "pending_safety":
      return {
        label: "Safety review...",
        bg: "bg-[var(--color-lilac)]",
        textColor: "text-[var(--color-foreground)]",
        icon: Shield,
        pulsing: true,
        terminal: false,
      };
    case "ready_for_approval":
    case "pending_approval":
      return {
        label: "Waiting for creator approval",
        bg: "bg-[var(--color-mint)]",
        textColor: "text-[var(--color-foreground)]",
        icon: Clock,
        pulsing: true,
        terminal: false,
      };
    case "approved":
      return {
        label: "Approved!",
        bg: "bg-[var(--color-primary)]",
        textColor: "text-white",
        icon: CheckCircle2,
        pulsing: false,
        terminal: true,
      };
    case "rejected":
      return {
        label: "Rejected",
        bg: "bg-[var(--color-blush)]",
        textColor: "text-red-700",
        icon: XCircle,
        pulsing: false,
        terminal: true,
      };
    case "failed":
      return {
        label: "Generation failed",
        bg: "bg-[var(--color-blush)]",
        textColor: "text-red-700",
        icon: AlertTriangle,
        pulsing: false,
        terminal: true,
      };
    default:
      return {
        label: "Processing...",
        bg: "bg-[var(--color-ocean)]",
        textColor: "text-[var(--color-foreground)]",
        icon: Loader2,
        pulsing: true,
        terminal: false,
      };
  }
}

/* ── Countdown timer ── */

function ApprovalCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function compute() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining("Expired");
        return;
      }
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      setRemaining(`${hours}h ${mins}m remaining`);
    }
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <span className="text-sm font-600 text-[var(--color-muted-foreground)]">{remaining}</span>
  );
}

/* ── Animated progress bar ── */

function ProgressBar({ currentStage }: { currentStage: number }) {
  return (
    <div className="flex items-center gap-0">
      {STAGES.map((stage, i) => {
        const past = i < currentStage;
        const active = i === currentStage;
        const future = i > currentStage;

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-none">
            {/* Dot */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                className={`relative flex size-3.5 items-center justify-center rounded-full ${
                  past || active
                    ? "bg-[var(--color-primary)]"
                    : "bg-[var(--color-border)]"
                }`}
                animate={active ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={
                  active
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : {}
                }
              >
                {active && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-[var(--color-primary)]/40"
                    animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
              </motion.div>
              <span
                className={`text-[10px] font-600 whitespace-nowrap ${
                  future
                    ? "text-[var(--color-neutral-300)]"
                    : "text-[var(--color-foreground)]"
                }`}
              >
                {stage.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STAGES.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                <motion.div
                  className="h-full bg-[var(--color-primary)] origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: past ? 1 : active ? 0.5 : 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
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
  const stageIndex = getStageIndex(status);
  const isTerminal = TERMINAL_STATUSES.has(status);

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

      // Stop polling when terminal
      if (TERMINAL_STATUSES.has(updated.status) && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch {
      setFetchError(true);
    }
  }, [generationId]);

  useEffect(() => {
    if (isTerminal) return; // no polling needed

    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStatus, isTerminal]);

  const brief = gen?.structured_brief ?? {};

  return (
    <div className="max-w-2xl mx-auto">
      {/* Big status badge */}
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className={`relative overflow-hidden rounded-[var(--radius-card)] p-6 sm:p-8 text-center mb-6 shadow-[var(--shadow-card)] ${cfg.bg}`}
      >
        {/* Pulse bg for non-terminal */}
        {cfg.pulsing && (
          <motion.div
            className="absolute inset-0 opacity-20"
            style={{ background: "radial-gradient(ellipse at center, white 0%, transparent 70%)" }}
            animate={{ opacity: [0.1, 0.25, 0.1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="relative z-10">
          <motion.div
            animate={cfg.pulsing ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={
              cfg.pulsing
                ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                : {}
            }
            className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/30"
          >
            <StatusIcon
              className={`size-7 ${cfg.textColor} ${
                status === "generating" || status === "pending_replicate"
                  ? "animate-spin"
                  : ""
              }`}
            />
          </motion.div>

          <h2 className={`text-xl sm:text-2xl font-800 tracking-tight mb-1 ${cfg.textColor}`}>
            {cfg.label}
          </h2>

          {cfg.sublabel && (
            <p className={`text-sm font-500 ${cfg.textColor} opacity-80`}>
              {cfg.sublabel}
            </p>
          )}

          {/* Approval countdown (when waiting for creator) */}
          {(status === "ready_for_approval" || status === "pending_approval") && gen?.updated_at && (
            <div className="mt-2">
              <ApprovalCountdown
                expiresAt={new Date(new Date(gen.updated_at).getTime() + 48 * 60 * 60 * 1000).toISOString()}
              />
            </div>
          )}

          {/* Approved — show vault CTA */}
          {status === "approved" && (
            <div className="mt-4 flex flex-col items-center gap-3">
              {gen?.image_url && (
                <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-white/40 shadow-[var(--shadow-elevated)] w-48 h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gen.image_url}
                    alt="Approved generation"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <Link href="/brand/vault">
                <Button className="rounded-[var(--radius-button)] bg-white text-[var(--color-primary)] font-700 hover:bg-white/90 shadow-sm">
                  View in vault
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* Rejected — reason note */}
          {status === "rejected" && (
            <p className="mt-2 text-sm font-500 text-red-600 opacity-90">
              Your credits have been refunded. No charges were applied.
            </p>
          )}
        </div>
      </motion.div>

      {/* Progress bar */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)] mb-6">
        <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-4">
          Pipeline stages
        </p>
        <ProgressBar currentStage={stageIndex} />
      </div>

      {/* Brief recap */}
      {(Object.keys(brief).length > 0 || gen?.assembled_prompt) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)]"
        >
          <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-3">
            Your brief
          </p>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {brief.product_name && (
              <div>
                <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-0.5">Product</p>
                <p className="font-600 text-[var(--color-foreground)]">{brief.product_name}</p>
              </div>
            )}
            {brief.scene && (
              <div>
                <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-0.5">Scene</p>
                <p className="text-[var(--color-foreground)]">{brief.scene}</p>
              </div>
            )}
            {brief.mood && (
              <div>
                <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-0.5">Mood</p>
                <p className="text-[var(--color-foreground)]">{brief.mood}</p>
              </div>
            )}
            {brief.scope && (
              <div>
                <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-0.5">Scope</p>
                <p className="text-[var(--color-foreground)]">{brief.scope}</p>
              </div>
            )}
          </div>

          {gen?.assembled_prompt && (
            <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
              <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-1.5">Assembled prompt</p>
              <p className="text-xs text-[var(--color-neutral-600)] leading-relaxed line-clamp-3">
                {gen.assembled_prompt}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Fetch error banner */}
      <AnimatePresence>
        {fetchError && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-4 flex items-center gap-2.5 rounded-[var(--radius-card)] border border-red-100 bg-red-50 px-4 py-3"
          >
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">
              Unable to fetch status. Retrying automatically...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No image placeholder when not yet generated */}
      {!gen?.image_url && status !== "approved" && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-neutral-50)] py-10">
          <ImageIcon className="size-8 text-[var(--color-neutral-300)]" />
          <p className="text-sm text-[var(--color-neutral-400)] font-500">
            Image will appear here once generated
          </p>
        </div>
      )}
    </div>
  );
}
