"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Scale, ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

const CONSENT_VERSION = "DPDP-v1.0-2024";

const CONSENT_ITEMS = [
  {
    title: "Biometric Data Collection",
    description:
      "We collect and process your facial biometric data (reference photos) to train a personalised AI model (LoRA) that generates content featuring your likeness.",
  },
  {
    title: "Usage Rights",
    description:
      "Generated content using your likeness will only be produced for campaigns you have explicitly approved. You retain the right to revoke consent at any time.",
  },
  {
    title: "90-Day KYC Retention",
    description:
      "Your identity verification documents (KYC) are retained for 90 days as required by applicable regulations, after which they are permanently deleted.",
  },
  {
    title: "30-Day Deletion SLA",
    description:
      "Upon request for data deletion, all your biometric data, reference photos, and trained models will be permanently removed within 30 calendar days.",
  },
];

export default function ConsentPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !agreed) return;

    setSaving(true);
    setError(null);

    try {
      // Save consent via server API (bypasses RLS)
      const saveRes = await fetch("/api/onboarding/save-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_version: CONSENT_VERSION }),
      });

      if (!saveRes.ok) {
        const body = await saveRes.json();
        throw new Error(body.error || "Failed to save consent");
      }

      // Advance step
      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "photos" }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update step");
      }

      router.push("/dashboard/onboarding/photos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
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
          <Scale className="size-3.5" />
          DPDP Act 2023
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Biometric data consent
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Under the Digital Personal Data Protection Act 2023, we require your explicit consent before processing biometric data.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Consent items */}
        <div className="space-y-4 mb-6">
          {CONSENT_ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5"
            >
              <h4 className="text-sm font-700 text-[var(--color-ink)] mb-1.5">
                {item.title}
              </h4>
              <p className="text-sm text-[var(--color-neutral-500)] leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Version stamp */}
        <div className="flex items-center gap-2 mb-6 px-1">
          <ShieldCheck className="size-4 text-[var(--color-neutral-400)]" />
          <span className="text-xs font-500 text-[var(--color-neutral-400)]">
            Consent version: {CONSENT_VERSION}
          </span>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-4 cursor-pointer mb-6 select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 rounded border-[var(--color-neutral-300)] accent-[var(--color-gold)]"
          />
          <span className="text-sm text-[var(--color-ink)] leading-relaxed">
            I have read and agree to the biometric data processing terms under the
            Digital Personal Data Protection Act 2023 (DPDP Act).
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={saving || !agreed}
          className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600 disabled:opacity-40"
        >
          {saving ? (
            <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              I Agree & Continue
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}
