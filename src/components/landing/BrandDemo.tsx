"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { CREATOR_PRIYA, PRIYA_COMPOSITES } from "./images";

// Each product has:
//  - thumb: realistic product photo (for the picker tile)
//  - hero:  realistic "Priya with this product" composite (what the demo pretends AI generated)
//  - prompt: the natural-language brief a brand would submit
const products = [
  {
    id: "sneaker",
    emoji: "👟",
    label: "Sneakers",
    thumb: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80&auto=format&fit=crop",
    hero: PRIYA_COMPOSITES.sneaker,
    prompt: "Priya wearing white sneakers, soft pink studio backdrop, editorial fashion shot",
  },
  {
    id: "phone",
    emoji: "📱",
    label: "Phone",
    thumb: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80&auto=format&fit=crop",
    hero: PRIYA_COMPOSITES.phone,
    prompt: "Priya holding the new phone, neon blue rim light, urban night scene",
  },
  {
    id: "skincare",
    emoji: "🧴",
    label: "Skincare",
    thumb: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&q=80&auto=format&fit=crop",
    hero: PRIYA_COMPOSITES.skincare,
    prompt: "Priya applying serum, peach morning light, close-up beauty shot",
  },
  {
    id: "food",
    emoji: "☕",
    label: "Café",
    thumb: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80&auto=format&fit=crop",
    hero: PRIYA_COMPOSITES.food,
    prompt: "Priya enjoying morning coffee, warm sunlit café, candid lifestyle frame",
  },
] as const;

export function BrandDemo() {
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const current = products.find((p) => p.id === active) ?? null;

  const pick = (id: string) => {
    if (id === active || loading) return;
    setLoading(true);
    setActive(id);
    // Simulate the "AI is generating" pause
    setTimeout(() => setLoading(false), 900);
  };

  const displayImg = current?.hero ?? CREATOR_PRIYA;

  return (
    <div className="relative rounded-3xl border border-border/60 bg-card p-6 md:p-10 shadow-card-landing overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
      <div className="relative grid md:grid-cols-2 gap-8 items-center">
        {/* Image stage */}
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-secondary">
          <AnimatePresence mode="wait">
            <motion.img
              key={current?.id ?? "base"}
              src={displayImg}
              alt={current ? `Priya — ${current.label}` : "Priya — reference"}
              initial={{ opacity: 0, scale: 1.05, filter: "blur(18px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>

          {/* Scanline animation while "generating" */}
          <AnimatePresence>
            {loading && (
              <>
                <motion.div
                  initial={{ y: "-10%", opacity: 0 }}
                  animate={{ y: "110%", opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-accent/50 to-transparent pointer-events-none"
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-background/10 backdrop-blur-[1px] pointer-events-none"
                />
              </>
            )}
          </AnimatePresence>

          {/* Top-left status chips */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-md bg-background/85 backdrop-blur text-xs font-mono">
              <span className="text-accent">●</span> {current ? "GENERATED" : "REFERENCE"}
            </div>
            <div className="px-2.5 py-1 rounded-md bg-background/85 backdrop-blur text-xs font-medium">
              Priya · ₹2,500/gen
            </div>
          </div>

          {/* Top-right AI watermark (only when a composite is showing) */}
          {current && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute top-3 right-3 px-2 py-1 rounded-md bg-primary/90 text-primary-foreground text-[10px] font-bold flex items-center gap-1 shadow-sm"
            >
              <Wand2 size={10} />
              AI · FAICEOFF
            </motion.div>
          )}

          {/* Bottom status strip */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div className="px-2.5 py-1.5 rounded-md bg-background/85 backdrop-blur text-xs flex items-center gap-1.5 flex-1 min-w-0">
              {loading ? (
                <Loader2 size={12} className="animate-spin shrink-0" />
              ) : (
                <Sparkles size={12} className="text-accent shrink-0" />
              )}
              <span className="truncate">
                {loading
                  ? "Generating with Priya's licensed likeness…"
                  : current
                  ? "Awaiting creator approval · 48h window"
                  : "Pick a product →"}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div>
          <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-widest">
            Try it · Tap a product
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-bold mb-6 leading-tight">
            Same creator. Any campaign.{" "}
            <span className="text-gradient-primary">Generated in seconds.</span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <motion.button
                key={p.id}
                onClick={() => pick(p.id)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className={`group relative overflow-hidden text-left p-3 rounded-xl border transition-colors ${
                  active === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/50 hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumb}
                      alt={p.label}
                      className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{p.emoji}</span>
                      <div className="font-semibold text-sm">{p.label}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {p.prompt.split(",")[0]}
                    </div>
                  </div>
                </div>

                {active === p.id && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold"
                  >
                    ACTIVE
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          {/* Prompt preview — makes the demo feel like a real generation */}
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mt-4 px-3 py-2 rounded-lg bg-background/60 border border-border/60 text-[11px] font-mono text-muted-foreground"
              >
                <span className="text-accent">prompt →</span> {current.prompt}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 p-4 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">No shoot. No model fees.</span>{" "}
            Wallet charged ₹2,500. GST invoice auto-generated. Image lands in your vault after
            creator approval.
          </div>
        </div>
      </div>
    </div>
  );
}
