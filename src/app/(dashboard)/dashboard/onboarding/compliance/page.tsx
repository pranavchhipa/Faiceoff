"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, X, Plus, Ban, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

const PRESET_BLOCKED = [
  "Nudity",
  "Alcohol",
  "Tobacco",
  "Gambling",
  "Political Content",
  "Violence",
  "Drugs",
  "Religious Sensitivity",
  "Weapons",
  "Adult Content",
  "Hate Speech",
  "Cryptocurrency",
  "Competitive Brands",
  "Fake News",
  "Body Shaming",
] as const;

export default function CompliancePage() {
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleConcept(concept: string) {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) {
        next.delete(concept);
      } else if (next.size < 50) {
        next.add(concept);
      }
      return next;
    });
  }

  function addCustom() {
    const val = customInput.trim();
    if (!val || blocked.size >= 50) return;
    setBlocked((prev) => new Set(prev).add(val));
    setCustomInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (blocked.size === 0) {
      setError("Select at least one content restriction");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/save-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked_concepts: Array.from(blocked) }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save compliance preferences");
      }

      router.push("/dashboard/onboarding/consent");
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

  const customConcepts = Array.from(blocked).filter(
    (b) => !PRESET_BLOCKED.includes(b as (typeof PRESET_BLOCKED)[number]),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-blush)] px-3 py-1 text-xs font-600 text-[var(--color-ink)] mb-3">
          <Shield className="size-3.5" />
          Compliance Preferences
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Set your content boundaries
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Choose topics and content types you <span className="font-600 text-[var(--color-ink)]">don't</span> want your likeness associated with.
          Brands will be blocked from generating content involving these concepts.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 p-4 mb-6">
          <AlertTriangle className="size-4 shrink-0 text-[var(--color-gold)] mt-0.5" />
          <div>
            <p className="text-sm font-600 text-[var(--color-ink)] mb-0.5">Why this matters</p>
            <p className="text-xs text-[var(--color-neutral-500)]">
              During generation, every brand prompt is checked against your blocked concepts using AI similarity matching.
              If a prompt is too close to any blocked concept, the generation is automatically rejected — protecting your image.
            </p>
          </div>
        </div>

        {/* Preset blocked concepts */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Ban className="size-4 text-red-500" />
            <p className="text-sm font-700 text-[var(--color-ink)]">I don't want my face used with...</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_BLOCKED.map((concept) => {
              const isOn = blocked.has(concept);
              return (
                <button
                  key={concept}
                  type="button"
                  onClick={() => toggleConcept(concept)}
                  className={`rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-500 transition-all ${
                    isOn
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-600)] hover:border-[var(--color-neutral-300)]"
                  }`}
                >
                  {isOn && <X className="mr-1 inline size-3" />}
                  {concept}
                </button>
              );
            })}
          </div>

          {/* Custom blocked concepts */}
          <AnimatePresence>
            {customConcepts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 pt-3 border-t border-[var(--color-neutral-100)]"
              >
                <p className="text-xs font-600 text-[var(--color-neutral-500)] mb-2">Your custom restrictions</p>
                <div className="flex flex-wrap gap-2">
                  {customConcepts.map((concept) => (
                    <button
                      key={concept}
                      type="button"
                      onClick={() => toggleConcept(concept)}
                      className="rounded-[var(--radius-pill)] border border-red-400 bg-red-50 px-3 py-1.5 text-xs font-500 text-red-700"
                    >
                      <X className="mr-1 inline size-3" />
                      {concept}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add custom */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Add custom restriction..."
              maxLength={100}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              className="h-8 w-full sm:w-56 rounded-[var(--radius-pill)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-3 text-xs outline-none focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20"
            />
            <button
              type="button"
              onClick={addCustom}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-neutral-200)] text-[var(--color-neutral-500)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--color-neutral-400)] mb-4">
          {blocked.size}/50 restrictions set — you can update these anytime from your dashboard settings.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={saving || blocked.size === 0}
            className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
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
      </form>
    </motion.div>
  );
}
