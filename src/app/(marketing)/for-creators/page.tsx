"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Upload, Brain, Tags, Ban,
  Bell, CheckCheck, Wallet, Building2,
} from "lucide-react";
import { CreatorDemo } from "@/components/landing/CreatorDemo";

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
      <section className="relative pt-32 md:pt-36 pb-12 md:pb-16 px-4 md:px-5">
        <div className="absolute inset-0 bg-tint-creator/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-hero opacity-60 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 text-xs font-medium mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            For Creators
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="font-display text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[1.02] sm:leading-[0.95] max-w-5xl"
          >
            Your face is the IP. <br />
            <span className="text-gradient-primary">Treat it like one.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="mt-6 md:mt-7 text-base md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
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
              I'm a brand instead
            </Link>
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
