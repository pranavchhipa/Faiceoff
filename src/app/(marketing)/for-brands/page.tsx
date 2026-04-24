"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, FileCheck2, Wallet, Users, PenLine,
  Sparkles, ShieldCheck, Download, Receipt,
  Clock, FileText,
} from "lucide-react";
import { BrandDemo } from "@/components/landing/BrandDemo";
import { PRIYA_COMPOSITES } from "@/components/landing/images";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" } as const,
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export default function BrandsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">

      {/* Hero */}
      <section className="relative pt-32 md:pt-36 pb-16 md:pb-24 px-4 md:px-5">
        <div className="absolute inset-0 bg-tint-brand/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-xs font-mono tracking-[0.18em] uppercase text-accent mb-7"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              For Brands
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[1.02]"
            >
              Skip the shoot. <br />
              <span className="text-gradient-primary">Ship the campaign.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="mt-6 md:mt-7 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              Browse verified Indian creators. Describe the shot. Get an AI-generated image
              using their licensed face — with full usage rights and a GST invoice. In under 48 hours.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="mt-8 md:mt-9 flex flex-col sm:flex-row flex-wrap gap-3"
            >
              <Link
                href="/auth/signup/brand"
                className="group w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
              >
                Sign up as a Brand <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/for-creators" className="w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl border border-border bg-secondary/40 backdrop-blur font-semibold inline-flex items-center gap-2 hover:bg-secondary">
                I&apos;m a creator instead
              </Link>
            </motion.div>

            {/* quick stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-10 grid grid-cols-3 gap-4 max-w-md"
            >
              {[
                { v: "₹2,500", l: "Per image" },
                { v: "5", l: "Free gens" },
                { v: "<48h", l: "End to end" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-display text-2xl md:text-3xl font-extrabold text-accent leading-none">{s.v}</div>
                  <div className="mt-1 text-[10px] font-mono tracking-widest uppercase text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </motion.div>

            {/* trust chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-10 grid grid-cols-2 gap-2 max-w-md"
            >
              {[
                "KYC-verified creators",
                "Full commercial rights",
                "Auto GST invoice",
                "48h creator approval",
              ].map((s) => (
                <div key={s} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-[11px]">
                  <ShieldCheck size={13} className="text-primary shrink-0" />
                  <span className="truncate">{s}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: hero visual stack */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
            className="relative"
          >
            <BrandHeroStack />
          </motion.div>
        </div>
      </section>

      {/* Demo */}
      <section className="px-4 md:px-5 py-12 md:py-16">
        <div className="mx-auto max-w-7xl">
          <motion.div {...fadeUp} className="max-w-2xl mb-10">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">Live preview</p>
            <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] sm:leading-[1.05]">
              One creator. Every campaign. Tap to try.
            </h2>
          </motion.div>
          <motion.div {...fadeUp}>
            <BrandDemo />
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="px-4 md:px-5 py-20 md:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div {...fadeUp} className="max-w-2xl mb-12 md:mb-14">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">The flow</p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              From brief to <span className="text-gradient-primary">billboard.</span>
            </h2>
          </motion.div>
          <Steps
            items={[
              { icon: FileCheck2, t: "Sign up",          d: "GST and KYC verification. We onboard your brand in one business day." },
              { icon: Wallet,     t: "Add INR credits",  d: "Top up your wallet via UPI, cards, or net banking." },
              { icon: Users,      t: "Browse creators",  d: "Filter verified Indian creators by category, region, follower count." },
              { icon: PenLine,    t: "Describe the shot",d: "Pick a creator. Type the brief — product, mood, setting, lighting." },
              { icon: Sparkles,   t: "AI generates",     d: "Image is created using their licensed AI face in seconds." },
              { icon: ShieldCheck,t: "Creator approves", d: "They have 48 hours to approve. Auto-refund if rejected." },
              { icon: Download,   t: "Land in vault",    d: "Download high-res. Full commercial usage rights included." },
              { icon: Receipt,    t: "Auto GST invoice", d: "Invoice generated, TDS handled, ready for your accounts team." },
            ]}
          />
        </div>
      </section>

      {/* Compare */}
      <section className="px-4 md:px-5 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div {...fadeUp} className="max-w-2xl mb-12">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">The difference</p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              A traditional shoot <span className="text-gradient-primary">vs</span> Faiceoff.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5">
            <motion.div {...fadeUp} className="p-7 md:p-8 rounded-3xl border border-border bg-card">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Traditional shoot</div>
              <div className="font-display text-3xl md:text-4xl font-bold mb-1">Weeks of work</div>
              <div className="text-sm text-muted-foreground mb-6">For a single campaign</div>
              <ul className="space-y-3 text-sm">
                {["Planning, scouting, scheduling", "Studio + crew + stylists", "Model fees & call sheets", "Usage rights negotiated each time", "Reshoots cost extra"].map((x) => (
                  <li key={x} className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {x}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div {...fadeUp} className="p-7 md:p-8 rounded-3xl border border-primary/40 bg-tint-brand relative overflow-hidden shadow-glow">
              <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full blur-3xl opacity-40 bg-primary" />
              <div className="relative">
                <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">Faiceoff</div>
                <div className="font-display text-3xl md:text-4xl font-bold mb-1 text-gradient-primary">Days, not weeks</div>
                <div className="text-sm text-muted-foreground mb-6">Pay per generation, in INR</div>
                <ul className="space-y-3 text-sm">
                  {["Up to 48 hours start to finish", "Zero crew, zero logistics", "Pay per generation", "Full commercial rights included", "Re-generate anytime"].map((x) => (
                    <li key={x} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-5 py-20 md:py-24">
        <motion.div
          {...fadeUp}
          className="relative mx-auto max-w-7xl rounded-3xl overflow-hidden border border-border bg-tint-brand p-8 md:p-20 text-center"
        >
          <div className="absolute inset-0 bg-gradient-hero opacity-60" />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tighter leading-tight md:leading-none">
              Your next campaign <br />
              ships <span className="text-gradient-primary">this week.</span>
            </h2>
            <Link
              href="/auth/signup/brand"
              className="mt-8 md:mt-10 px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
            >
              Sign up as a Brand <ArrowRight size={18} />
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BrandHeroStack — right-side hero visual for /for-brands
   Shows the brand's perspective: the brief composer flowing into the
   delivered creative, with a floating GST invoice + "delivered in 1h"
   chip. Tells the whole value prop at a glance.
   ═══════════════════════════════════════════════════════════════════════ */
function BrandHeroStack() {
  return (
    <div className="relative">
      {/* Main delivered creative */}
      <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-border bg-card shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PRIYA_COMPOSITES.sneaker}
          alt="Priya with sneakers — AI generated"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Delivered chip */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-md bg-background/75 backdrop-blur-md border border-border/80 text-xs font-mono tracking-[0.15em] uppercase flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Delivered · 47s
        </div>

        {/* AI watermark */}
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-mono tracking-[0.15em] font-bold shadow-lg shadow-primary/30">
          AI · FAICEOFF
        </div>

        {/* bottom caption */}
        <div className="absolute bottom-4 left-4 right-4 p-4 rounded-xl bg-background/75 backdrop-blur-md border border-border/60">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-tight truncate">Nike India</div>
              <div className="text-xs text-muted-foreground font-mono tracking-wider uppercase mt-1 truncate">
                Monsoon Sneaker Drop · Priya
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Cost</div>
              <div className="font-display font-bold text-accent">₹2,500</div>
              <div className="text-[9px] text-muted-foreground">incl. GST</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating: brief composer */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1, type: "spring", stiffness: 220, damping: 22 }}
        className="hidden sm:block absolute -left-5 lg:-left-8 top-12 w-64 p-4 rounded-2xl bg-card border border-border shadow-glow"
      >
        <div className="flex items-center gap-2 mb-3">
          <PenLine size={14} className="text-accent" />
          <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Your brief</div>
          <div className="ml-auto text-[10px] font-mono text-accent">● AI</div>
        </div>
        <div className="text-xs font-mono leading-relaxed text-foreground/90">
          <span className="text-accent">&gt;</span> Priya wearing white sneakers, soft pink backdrop, editorial shot
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
          <Sparkles size={12} className="text-accent" />
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
            Generating<span className="text-accent">...</span>
          </div>
          <div className="ml-auto text-[10px] font-mono text-muted-foreground">47s</div>
        </div>
      </motion.div>

      {/* Floating: GST invoice mini */}
      <motion.div
        initial={{ opacity: 0, x: 20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.25, type: "spring", stiffness: 220, damping: 22 }}
        className="hidden sm:block absolute -right-5 lg:-right-8 -bottom-6 w-60 p-4 rounded-2xl bg-card border border-border shadow-glow"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <FileText size={14} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-sm">GST Invoice</div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">Auto-generated</div>
          </div>
          <Download size={14} className="text-accent" />
        </div>
        <div className="space-y-1.5 text-[11px] font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base</span>
            <span>₹2,119</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST (18%)</span>
            <span>₹381</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-border">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-accent">₹2,500</span>
          </div>
        </div>
      </motion.div>

      {/* Floating: delivery badge (top-right above main card) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.5, type: "spring" }}
        className="hidden lg:flex absolute -top-5 right-12 items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
      >
        <Clock size={14} strokeWidth={2.5} />
        <div className="text-xs font-bold tracking-wide">Shipped in 1h</div>
      </motion.div>
    </div>
  );
}

function Steps({ items }: { items: { icon: React.ComponentType<{ size?: number; className?: string }>; t: string; d: string }[] }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <motion.div
          key={it.t}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: (i % 4) * 0.08 }}
          className="relative p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors group"
        >
          <div className="absolute -top-3 left-6 px-2 py-0.5 rounded-md bg-background border border-border text-xs font-mono">
            {String(i + 1).padStart(2, "0")}
          </div>
          <it.icon size={24} className="text-primary mb-4 group-hover:scale-110 transition-transform" />
          <div className="font-semibold mb-1.5">{it.t}</div>
          <div className="text-sm text-muted-foreground leading-relaxed">{it.d}</div>
        </motion.div>
      ))}
    </div>
  );
}
