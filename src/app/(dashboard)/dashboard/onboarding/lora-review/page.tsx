"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Cpu,
  ArrowRight,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

type TrainingStatus = "queued" | "training" | "completed" | "failed";

const STATUS_CONFIG: Record<
  TrainingStatus,
  { icon: typeof Loader2; label: string; color: string; bgColor: string }
> = {
  queued: {
    icon: Clock,
    label: "Queued",
    color: "text-[var(--color-gold)]",
    bgColor: "bg-[var(--color-gold)]/10",
  },
  training: {
    icon: Loader2,
    label: "Training",
    color: "text-[var(--color-gold)]",
    bgColor: "bg-[var(--color-lilac)]",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-600",
    bgColor: "bg-[var(--color-mint)]",
  },
  failed: {
    icon: AlertTriangle,
    label: "Failed",
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
};

export default function LoraReviewPage() {
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [queueing, setQueueing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queue LoRA training on mount
  useEffect(() => {
    async function queueTraining() {
      try {
        const res = await fetch("/api/onboarding/queue-training", {
          method: "POST",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error || "Failed to queue training",
          );
        }

        const data = (await res.json()) as { training_status: TrainingStatus };
        setStatus(data.training_status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setQueueing(false);
      }
    }

    queueTraining();
  }, []);

  async function handleContinue() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "pricing" }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to advance step");
      }

      router.push("/dashboard/onboarding/pricing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  if (authLoading || queueing) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  const config = status ? STATUS_CONFIG[status] : STATUS_CONFIG.queued;
  const StatusIcon = config.icon;
  const isActive = status === "queued" || status === "training";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-lilac)] px-3 py-1 text-xs font-600 text-[var(--color-ink)] mb-3">
          <Cpu className="size-3.5" />
          AI Model Training
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          LoRA model training
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Your personalised AI model is being prepared using your reference
          photos.
        </p>
      </div>

      {/* Training status card */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`flex size-10 items-center justify-center rounded-full ${config.bgColor}`}
          >
            <StatusIcon
              className={`size-5 ${config.color} ${isActive ? "animate-spin" : ""}`}
            />
          </div>
          <div>
            <p className="text-sm font-700 text-[var(--color-ink)]">
              Status: {config.label}
            </p>
            <p className="text-xs text-[var(--color-neutral-400)]">
              {status === "queued" && "Waiting in queue to start training"}
              {status === "training" && "Model is actively being trained"}
              {status === "completed" && "Training complete — ready for review"}
              {status === "failed" &&
                "Training failed — our team has been notified"}
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-3 pl-5 border-l-2 border-[var(--color-neutral-200)] ml-3">
          <div className="relative pl-4">
            <div className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-[var(--color-gold)]" />
            <p className="text-xs font-600 text-[var(--color-ink)]">
              Photos uploaded
            </p>
            <p className="text-xs text-[var(--color-neutral-400)]">
              Your reference photos are ready
            </p>
          </div>
          <div className="relative pl-4">
            <div
              className={`absolute -left-[1.4rem] top-1 size-3 rounded-full ${isActive ? "bg-[var(--color-gold)] animate-pulse" : status === "completed" ? "bg-[var(--color-gold)]" : "bg-red-400"}`}
            />
            <p className="text-xs font-600 text-[var(--color-ink)]">
              LoRA training {isActive ? "in progress" : status === "completed" ? "completed" : "failed"}
            </p>
            <p className="text-xs text-[var(--color-neutral-400)]">
              {isActive
                ? "Typically takes 15-30 minutes via Replicate"
                : status === "completed"
                  ? "Model trained successfully"
                  : "Will be retried automatically"}
            </p>
          </div>
          <div className="relative pl-4">
            <div
              className={`absolute -left-[1.4rem] top-1 size-3 rounded-full ${status === "completed" ? "bg-[var(--color-neutral-300)]" : "bg-[var(--color-neutral-200)]"}`}
            />
            <p className="text-xs font-600 text-[var(--color-neutral-400)]">
              Sample generation & review
            </p>
            <p className="text-xs text-[var(--color-neutral-400)]">
              Review AI-generated samples before going live
            </p>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-lilac)] bg-[var(--color-lilac)]/10 p-4 mb-6">
        <Sparkles className="size-4 shrink-0 text-[var(--color-ink)] mt-0.5" />
        <div>
          <p className="text-sm font-600 text-[var(--color-ink)] mb-0.5">
            What happens next?
          </p>
          <p className="text-xs text-[var(--color-neutral-500)] leading-relaxed">
            Once training completes, we'll generate sample images using your
            LoRA model. You'll review these samples and approve your model before
            any brand can use it. You can continue setting up pricing while
            training runs in the background.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="pt-2">
        <Button
          onClick={handleContinue}
          disabled={saving}
          className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
        >
          {saving ? (
            <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              Continue to Pricing
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
