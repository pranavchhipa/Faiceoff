"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { CREATOR_PRIYA, PRIYA_COMPOSITES, WATERMARK_MASK } from "./images";

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
    id: "audio",
    emoji: "🎧",
    label: "Audio",
    thumb: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80&auto=format&fit=crop",
    hero: PRIYA_COMPOSITES.food,
    prompt: "Priya wearing wireless headphones, warm desk lamp light, work-from-home moment",
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
    <div
      className="relative rounded-3xl p-6 md:p-10 overflow-hidden"
      style={{
        background: "var(--lp-paper)",
        border: "1px solid var(--lp-border)",
        boxShadow: "var(--shadow-card-landing)",
      }}
    >
      {/* Subtle gold glow overlay (replaces the old hero gradient) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(201,169,110,0.10), transparent 60%)",
        }}
      />

      <div className="relative grid md:grid-cols-2 gap-8 items-center">
        {/* Image stage */}
        <div
          className="relative aspect-[4/5] rounded-2xl overflow-hidden"
          style={{ background: "var(--lp-paper-2)" }}
        >
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
              style={WATERMARK_MASK}
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
                  className="absolute left-0 right-0 h-1/3 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent, rgba(201,169,110,0.55), transparent)",
                  }}
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "rgba(251,247,238,0.18)",
                    backdropFilter: "blur(1px)",
                  }}
                />
              </>
            )}
          </AnimatePresence>

          {/* Top-left status chips */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div
              className="px-2.5 py-1 rounded-md text-xs"
              style={{
                background: "rgba(251,247,238,0.92)",
                color: "var(--lp-ink)",
                border: "1px solid var(--lp-border)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--lp-gold-deep)" }}>●</span>{" "}
              {current ? "GENERATED" : "REFERENCE"}
            </div>
            <div
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{
                background: "rgba(251,247,238,0.92)",
                color: "var(--lp-ink)",
                border: "1px solid var(--lp-border)",
              }}
            >
              Priya · ₹2,500/gen
            </div>
          </div>

          {/* Top-right AI watermark (only when a composite is showing) */}
          {current && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm"
              style={{
                background: "var(--lp-ink)",
                color: "var(--lp-paper)",
              }}
            >
              <Wand2 size={10} />
              AI · FAICEOFF
            </motion.div>
          )}

          {/* Bottom status strip */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div
              className="px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 flex-1 min-w-0"
              style={{
                background: "rgba(251,247,238,0.92)",
                color: "var(--lp-ink)",
                border: "1px solid var(--lp-border)",
              }}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin shrink-0" />
              ) : (
                <Sparkles
                  size={12}
                  className="shrink-0"
                  style={{ color: "var(--lp-gold-deep)" }}
                />
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
          <p
            className="lp-eyebrow mb-3"
            style={{ color: "var(--lp-gold-deep)" }}
          >
            Try it · Tap a product
          </p>
          <h3
            className="text-2xl md:text-3xl mb-6 leading-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--lp-ink)",
            }}
          >
            Pick a product.{" "}
            <span style={{ fontStyle: "italic", fontWeight: 400 }}>
              See it come alive.
            </span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => {
              const isActive = active === p.id;
              return (
                <motion.button
                  key={p.id}
                  onClick={() => pick(p.id)}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  className="group relative overflow-hidden text-left p-3 rounded-xl transition-colors"
                  style={{
                    background: isActive
                      ? "var(--lp-gold-tint)"
                      : "var(--lp-paper-2)",
                    border: `1px solid ${
                      isActive ? "var(--lp-gold)" : "var(--lp-border)"
                    }`,
                    boxShadow: isActive
                      ? "0 0 0 2px rgba(201,169,110,0.18)"
                      : "none",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0"
                      style={{ background: "var(--lp-paper-3)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb}
                        alt={p.label}
                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-110"
                        style={WATERMARK_MASK}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{p.emoji}</span>
                        <div
                          className="font-semibold text-sm"
                          style={{ color: "var(--lp-ink)" }}
                        >
                          {p.label}
                        </div>
                      </div>
                      <div
                        className="text-[11px] mt-0.5 truncate"
                        style={{ color: "var(--lp-muted)" }}
                      >
                        {p.prompt.split(",")[0]}
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: "var(--lp-ink)",
                        color: "var(--lp-paper)",
                      }}
                    >
                      ACTIVE
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Brief preview — feels like a real campaign card */}
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mt-4 rounded-xl overflow-hidden"
                style={{
                  background: "var(--lp-paper)",
                  border: "1px solid var(--lp-border)",
                }}
              >
                <div
                  className="flex items-center gap-2 px-3.5 py-2"
                  style={{
                    background: "var(--lp-paper-2)",
                    borderBottom: "1px solid var(--lp-border)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--lp-gold-deep)" }}
                  />
                  <span
                    className="text-[10px]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--lp-muted)",
                    }}
                  >
                    Campaign brief
                  </span>
                </div>
                <p
                  className="px-3.5 py-3 text-sm leading-relaxed"
                  style={{ color: "var(--lp-ink-soft)" }}
                >
                  {current.prompt}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* "Generate" CTA — fully styled with new lp-btn-primary visual.
              Reuses the existing pick() so the user sees the morph if they
              haven't already picked. If a product is already active, this
              acts as a re-roll. */}
          <button
            type="button"
            onClick={() =>
              pick(current ? current.id : products[0].id)
            }
            disabled={loading}
            className="mt-5 lp-btn-primary"
            style={{
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {current ? "Generate again" : "Generate image"}
              </>
            )}
          </button>

          <div
            className="mt-6 p-4 rounded-xl text-xs leading-relaxed"
            style={{
              background: "var(--lp-paper-2)",
              border: "1px solid var(--lp-border)",
              color: "var(--lp-muted)",
            }}
          >
            <span
              className="font-semibold"
              style={{ color: "var(--lp-ink)" }}
            >
              No shoot. No model fees.
            </span>{" "}
            Wallet charged ₹2,500. GST invoice auto-generated. Image lands in
            your vault after creator approval.
          </div>
        </div>
      </div>
    </div>
  );
}
