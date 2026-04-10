"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shirt,
  Sparkles,
  Dumbbell,
  UtensilsCrossed,
  Plane,
  Cpu,
  Clapperboard,
  GraduationCap,
  Heart,
  Briefcase,
  IndianRupee,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  { key: "fashion", label: "Fashion", icon: Shirt },
  { key: "beauty", label: "Beauty", icon: Sparkles },
  { key: "fitness", label: "Fitness", icon: Dumbbell },
  { key: "food", label: "Food", icon: UtensilsCrossed },
  { key: "travel", label: "Travel", icon: Plane },
  { key: "tech", label: "Tech", icon: Cpu },
  { key: "entertainment", label: "Entertainment", icon: Clapperboard },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "lifestyle", label: "Lifestyle", icon: Heart },
  { key: "business", label: "Business", icon: Briefcase },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function CategoriesPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<CategoryKey>>(new Set());
  const [prices, setPrices] = useState<Record<CategoryKey, string>>(
    {} as Record<CategoryKey, string>,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(key: CategoryKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setPrices((p) => {
          const copy = { ...p };
          delete copy[key];
          return copy;
        });
      } else if (next.size < 5) {
        next.add(key);
      }
      return next;
    });
  }

  function setPrice(key: CategoryKey, value: string) {
    setPrices((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || selected.size === 0) return;

    // Validate all selected categories have valid prices
    for (const cat of selected) {
      const priceVal = Number(prices[cat]);
      if (!priceVal || priceVal < 500) {
        setError(`Minimum price is 500 INR for ${cat}`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const categoriesPayload = Array.from(selected).map((cat) => ({
        category: cat,
        price_paise: Math.round(Number(prices[cat]) * 100),
      }));

      const res = await fetch("/api/onboarding/save-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: categoriesPayload }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save categories");
      }

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
          <Heart className="size-3.5" />
          Your Niche
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Pick your categories
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Choose 1-5 categories that best describe your content. Set a per-generation price for each.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Category grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {CATEGORIES.map(({ key, label, icon: Icon }) => {
            const isSelected = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                className={`
                  flex flex-col items-center gap-2 rounded-[var(--radius-card)] border p-4 transition-all cursor-pointer
                  ${
                    isSelected
                      ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 shadow-[var(--shadow-card)]"
                      : "border-[var(--color-neutral-200)] bg-white hover:border-[var(--color-neutral-300)] hover:shadow-[var(--shadow-soft)]"
                  }
                  ${!isSelected && selected.size >= 5 ? "opacity-40 cursor-not-allowed" : ""}
                `}
              >
                <Icon
                  className={`size-5 ${
                    isSelected
                      ? "text-[var(--color-gold)]"
                      : "text-[var(--color-neutral-400)]"
                  }`}
                />
                <span
                  className={`text-xs font-600 ${
                    isSelected
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-neutral-500)]"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Price inputs for selected categories */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 mb-6 overflow-hidden"
            >
              <div className="border-t border-[var(--color-neutral-200)] pt-6">
                <h3 className="text-sm font-600 text-[var(--color-ink)] mb-4">
                  Set your price per generation
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from(selected).map((cat) => {
                    const catInfo = CATEGORIES.find((c) => c.key === cat);
                    return (
                      <div key={cat} className="space-y-1.5">
                        <Label htmlFor={`price-${cat}`} className="text-xs">
                          {catInfo?.label}
                        </Label>
                        <div className="relative">
                          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-neutral-400)]" />
                          <Input
                            id={`price-${cat}`}
                            type="number"
                            min={500}
                            step={1}
                            required
                            placeholder="Min 500"
                            value={prices[cat] ?? ""}
                            onChange={(e) => setPrice(cat, e.target.value)}
                            className="pl-8 rounded-[var(--radius-input)]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-[var(--color-neutral-400)] mb-4">
          {selected.size}/5 categories selected
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={saving || selected.size === 0}
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
