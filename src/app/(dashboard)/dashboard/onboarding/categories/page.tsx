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
  X,
  Plus,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  {
    key: "fashion",
    label: "Fashion",
    icon: Shirt,
    subs: ["Streetwear", "Ethnic", "Casual", "Formal", "Luxury", "Activewear", "Accessories"],
  },
  {
    key: "beauty",
    label: "Beauty",
    icon: Sparkles,
    subs: ["Skincare", "Makeup", "Haircare", "Fragrance", "Nails", "Men's Grooming"],
  },
  {
    key: "fitness",
    label: "Fitness",
    icon: Dumbbell,
    subs: ["Gym", "Yoga", "Running", "CrossFit", "Supplements", "Athleisure"],
  },
  {
    key: "food",
    label: "Food",
    icon: UtensilsCrossed,
    subs: ["Street Food", "Home Cooking", "Baking", "Vegan", "Restaurant", "Healthy Eating"],
  },
  {
    key: "travel",
    label: "Travel",
    icon: Plane,
    subs: ["Adventure", "Luxury Travel", "Budget Travel", "Solo Travel", "Hotels", "Road Trips"],
  },
  {
    key: "tech",
    label: "Tech",
    icon: Cpu,
    subs: ["Smartphones", "Laptops", "Gadgets", "Gaming", "Software", "AI/ML"],
  },
  {
    key: "entertainment",
    label: "Entertainment",
    icon: Clapperboard,
    subs: ["Music", "Movies", "Comedy", "Dance", "Podcasts", "Streaming"],
  },
  {
    key: "education",
    label: "Education",
    icon: GraduationCap,
    subs: ["EdTech", "Study Tips", "Career", "Languages", "Finance", "Skills"],
  },
  {
    key: "lifestyle",
    label: "Lifestyle",
    icon: Heart,
    subs: ["Home Decor", "Wellness", "Parenting", "Relationships", "Minimalism", "Pets"],
  },
  {
    key: "business",
    label: "Business",
    icon: Briefcase,
    subs: ["Startups", "Marketing", "SaaS", "E-commerce", "Personal Brand", "Freelancing"],
  },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function CategoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<CategoryKey>>(new Set());
  const [subcategories, setSubcategories] = useState<Record<string, Set<string>>>({});
  const [prices, setPrices] = useState<Record<CategoryKey, string>>({} as Record<CategoryKey, string>);
  const [customSub, setCustomSub] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(key: CategoryKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setPrices((p) => { const c = { ...p }; delete c[key]; return c; });
        setSubcategories((s) => { const c = { ...s }; delete c[key]; return c; });
      } else if (next.size < 5) {
        next.add(key);
        setSubcategories((s) => ({ ...s, [key]: new Set<string>() }));
      }
      return next;
    });
  }

  function toggleSub(catKey: string, sub: string) {
    setSubcategories((prev) => {
      const current = new Set(prev[catKey] ?? []);
      if (current.has(sub)) {
        current.delete(sub);
      } else if (current.size < 20) {
        current.add(sub);
      }
      return { ...prev, [catKey]: current };
    });
  }

  function addCustomSub(catKey: string) {
    const val = (customSub[catKey] ?? "").trim();
    if (!val) return;
    toggleSub(catKey, val);
    setCustomSub((p) => ({ ...p, [catKey]: "" }));
  }

  function setPrice(key: CategoryKey, value: string) {
    setPrices((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || selected.size === 0) return;

    for (const cat of selected) {
      const priceVal = Number(prices[cat]);
      if (!priceVal || priceVal < 500) {
        setError(`Minimum price is ₹500 for ${cat}`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const categoriesPayload = Array.from(selected).map((cat) => ({
        category: cat,
        subcategories: Array.from(subcategories[cat] ?? []),
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
          Choose 1-5 categories, pick subcategories, and set a per-generation price for each.
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
                  ${isSelected
                    ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 shadow-[var(--shadow-card)]"
                    : "border-[var(--color-neutral-200)] bg-white hover:border-[var(--color-neutral-300)] hover:shadow-[var(--shadow-soft)]"
                  }
                  ${!isSelected && selected.size >= 5 ? "opacity-40 cursor-not-allowed" : ""}
                `}
              >
                <Icon className={`size-5 ${isSelected ? "text-[var(--color-gold)]" : "text-[var(--color-neutral-400)]"}`} />
                <span className={`text-xs font-600 ${isSelected ? "text-[var(--color-ink)]" : "text-[var(--color-neutral-500)]"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Subcategories + Pricing for selected */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 mb-6 overflow-hidden"
            >
              <div className="border-t border-[var(--color-neutral-200)] pt-6 space-y-5">
                {Array.from(selected).map((catKey) => {
                  const catInfo = CATEGORIES.find((c) => c.key === catKey)!;
                  const selectedSubs = subcategories[catKey] ?? new Set<string>();
                  const presets = [500, 1000, 2000, 5000];
                  const currentPrice = prices[catKey] ?? "";
                  const isCustomPrice = currentPrice !== "" && !presets.includes(Number(currentPrice));

                  return (
                    <div key={catKey} className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 space-y-4">
                      {/* Category header */}
                      <div className="flex items-center gap-2">
                        <catInfo.icon className="size-4 text-[var(--color-gold)]" />
                        <p className="text-sm font-700 text-[var(--color-ink)] capitalize">{catInfo.label}</p>
                      </div>

                      {/* Subcategories */}
                      <div>
                        <p className="text-xs font-600 text-[var(--color-neutral-500)] mb-2">
                          Subcategories <span className="font-400 text-[var(--color-neutral-400)]">({selectedSubs.size} selected)</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {catInfo.subs.map((sub) => {
                            const isOn = selectedSubs.has(sub);
                            return (
                              <button
                                key={sub}
                                type="button"
                                onClick={() => toggleSub(catKey, sub)}
                                className={`rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-500 transition-all ${
                                  isOn
                                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                                    : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-600)] hover:border-[var(--color-neutral-300)]"
                                }`}
                              >
                                {sub}
                                {isOn && <X className="ml-1 inline size-3" />}
                              </button>
                            );
                          })}
                          {/* Custom subcategory chips */}
                          {Array.from(selectedSubs).filter((s) => !catInfo.subs.includes(s as never)).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleSub(catKey, s)}
                              className="rounded-[var(--radius-pill)] border border-[var(--color-ink)] bg-[var(--color-ink)] px-3 py-1.5 text-xs font-500 text-white"
                            >
                              {s} <X className="ml-1 inline size-3" />
                            </button>
                          ))}
                        </div>
                        {/* Add custom subcategory */}
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            placeholder="Add custom..."
                            maxLength={50}
                            value={customSub[catKey] ?? ""}
                            onChange={(e) => setCustomSub((p) => ({ ...p, [catKey]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSub(catKey); } }}
                            className="h-8 w-40 rounded-[var(--radius-pill)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-3 text-xs outline-none focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20"
                          />
                          <button
                            type="button"
                            onClick={() => addCustomSub(catKey)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-neutral-200)] text-[var(--color-neutral-500)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Pricing */}
                      <div>
                        <p className="text-xs font-600 text-[var(--color-neutral-500)] mb-2">Price per generation</p>
                        <div className="flex flex-wrap gap-2">
                          {presets.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPrice(catKey, String(p))}
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
                              value={isCustomPrice ? currentPrice : ""}
                              onChange={(e) => setPrice(catKey, e.target.value)}
                              className={`h-[38px] w-28 rounded-[var(--radius-pill)] border pl-7 pr-3 text-sm outline-none transition-all ${
                                isCustomPrice
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
                    </div>
                  );
                })}
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
