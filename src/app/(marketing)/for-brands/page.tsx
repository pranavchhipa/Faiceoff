"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, FileCheck2, Wallet, Users, PenLine,
  Sparkles, ShieldCheck, Download, Receipt,
} from "lucide-react";
import { BrandDemo } from "@/components/landing/BrandDemo";

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
      <section className="relative pt-32 md:pt-36 pb-12 md:pb-16 px-4 md:px-5">
        <div className="absolute inset-0 bg-tint-brand/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-xs font-medium mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            For Brands
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="font-display text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[1.02] sm:leading-[0.95] max-w-5xl"
          >
            Skip the shoot. <br />
            <span className="text-gradient-primary">Ship the campaign.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="mt-6 md:mt-7 text-base md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
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
              I'm a creator instead
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-12 md:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl"
          >
            {[
              "KYC-verified creators",
              "Full commercial usage rights",
              "Auto GST invoice",
              "48-hour creator approval",
            ].map((s) => (
              <div key={s} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card text-sm">
                <ShieldCheck size={16} className="text-primary shrink-0" />
                {s}
              </div>
            ))}
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
