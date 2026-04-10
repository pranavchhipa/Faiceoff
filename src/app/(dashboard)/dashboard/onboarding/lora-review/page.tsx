"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cpu, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

export default function LoraReviewPage() {
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-blush)] px-3 py-1 text-xs font-600 text-[var(--color-ink)] mb-3">
          <Cpu className="size-3.5" />
          AI Model Training
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          LoRA model training
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Your personalised AI model is being prepared using your reference photos.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--color-lilac)]">
          <Loader2 className="size-7 text-[var(--color-ink)] animate-spin" />
        </div>
        <h3 className="text-lg font-700 text-[var(--color-ink)] mb-2">
          Training in progress
        </h3>
        <p className="text-sm text-[var(--color-neutral-500)] max-w-sm mx-auto mb-2">
          Your LoRA model training has been queued. This typically takes 15-30 minutes. You will be notified when it is ready.
        </p>
        <p className="text-xs text-[var(--color-neutral-400)] mb-6">
          You can continue with the remaining setup while training runs in the background.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <Button
          onClick={handleContinue}
          disabled={saving}
          className="bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
        >
          {saving ? (
            <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              Continue
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
