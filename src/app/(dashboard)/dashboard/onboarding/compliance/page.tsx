"use client";

/**
 * Onboarding · Content rules.
 *
 * Creator picks the categories they'll NEVER appear in. These write to
 * `creator_blocked_categories` — the table the live 3-layer compliance check
 * reads — so the choice actually gates generation (keyword + LLM layers).
 *
 * Constrained to the 9 enforceable categories the detector understands.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShieldOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Wine,
  Cigarette,
  Dices,
  Landmark,
  Church,
  EyeOff,
  Crosshair,
  Coins,
  Pill,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

// value MUST match the enforceable Category enum (category-mapping.ts).
const CATEGORIES = [
  { value: "alcohol", label: "Alcohol", desc: "Beer, wine, spirits, bars", icon: Wine },
  { value: "tobacco", label: "Tobacco & vaping", desc: "Cigarettes, vapes, hookah", icon: Cigarette },
  { value: "gambling", label: "Gambling & betting", desc: "Casinos, fantasy, betting apps", icon: Dices },
  { value: "political", label: "Political", desc: "Parties, candidates, campaigns", icon: Landmark },
  { value: "religious", label: "Religious", desc: "Faith, rituals, religious brands", icon: Church },
  { value: "adult", label: "Adult / 18+", desc: "Suggestive or explicit themes", icon: EyeOff },
  { value: "gun", label: "Weapons", desc: "Firearms, ammunition", icon: Crosshair },
  { value: "crypto", label: "Crypto & trading", desc: "Tokens, exchanges, day-trading", icon: Coins },
  { value: "drugs", label: "Drugs & pharma", desc: "Recreational drugs, prescription", icon: Pill },
] as const;

export default function CompliancePage() {
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/save-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: Array.from(blocked) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
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
        <Loader2 className="size-6 animate-spin text-[var(--color-muted-foreground)]" />
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
      <button
        type="button"
        onClick={() => router.push("/dashboard/onboarding/categories")}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="size-3.5" /> Back
      </button>

      <div className="mb-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-secondary)] px-2.5 py-1 text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <ShieldOff className="size-3" />
          Content rules
        </div>
        <h2 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
          What should your face never promote?
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
          Tap any category you want{" "}
          <span className="font-700 text-[var(--color-foreground)]">blocked</span>. Brands
          can never generate that content with your likeness — we enforce it on every
          prompt. Leave all off if you&apos;re open to everything.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {CATEGORIES.map(({ value, label, desc, icon: Icon }) => {
            const on = blocked.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(value)}
                className={`group flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                  on
                    ? "border-rose-500/50 bg-rose-500/8"
                    : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/30"
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    on
                      ? "bg-rose-500/15 text-rose-500"
                      : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                    {label}
                  </p>
                  <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                    {desc}
                  </p>
                </div>
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    on
                      ? "border-rose-500 bg-rose-500 text-white"
                      : "border-[var(--color-border)] bg-[var(--color-card)] group-hover:border-[var(--color-primary)]/40"
                  }`}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mb-4 text-[12px] text-[var(--color-muted-foreground)]">
          {blocked.size === 0
            ? "Nothing blocked — you're open to all categories."
            : `${blocked.size} ${blocked.size === 1 ? "category" : "categories"} blocked.`}{" "}
          You can change this anytime from your dashboard.
        </p>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-8 font-700 text-[var(--color-primary-foreground)] transition-all hover:-translate-y-0.5 disabled:opacity-40 sm:w-auto"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Continue
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
