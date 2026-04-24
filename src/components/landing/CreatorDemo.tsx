"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check, X, IndianRupee } from "lucide-react";

const requests = [
  { id: "nike",        brand: "Nike India",       category: "Sportswear", color: "from-orange-400 to-pink-500", emoji: "👟", img: "/landing/product-sneaker.jpg", payout: 2500 },
  { id: "oneplus",     brand: "OnePlus",           category: "Tech",       color: "from-red-500 to-rose-600",    emoji: "📱", img: "/landing/product-phone.jpg",   payout: 3200 },
  { id: "minimalist",  brand: "The Minimalist",    category: "Skincare",   color: "from-amber-400 to-orange-500",emoji: "🧴", img: "/landing/product-skincare.jpg",payout: 1800 },
] as const;

export function CreatorDemo() {
  const [visible, setVisible] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [earnings, setEarnings] = useState(0);
  const [approved, setApproved] = useState<string[]>([]);

  useEffect(() => {
    requests.forEach((r, i) => {
      setTimeout(() => setVisible((v) => (v.includes(r.id) ? v : [...v, r.id])), 400 + i * 500);
    });
  }, []);

  const current = requests.find((r) => r.id === openId);

  const decide = (approve: boolean) => {
    if (!current) return;
    if (approve) {
      setEarnings((e) => e + current.payout);
      setApproved((a) => [...a, current.id]);
    }
    setOpenId(null);
  };

  return (
    <div className="relative rounded-3xl border border-border/60 bg-card p-6 md:p-10 shadow-card-landing overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
      <div className="relative grid md:grid-cols-[1fr_1.2fr] gap-8 items-start">
        {/* Creator side */}
        <div className="relative">
          <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/creator-face.jpg" alt="Creator" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-mono">
              You · Priya
            </div>
          </div>

          {/* Earnings counter */}
          <motion.div
            className="mt-4 p-4 rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow"
            animate={{ scale: earnings > 0 ? [1, 1.04, 1] : 1 }}
            key={earnings}
            transition={{ duration: 0.4 }}
          >
            <div className="text-xs font-medium opacity-80">Wallet balance</div>
            <div className="font-display text-3xl font-bold flex items-center gap-1">
              <IndianRupee size={24} strokeWidth={2.5} />
              <motion.span
                key={earnings}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
              >
                {earnings.toLocaleString("en-IN")}
              </motion.span>
            </div>
            <div className="text-xs opacity-80 mt-1">Withdraw to bank anytime</div>
          </motion.div>
        </div>

        {/* Requests side */}
        <div>
          <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-widest">
            Try it · Tap a request
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-bold mb-6 leading-tight">
            Brands ask. <span className="text-gradient-primary">You decide.</span> Money lands.
          </h3>

          <div className="space-y-3 min-h-[280px]">
            <AnimatePresence>
              {requests.map(
                (r) =>
                  visible.includes(r.id) &&
                  !approved.includes(r.id) && (
                    <motion.button
                      key={r.id}
                      layout
                      initial={{ opacity: 0, x: 30, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -100, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 200, damping: 22 }}
                      whileHover={{ x: -4 }}
                      onClick={() => setOpenId(r.id)}
                      className="w-full text-left p-4 rounded-2xl border border-border bg-secondary/50 hover:border-primary/60 transition-colors flex items-center gap-4"
                    >
                      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${r.color} grid place-items-center text-2xl shrink-0`}>
                        {r.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{r.brand}</div>
                        <div className="text-xs text-muted-foreground">{r.category} · wants 1 image</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display font-bold text-base">₹{r.payout.toLocaleString("en-IN")}</div>
                        <div className="text-[10px] text-muted-foreground">REVIEW →</div>
                      </div>
                    </motion.button>
                  ),
              )}
            </AnimatePresence>

            {approved.length === requests.length && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-2xl border border-success/40 bg-tint-success text-center text-foreground"
              >
                <div className="text-3xl mb-2">🎉</div>
                <div className="font-semibold">All done. ₹{earnings.toLocaleString("en-IN")} added to wallet.</div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {current && (
          <motion.div
            className="absolute inset-0 z-20 grid place-items-center p-4 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-card border border-border overflow-hidden shadow-card-landing"
            >
              <div className="p-4 flex items-center gap-3 border-b border-border">
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${current.color} grid place-items-center text-xl`}>
                  {current.emoji}
                </div>
                <div>
                  <div className="font-semibold text-sm">{current.brand}</div>
                  <div className="text-xs text-muted-foreground">Generated · awaiting your approval</div>
                </div>
              </div>
              <div className="aspect-[4/5] bg-secondary overflow-hidden">
                <motion.img
                  src={current.img}
                  alt={current.brand}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6 }}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => decide(false)}
                  className="py-3 rounded-xl border border-border font-semibold flex items-center justify-center gap-2 hover:bg-secondary"
                >
                  <X size={16} /> Reject
                </button>
                <button
                  onClick={() => decide(true)}
                  className="py-3 rounded-xl bg-tint-success border border-success/50 text-foreground font-semibold flex items-center justify-center gap-2 hover:shadow-glow transition-shadow"
                >
                  <Check size={16} /> Approve · ₹{current.payout.toLocaleString("en-IN")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
