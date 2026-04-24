"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

const products = [
  { id: "sneaker", emoji: "👟", label: "Sneakers", img: "/landing/product-sneaker.jpg", prompt: "holding white sneakers, pink studio" },
  { id: "phone",   emoji: "📱", label: "Phone",    img: "/landing/product-phone.jpg",   prompt: "with the new phone, neon blue light" },
  { id: "skincare",emoji: "🧴", label: "Skincare", img: "/landing/product-skincare.jpg",prompt: "applying serum, peach studio" },
  { id: "food",    emoji: "🍔", label: "Food",     img: "/landing/product-food.jpg",    prompt: "enjoying a burger, sunny yellow" },
] as const;

export function BrandDemo() {
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const current = products.find((p) => p.id === active) ?? null;

  const pick = (id: string) => {
    if (id === active) return;
    setLoading(true);
    setActive(id);
    setTimeout(() => setLoading(false), 700);
  };

  return (
    <div className="relative rounded-3xl border border-border/60 bg-card p-6 md:p-10 shadow-card-landing overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
      <div className="relative grid md:grid-cols-2 gap-8 items-center">
        {/* Image stage */}
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-secondary">
          <AnimatePresence mode="wait">
            <motion.img
              key={current?.id ?? "base"}
              src={current?.img ?? "/landing/creator-face.jpg"}
              alt="AI generated"
              initial={{ opacity: 0, scale: 1.05, filter: "blur(20px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>

          {/* Scanline */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ y: "-10%", opacity: 0 }}
                animate={{ y: "110%", opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeInOut" }}
                className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-accent/40 to-transparent pointer-events-none"
              />
            )}
          </AnimatePresence>

          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-mono">
              <span className="text-accent">●</span> LIVE
            </div>
            <div className="px-2.5 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-medium">
              Priya · ₹2,500/gen
            </div>
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="px-2.5 py-1.5 rounded-md bg-background/80 backdrop-blur text-xs flex items-center gap-1.5">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-accent" />}
              {loading ? "Generating…" : current ? "Awaiting creator approval" : "Pick a product →"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div>
          <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-widest">
            Try it · Tap a product
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-bold mb-6 leading-tight">
            Same creator. Any campaign. <span className="text-gradient-primary">Generated in seconds.</span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <motion.button
                key={p.id}
                onClick={() => pick(p.id)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className={`relative text-left p-4 rounded-xl border transition-colors ${
                  active === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/50 hover:border-primary/50"
                }`}
              >
                <div className="text-2xl mb-1.5">{p.emoji}</div>
                <div className="font-semibold text-sm">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.prompt.split(",")[0]}</div>
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

          <div className="mt-6 p-4 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">No shoot. No model fees.</span> Wallet charged ₹2,500.
            GST invoice auto-generated. Image lands in your vault after creator approval.
          </div>
        </div>
      </div>
    </div>
  );
}
