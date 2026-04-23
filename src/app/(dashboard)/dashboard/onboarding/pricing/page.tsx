"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IndianRupee, ArrowRight, Tag, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

interface CategoryRow {
  id: string;
  category: string;
  price_per_generation_paise: number;
}

export default function PricingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function fetchCategories() {
      const res = await fetch("/api/onboarding/get-pricing");

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const { categories: cats } = await res.json();

      if (cats && cats.length > 0) {
        setCategories(cats);
        const priceMap: Record<string, string> = {};
        for (const cat of cats) {
          priceMap[cat.id] = String(cat.price_per_generation_paise / 100);
        }
        setPrices(priceMap);
      }

      setLoading(false);
    }

    fetchCategories();
  }, [user, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    // Validate
    for (const cat of categories) {
      const val = Number(prices[cat.id]);
      if (!val || val < 500) {
        setError(`Minimum price is 500 INR for ${cat.category}`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // Build prices map: category ID -> paise value
      const pricesInPaise: Record<string, number> = {};
      for (const cat of categories) {
        pricesInPaise[cat.id] = Math.round(Number(prices[cat.id]) * 100);
      }

      // Save pricing via server API (bypasses RLS)
      const saveRes = await fetch("/api/onboarding/save-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: pricesInPaise }),
      });

      if (!saveRes.ok) {
        const body = await saveRes.json();
        throw new Error(body.error || "Failed to save pricing");
      }

      // Advance step to complete
      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "complete" }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update step");
      }

      router.push("/dashboard/onboarding/complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
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
          <Tag className="size-3.5" />
          Pricing
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Review your pricing
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Final check on your per-generation prices. You can always update these from your dashboard later.
        </p>
      </div>

      {/* Scope / exclusivity uplift explainer */}
      <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-blush)]/40 p-4">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--color-ink)]" />
          <div className="text-xs leading-relaxed text-[var(--color-ink)]">
            <p className="font-700 mb-1">You earn more on bigger licenses</p>
            <p className="text-[var(--color-neutral-600)]">
              Your base price is what brands pay for digital-only use. Print
              add-ons earn you <span className="font-600">+₹500</span>, packaging
              earns <span className="font-600">+₹1,000</span>, and exclusive
              licenses add <span className="font-600">+50%</span> on top — all
              applied automatically at generation time.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {categories.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 text-center mb-6">
            <p className="text-sm text-[var(--color-neutral-500)]">
              No categories found. You may have skipped the categories step.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {categories.map((cat) => {
              const presets = [500, 1000, 2000, 5000];
              const currentPrice = prices[cat.id] ?? "";
              const isCustom = currentPrice !== "" && !presets.includes(Number(currentPrice));
              return (
                <div
                  key={cat.id}
                  className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4"
                >
                  <p className="text-sm font-600 text-[var(--color-ink)] capitalize mb-3">
                    {cat.category}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrices((prev) => ({ ...prev, [cat.id]: String(p) }))}
                        className={`rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-500 transition-all ${
                          Number(currentPrice) === p
                            ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-white shadow-[var(--shadow-soft)]"
                            : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-600)] hover:border-[var(--color-neutral-300)]"
                        }`}
                      >
                        <span className="font-600">{p >= 1000 ? `${p / 1000}K` : p}</span>
                      </button>
                    ))}
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-[var(--color-neutral-400)]" />
                      <input
                        type="number"
                        min={500}
                        step={100}
                        placeholder="Custom"
                        value={isCustom ? currentPrice : ""}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        className={`h-[38px] w-28 rounded-[var(--radius-pill)] border pl-7 pr-3 text-sm outline-none transition-all ${
                          isCustom
                            ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 text-[var(--color-ink)] font-600"
                            : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-600)]"
                        } focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20`}
                      />
                    </div>
                  </div>
                  {currentPrice && (
                    <p className="mt-2 text-xs text-[var(--color-neutral-400)]">
                      Brands pay <span className="font-600 text-[var(--color-ink)]">{Number(currentPrice).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</span> per generation
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={saving || categories.length === 0}
            className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
          >
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Finish Setup
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
