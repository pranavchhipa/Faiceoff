"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Shirt, Sparkles, Dumbbell, UtensilsCrossed, Plane,
  Cpu, Clapperboard, GraduationCap, Heart, Briefcase,
  ArrowRight, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { key: "fashion",       label: "Fashion",       icon: Shirt,          color: { bg: "rgba(244,114,182,0.15)", icon: "#f472b6" } },
  { key: "beauty",        label: "Beauty",        icon: Sparkles,       color: { bg: "rgba(192,132,252,0.15)", icon: "#c084fc" } },
  { key: "fitness",       label: "Fitness",       icon: Dumbbell,       color: { bg: "rgba(251,146,60,0.15)",  icon: "#fb923c" } },
  { key: "food",          label: "Food",          icon: UtensilsCrossed,color: { bg: "rgba(74,222,128,0.15)",  icon: "#4ade80" } },
  { key: "travel",        label: "Travel",        icon: Plane,          color: { bg: "rgba(56,189,248,0.15)",  icon: "#38bdf8" } },
  { key: "tech",          label: "Tech",          icon: Cpu,            color: { bg: "rgba(129,140,248,0.15)", icon: "#818cf8" } },
  { key: "entertainment", label: "Entertainment", icon: Clapperboard,   color: { bg: "rgba(248,113,113,0.15)", icon: "#f87171" } },
  { key: "education",     label: "Education",     icon: GraduationCap,  color: { bg: "rgba(251,191,36,0.15)",  icon: "#fbbf24" } },
  { key: "lifestyle",     label: "Lifestyle",     icon: Heart,          color: { bg: "rgba(45,212,191,0.15)",  icon: "#2dd4bf" } },
  { key: "business",      label: "Business",      icon: Briefcase,      color: { bg: "rgba(148,163,184,0.15)", icon: "#94a3b8" } },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function CategoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<CategoryKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(key: CategoryKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 5) next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Save categories with empty subcategories + 0 price — pricing step fills price later
      const categoriesPayload = Array.from(selected).map((cat) => ({
        category: cat,
        subcategories: [],
        price_paise: 0,
      }));
      const res = await fetch("/api/onboarding/save-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: categoriesPayload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      router.push("/dashboard/onboarding/compliance");
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
    >
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/dashboard/onboarding/instagram")}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <h2 className="text-xl font-800 text-[var(--color-foreground)] mb-1">Pick your categories</h2>
        <p className="text-[13px] text-[var(--color-muted-foreground)]">
          Choose up to 5 that best describe your content.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Category grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
          {CATEGORIES.map(({ key, label, icon: Icon, color }) => {
            const isSelected = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                disabled={!isSelected && selected.size >= 5}
                className={`flex flex-col items-center gap-2 rounded-xl border py-3 px-2 transition-all
                  ${isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30"
                    : "border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-secondary)]"
                  }
                  ${!isSelected && selected.size >= 5 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <div className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: color.bg }}>
                  <Icon className="size-4" style={{ color: color.icon }} strokeWidth={2} />
                </div>
                <span className={`text-[11px] font-600 ${isSelected ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
          {selected.size}/5 selected
        </p>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500 mb-4">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={saving || selected.size === 0}
            className="w-full sm:w-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 rounded-[var(--radius-button)] h-11 px-8 font-600"
          >
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
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
