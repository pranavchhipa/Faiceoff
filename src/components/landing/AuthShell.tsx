"use client";

import { motion } from "framer-motion";
import Link from "next/link";

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

  return (
    <div className="landing-scope relative min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-70 pointer-events-none" />
      <div className="absolute inset-0 grain opacity-30 pointer-events-none" />

      <header className="relative z-10 px-4 md:px-8 py-5 md:py-6 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" aria-label="Faiceoff home" className="inline-flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo-dark.png" alt="Faiceoff" className="h-7 md:h-8 w-auto" />
        </Link>
        <Link
          href="/"
          className="text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to home
        </Link>
      </header>

      <main className="relative z-10 px-4 md:px-8 pb-16">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-12 items-stretch">
          {/* Form side */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
            className="relative rounded-3xl border border-border bg-card shadow-card-landing p-6 sm:p-8 md:p-12"
          >
            {eyebrow && (
              <p className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 md:mt-4 text-sm md:text-base text-muted-foreground max-w-md leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className="mt-7 md:mt-9">{children}</div>
          </motion.div>

          {/* Visual side */}
          {side && (
            <motion.aside
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
              className={`relative hidden lg:flex flex-col justify-between rounded-3xl border border-border ${tintBg} p-10 overflow-hidden`}
            >
              <motion.img
                src="/landing/logo-mark.png"
                alt=""
                aria-hidden
                className="absolute -right-16 -bottom-16 h-[420px] w-auto opacity-40"
                initial={{ rotate: -8, scale: 0.95 }}
                animate={{ rotate: [-8, -4, -8], scale: [0.95, 1, 0.95] }}
                transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-foreground/15 bg-background/50 backdrop-blur text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Faiceoff · Made in India
                </div>
                <h2 className="mt-8 font-display text-3xl xl:text-4xl font-bold leading-tight text-foreground max-w-sm">
                  {side.heading}
                </h2>
                <p className="mt-4 text-foreground/70 max-w-sm leading-relaxed">{side.body}</p>
              </div>
              <div className="relative grid grid-cols-3 gap-3">
                {["Consent first", "INR payouts", "DPDP compliant"].map((t, i) => (
                  <motion.div
                    key={t}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="px-3 py-2 rounded-xl bg-background/70 backdrop-blur border border-border text-[11px] font-medium text-foreground/80 text-center"
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
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}
