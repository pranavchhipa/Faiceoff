"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect shim for legacy creators whose DB row still says
 * `onboarding_step = "lora_review"`.
 *
 * Why this page still exists:
 *   The old pipeline trained a personalised LoRA adapter per creator and
 *   this page was the in-between step where we queued that training.
 *   The current pipeline (Nano Banana Pro / Gemini 3 Pro Image / Kontext
 *   Max — see `lib/ai/pipeline-router.ts`) uses the reference photos as
 *   face anchors directly at generation time, so no per-creator training
 *   is required. New creators skip this step entirely: `save-photos` now
 *   advances `onboarding_step` straight to `pricing`.
 *
 * Anyone still landing here is a creator who started onboarding under
 * the old flow. We silently bump them forward to `pricing` so they don't
 * get stuck.
 */
export default function LegacyLoraReviewRedirect() {
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;

    let cancelled = false;

    async function advance() {
      try {
        const res = await fetch("/api/onboarding/update-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "pricing" }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || "Failed to advance step");
        }

        if (!cancelled) router.replace("/dashboard/onboarding/pricing");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not advance to pricing",
          );
          didRedirectRef.current = false; // allow retry
        }
      }
    }

    advance();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="max-w-md text-center text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard/onboarding/pricing")}
          className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-2 text-sm font-600 text-white hover:opacity-90"
        >
          Continue to Pricing
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
    </div>
  );
}
