"use client";

// home-demo.tsx — small interactive carousel for the brand demo section.
// Cycles three (creator portrait + product thumb → AI composite) pairs every
// ~3.5s with a soft cross-fade. Lives next to page.tsx so the marketing
// home page can stay a server component everywhere else.

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  CREATOR_PRIYA,
  CREATOR_ARJUN,
  PRIYA_COMPOSITES,
  ARJUN_COMPOSITES,
  WATERMARK_MASK,
} from "@/components/landing/images";

type DemoSlide = {
  creator: string;
  creatorName: string;
  product: string;
  productLabel: string;
  composite: string;
  caption: string;
};

const SLIDES: DemoSlide[] = [
  {
    creator: CREATOR_PRIYA,
    creatorName: "Priya · Mumbai",
    product: PRIYA_COMPOSITES.sneaker,
    productLabel: "Streetwear sneaker",
    composite: PRIYA_COMPOSITES.sneaker,
    caption: "Athleisure Co. · Spring drop hero",
  },
  {
    creator: CREATOR_PRIYA,
    creatorName: "Priya · Mumbai",
    product: PRIYA_COMPOSITES.skincare,
    productLabel: "Skincare serum",
    composite: PRIYA_COMPOSITES.skincare,
    caption: "Skin Co. · Performance ad set",
  },
  {
    creator: CREATOR_ARJUN,
    creatorName: "Arjun · Bengaluru",
    product: ARJUN_COMPOSITES.smartwatch,
    productLabel: "Smartwatch GT",
    composite: ARJUN_COMPOSITES.smartwatch,
    caption: "Tech Co. · Festival launch",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function HomeBrandDemo() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((n) => (n + 1) % SLIDES.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[index];

  return (
    <div
      className="relative grid lg:grid-cols-[1fr_1.05fr] gap-0 overflow-hidden"
      style={{
        background: "var(--lp-paper)",
        border: "1px solid var(--lp-border)",
        borderRadius: 22,
        boxShadow: "var(--shadow-card-landing)",
      }}
    >
      {/* ── LEFT: inputs (creator portrait + product thumbs row) ─────── */}
      <div
        className="relative p-6 md:p-8 flex flex-col gap-5"
        style={{ background: "var(--lp-paper-2)" }}
      >
        <div className="flex items-center gap-2">
          <span className="lp-pill lp-pill-gold">Step 1 · Inputs</span>
        </div>

        {/* creator portrait card */}
        <div
          className="relative overflow-hidden rounded-2xl aspect-[4/5] w-full"
          style={{ border: "1px solid var(--lp-border)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`creator-${index}`}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease }}
              className="absolute inset-0"
            >
              <Image
                src={slide.creator}
                alt={slide.creatorName}
                fill
                sizes="(max-width: 1024px) 90vw, 480px"
                className="object-cover"
                style={WATERMARK_MASK}
                unoptimized
              />
            </motion.div>
          </AnimatePresence>

          {/* tag */}
          <div
            className="absolute left-3 bottom-3 px-3 py-1.5 rounded-full text-[11px] font-semibold"
            style={{
              fontFamily: "var(--font-mono)",
              background: "rgba(26,20,16,0.78)",
              color: "var(--lp-paper)",
              letterSpacing: "0.06em",
            }}
          >
            {slide.creatorName}
          </div>
        </div>

        {/* product thumb row */}
        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={`thumb-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${s.productLabel}`}
              className="relative overflow-hidden rounded-xl flex-1 aspect-square transition-all"
              style={{
                border:
                  i === index
                    ? "2px solid var(--lp-ink)"
                    : "1px solid var(--lp-border)",
                opacity: i === index ? 1 : 0.6,
              }}
            >
              <Image
                src={s.product}
                alt={s.productLabel}
                fill
                sizes="160px"
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>

        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--lp-muted)", fontFamily: "var(--font-mono)" }}
        >
          Faiceoff AI maps the creator's licensed face to your product brief —
          delivered in minutes, not days.
        </p>
      </div>

      {/* ── RIGHT: AI output composite ──────────────────────────────── */}
      <div className="relative p-6 md:p-8 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <span className="lp-pill lp-pill-emerald">
            <Sparkles className="h-3 w-3" /> Step 2 · AI output
          </span>
          <span
            className="text-[11px]"
            style={{
              color: "var(--lp-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
            }}
          >
            CREATOR-APPROVED
          </span>
        </div>

        <div
          className="relative overflow-hidden rounded-2xl aspect-[4/5] w-full"
          style={{ border: "1px solid var(--lp-border)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`comp-${index}`}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease }}
              className="absolute inset-0"
            >
              <Image
                src={slide.composite}
                alt={slide.caption}
                fill
                sizes="(max-width: 1024px) 90vw, 520px"
                className="object-cover"
                style={WATERMARK_MASK}
                unoptimized
              />
            </motion.div>
          </AnimatePresence>

          {/* watermark badge */}
          <div
            className="absolute right-3 top-3 px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "var(--lp-ink)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--lp-emerald)" }}
            />
            FAICEOFF · AI
          </div>

          {/* caption */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`cap-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
              className="absolute left-3 bottom-3 right-3 px-3 py-2 rounded-xl"
              style={{
                background: "rgba(26,20,16,0.78)",
                color: "var(--lp-paper)",
              }}
            >
              <div
                className="text-[10px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.1em",
                  opacity: 0.7,
                }}
              >
                CAMPAIGN
              </div>
              <div className="text-[13px] font-semibold">{slide.caption}</div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* dot indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={`dot-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === index ? 22 : 6,
                  background:
                    i === index
                      ? "var(--lp-ink)"
                      : "var(--lp-border-strong)",
                }}
              />
            ))}
          </div>
          <span
            className="text-[11px]"
            style={{
              color: "var(--lp-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
            }}
          >
            {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
