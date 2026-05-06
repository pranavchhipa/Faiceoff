"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, ShieldCheck, Trash2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

const CONSENT_VERSION = "DPDP-v1.0-2024";

const CONSENT_ITEMS = [
  {
    icon: Camera,
    color: "#818cf8",
    bg: "rgba(129,140,248,0.15)",
    title: "Face photos used only for approved campaigns",
  },
  {
    icon: CheckCircle2,
    color: "#4ade80",
    bg: "rgba(74,222,128,0.15)",
    title: "You approve every image before it's published",
  },
  {
    icon: ShieldCheck,
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.15)",
    title: "Revoke consent anytime from your settings",
  },
  {
    icon: Trash2,
    color: "#fb923c",
    bg: "rgba(251,146,60,0.15)",
    title: "Data deleted within 30 days on request",
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
      const saveRes = await fetch("/api/onboarding/save-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_version: CONSENT_VERSION }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error || "Failed to save consent");

      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "photos" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update step");

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
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="max-w-lg"
    >
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push("/dashboard/onboarding/compliance")}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Back
      </button>

      {/* Header */}
      <div className="mb-5">
        <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-secondary)] px-2.5 py-1 text-[11px] font-600 text-[var(--color-muted-foreground)] mb-2">
          <ShieldCheck className="size-3" />
          DPDP Act 2023
        </div>
        <h2 className="text-xl font-800 text-[var(--color-foreground)] mb-1">Biometric data consent</h2>
        <p className="text-[13px] text-[var(--color-muted-foreground)]">
          Required under Indian law before we process your face data.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Compact consent rows */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)] mb-5 overflow-hidden">
          {CONSENT_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: item.bg }}>
                  <Icon className="size-3.5" style={{ color: item.color }} strokeWidth={2} />
                </div>
                <p className="text-[13px] font-500 text-[var(--color-foreground)]">{item.title}</p>
              </div>
            );
          })}
        </div>

        {/* Agree checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none mb-5 group">
          <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
            agreed
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
              : "border-[var(--color-border)] bg-transparent group-hover:border-[var(--color-primary)]/50"
          }`}>
            {agreed && (
              <svg className="size-3 text-[var(--color-primary-foreground)]" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="sr-only"
            />
          </div>
          <span className="text-[13px] text-[var(--color-muted-foreground)] leading-relaxed">
            I agree to biometric data processing under the DPDP Act 2023.{" "}
            <span className="text-[11px] font-500 text-[var(--color-muted-foreground)]/60">v{CONSENT_VERSION}</span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500 mb-4">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={saving || !agreed}
          className="w-full sm:w-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 rounded-[var(--radius-button)] h-10 px-8 font-600 disabled:opacity-40"
        >
          {saving ? (
            <div className="size-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
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
