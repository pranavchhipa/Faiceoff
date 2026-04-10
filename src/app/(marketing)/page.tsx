"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const mistSwatches = [
  { name: "Blush", label: "Creator", color: "#f6dfe0", deep: "#f0cdd0" },
  { name: "Ocean", label: "Brand", color: "#d9e5f0", deep: "#c4d6e8" },
  { name: "Lilac", label: "Generation", color: "#e2dcef", deep: "#d0c7e3" },
  { name: "Mint", label: "Approval", color: "#daece0", deep: "#c3deca" },
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Hero Section ── */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-20 sm:pt-32">
        <motion.div
          className="flex flex-col items-center text-center"
          initial="initial"
          animate="animate"
          transition={{ staggerChildren: 0.12 }}
        >
          {/* Badge */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-4 py-1.5 text-xs font-500 text-[var(--color-neutral-600)]">
              Licensed AI likeness marketplace
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="mt-8 max-w-3xl font-[family-name:var(--font-display)] text-5xl font-800 leading-[1.08] tracking-tight text-[var(--color-ink)] sm:text-6xl lg:text-7xl"
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            A house for licensed likeness.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            className="mt-6 max-w-xl text-lg text-[var(--color-neutral-600)]"
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            Creators own their face. Brands get authentic, consented AI content.
            Every generation tracked, every rupee split fairly.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            className="mt-10 flex flex-col gap-4 sm:flex-row"
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Link
              href="/signup?role=creator"
              className="inline-flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-ink)] px-8 py-3.5 font-[family-name:var(--font-display)] text-sm font-600 text-[var(--color-background)] shadow-[var(--shadow-soft)] transition-opacity hover:opacity-90"
            >
              Join as Creator
            </Link>
            <Link
              href="/signup?role=brand"
              className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-[var(--color-neutral-300)] bg-[var(--color-background)] px-8 py-3.5 font-[family-name:var(--font-display)] text-sm font-600 text-[var(--color-ink)] shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--color-neutral-50)]"
            >
              Join as Brand
            </Link>
          </motion.div>
        </motion.div>

        {/* ── Journey Lane mist swatches ── */}
        <motion.div
          className="mt-24 flex flex-col items-center"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.6 }}
        >
          <p className="mb-6 font-[family-name:var(--font-display)] text-sm font-600 uppercase tracking-widest text-[var(--color-neutral-400)]">
            Four Journey Lanes
          </p>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {mistSwatches.map((swatch) => (
              <div key={swatch.name} className="flex flex-col items-center gap-3">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${swatch.color} 0%, ${swatch.deep} 100%)`,
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="font-[family-name:var(--font-display)] text-sm font-600 text-[var(--color-ink)]">
                    {swatch.name}
                  </p>
                  <p className="text-xs text-[var(--color-neutral-500)]">
                    {swatch.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── How it works (placeholder) ── */}
      <section
        id="how-it-works"
        className="border-t border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]"
      >
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-700 tracking-tight text-[var(--color-ink)]">
            How it works
          </h2>
          <p className="mt-4 text-[var(--color-neutral-500)]">
            Coming soon -- the full journey from onboarding to payout.
          </p>
        </div>
      </section>
    </div>
  );
}
