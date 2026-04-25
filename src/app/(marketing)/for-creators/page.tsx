"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Upload, Brain, Tags, Ban,
  Bell, CheckCheck, Wallet, Building2,
  ShieldCheck, IndianRupee, Clock,
} from "lucide-react";
import { CreatorDemo } from "@/components/landing/CreatorDemo";
import { CREATORS, WATERMARK_MASK } from "@/components/landing/images";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" } as const,
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export default function CreatorsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">

      {/* Hero */}
      <section className="relative pt-32 md:pt-36 pb-16 md:pb-24 px-4 md:px-5">
        <div className="absolute inset-0 bg-tint-creator/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 text-xs font-mono tracking-[0.18em] uppercase text-accent mb-7"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              For Creators
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[1.02]"
            >
              Your face is the IP. <br />
              <span className="text-gradient-primary">Treat it like one.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="mt-6 md:mt-7 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              Train your AI face once. Approve every brand image. Get paid in INR, straight to your bank.
              No shoots. No DMs. No middlemen.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="mt-8 md:mt-9 flex flex-col sm:flex-row flex-wrap gap-3"
            >
              <Link
                href="/auth/signup/creator"
                className="group w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
              >
                Start onboarding <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/for-brands" className="w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl border border-border bg-secondary/40 backdrop-blur font-semibold inline-flex items-center gap-2 hover:bg-secondary">
                I&apos;m a brand instead
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
                { v: "75%", l: "You keep" },
                { v: "48h", l: "Approval window" },
                { v: "₹0", l: "Signup fee" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-display text-2xl md:text-3xl font-extrabold text-accent leading-none">{s.v}</div>
                  <div className="mt-1 text-[10px] font-mono tracking-widest uppercase text-muted-foreground">{s.l}</div>
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
            <CreatorHeroStack />
          </motion.div>
        </div>
      </section>

      {/* Demo */}
      <section className="px-4 md:px-5 py-12 md:py-16">
        <div className="mx-auto max-w-7xl">
          <motion.div {...fadeUp} className="max-w-2xl mb-10">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">Live preview</p>
            <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] sm:leading-[1.05]">
              This is your inbox. Tap to approve.
            </h2>
          </motion.div>
          <motion.div {...fadeUp}>
            <CreatorDemo />
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="px-4 md:px-5 py-20 md:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div {...fadeUp} className="max-w-2xl mb-12 md:mb-14">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">The flow</p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              From upload to <span className="text-gradient-primary">UPI in days.</span>
            </h2>
          </motion.div>
          <Steps
            items={[
              { icon: Upload,     t: "Sign up & upload",     d: "Quick onboarding. Upload 20–30 reference photos. KYC in 5 minutes." },
              { icon: Brain,      t: "We train your AI",     d: "A private model is trained on your face. Only you control it." },
              { icon: Tags,       t: "Set your price",       d: "Decide your rate per generation. Change it anytime." },
              { icon: Ban,        t: "Pick your no-go zones",d: "Permanently block alcohol, politics, adult, or anything you choose." },
              { icon: Bell,       t: "Get brand requests",   d: "Brands ask. Notifications come to your phone." },
              { icon: CheckCheck, t: "Approve in 48 hours",  d: "Tap approve or reject on every single image. You always have the final word." },
              { icon: Wallet,     t: "Money lands",          d: "Approved images = wallet credit. Withdraw to any Indian bank." },
              { icon: Building2,  t: "Tax-ready",            d: "TDS deducted, GST handled, statements ready for your CA." },
            ]}
          />
        </div>
      </section>

      {/* Control callout */}
      <section className="px-4 md:px-5 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div {...fadeUp} className="rounded-3xl border border-border bg-tint-creator p-8 md:p-16 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-hero opacity-40" />
            <div className="relative">
              <p className="text-xs font-mono text-foreground/70 uppercase tracking-widest mb-4">You're always in control</p>
              <h3 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold leading-tight text-foreground">
                You set the price. <br />
                You approve every image. <br />
                <span className="text-gradient-primary">You get paid in INR.</span>
              </h3>
              <p className="mt-6 text-foreground/70 max-w-xl mx-auto text-base md:text-lg">
                No image goes live without your tap. Withdraw to your Indian bank account anytime.
              </p>
              <Link
                href="/auth/signup/creator"
                className="mt-8 w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
              >
                Start earning <ArrowRight size={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CreatorHeroStack — right-side hero visual
   Main creator portrait card + floating inbox-approval card +
   gold wallet mini-card — tells the creator story at a glance.
   ═══════════════════════════════════════════════════════════════════════ */
function CreatorHeroStack() {
  return (
    <div className="relative">
      {/* Main portrait card */}
      <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-border bg-card shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CREATORS.priya.src}
          alt="Priya — Mumbai"
          className="absolute inset-0 w-full h-full object-cover"
          style={WATERMARK_MASK}
        />

        {/* KYC verified chip */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-md bg-background/75 backdrop-blur-md border border-border/80 text-xs font-mono tracking-[0.15em] uppercase flex items-center gap-2">
          <ShieldCheck size={12} className="text-accent" /> KYC Verified
        </div>

        {/* LoRA trained badge */}
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-mono tracking-[0.15em] font-bold shadow-lg shadow-primary/30">
          LORA · TRAINED
        </div>

        {/* bottom caption */}
        <div className="absolute bottom-4 left-4 right-4 p-4 rounded-xl bg-background/75 backdrop-blur-md border border-border/60">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-lg font-bold leading-tight">Priya · Mumbai</div>
              <div className="text-xs text-muted-foreground font-mono tracking-wider uppercase mt-1">
                Fashion · Beauty · 1.2M followers
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Earns</div>
              <div className="font-display font-bold text-accent">₹1,875</div>
              <div className="text-[9px] text-muted-foreground">per gen · net of fees</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating: incoming approval request */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1, type: "spring", stiffness: 220, damping: 22 }}
        className="hidden sm:block absolute -left-6 lg:-left-10 top-20 w-64 p-4 rounded-2xl bg-card border border-border shadow-glow"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-[10px] font-display font-extrabold tracking-wider">AC</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-sm truncate">Athleisure Co.</div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">asking approval</div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-accent">
            <Clock size={10} /> 41h
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono leading-relaxed truncate">
          <span className="text-accent">prompt →</span> Priya in white sneakers, soft pink backdrop…
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center gap-1">
            <CheckCheck size={12} /> Approve · ₹2,500
          </div>
          <div className="h-8 w-8 rounded-lg border border-border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">×</span>
          </div>
        </div>
      </motion.div>

      {/* Floating: wallet mini */}
      <motion.div
        initial={{ opacity: 0, x: 20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.25, type: "spring", stiffness: 220, damping: 22 }}
        className="hidden sm:flex absolute -right-5 lg:-right-6 -bottom-4 items-center gap-3 px-5 py-4 rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow"
      >
        <div className="h-10 w-10 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
          <IndianRupee size={18} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-80">Wallet · this month</div>
          <div className="font-display text-2xl font-extrabold leading-none mt-0.5">₹42,500</div>
          <div className="text-[10px] font-mono opacity-80 mt-1">+₹12,400 this week</div>
        </div>
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
