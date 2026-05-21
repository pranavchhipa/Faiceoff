"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CREATORS } from "./images";
import { Logo } from "@/components/brand/logo";

const SIDE_PHOTOS: Record<"creator" | "brand" | "success", { src: string; label: string }> = {
  creator: CREATORS.priya,
  brand:   CREATORS.arjun,
  success: CREATORS.meera,
};

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  side,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  side?: { tint: "creator" | "brand" | "success"; heading: string; body: string };
}) {
  const tintBg =
    side?.tint === "creator"
      ? "bg-tint-creator"
      : side?.tint === "brand"
        ? "bg-tint-brand"
        : "bg-tint-success";

  const photo = side ? SIDE_PHOTOS[side.tint] : null;

  return (
    <div className="landing-scope relative min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-70 pointer-events-none" />
      <div className="absolute inset-0 grain opacity-30 pointer-events-none" />

      <header className="relative z-10 px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" aria-label="Faiceoff home" className="inline-flex items-center">
          <Logo variant="full" tone="dark" className="h-7 w-auto" />
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to home
        </Link>
      </header>

      <main className="relative z-10 px-4 md:px-8 pb-12">
        <div className="mx-auto max-w-5xl grid lg:grid-cols-[1fr_0.9fr] gap-6 lg:gap-10 items-start">
          {/* Form side */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
            className="relative rounded-2xl border border-border bg-card shadow-card-landing p-6 sm:p-8"
          >
            {eyebrow && (
              <p className="text-[10px] font-mono uppercase tracking-widest text-primary mb-2">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className="mt-6">{children}</div>
          </motion.div>

          {/* Visual side */}
          {side && (
            <motion.aside
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
              className={`relative hidden lg:flex flex-col justify-between rounded-2xl border border-border ${tintBg} p-8 overflow-hidden`}
              style={{ minHeight: "480px" }}
            >
              {/* Subtle watermark */}
              <motion.img
                src="/logo-mark.png"
                alt=""
                aria-hidden
                className="absolute -right-16 -bottom-16 h-[260px] w-auto opacity-10 pointer-events-none"
                initial={{ rotate: -8, scale: 0.95 }}
                animate={{ rotate: [-8, -4, -8], scale: [0.95, 1, 0.95] }}
                transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Top text */}
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-foreground/15 bg-background/50 backdrop-blur text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Faiceoff · Made in India
                </div>
                <h2 className="mt-5 font-display text-xl xl:text-2xl font-bold leading-tight text-foreground max-w-[220px]">
                  {side.heading}
                </h2>
                <p className="mt-2 text-sm text-foreground/70 max-w-[220px] leading-relaxed">{side.body}</p>
              </div>

              {/* Creator photo */}
              {photo && (
                <div className="relative flex items-center justify-center py-4 flex-1">
                  <div className="relative">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                      className="relative w-36 xl:w-44 rounded-2xl overflow-hidden border-2 border-white/25 shadow-card-landing"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.src}
                        alt=""
                        aria-hidden
                        loading="eager"
                        className="w-full aspect-[3/4] object-cover object-top"
                        style={{ transform: "scale(1.06)", transformOrigin: "50% 0%" }}
                      />
                      <div className="absolute inset-x-0 bottom-0 px-3 py-2.5 bg-gradient-to-t from-black/60 via-black/20 to-transparent">
                        <span className="text-[10px] font-mono text-white/95 tracking-wide">{photo.label}</span>
                      </div>
                    </motion.div>

                    {/* Earnings badge */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      transition={{ delay: 0.65, type: "spring", stiffness: 260, damping: 20 }}
                      className="absolute -right-10 top-6 px-2.5 py-1.5 rounded-xl bg-card border border-border shadow-card flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      <span className="text-xs font-mono font-semibold">+₹2,500</span>
                    </motion.div>

                  </div>
                </div>
              )}

              {/* Trust badges */}
              <div className="relative grid grid-cols-3 gap-2">
                {["Consent first", "INR payouts", "DPDP compliant"].map((t, i) => (
                  <motion.div
                    key={t}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 + i * 0.1 }}
                    className="px-2 py-1.5 rounded-lg bg-background/70 backdrop-blur border border-border text-[10px] font-medium text-foreground/80 text-center leading-tight"
                  >
                    {t}
                  </motion.div>
                ))}
              </div>
            </motion.aside>
          )}
        </div>
      </main>
    </div>
  );
}

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-600 text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}
