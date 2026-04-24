"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Sparkles, ShieldCheck, Wallet,
  Camera, Bot, CheckCheck, IndianRupee,
} from "lucide-react";
import { BrandDemo } from "@/components/landing/BrandDemo";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" } as const,
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Hero />
      <Marquee />
      <HowItWorks />
      <DemoSection />
      <PathsSection />
      <Trust />
      <CTA />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 md:pt-36 pb-16 md:pb-20 px-4 md:px-5">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="absolute inset-0 grain opacity-40 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-secondary/50 backdrop-blur text-xs font-medium mb-8"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Made in India · DPDP Act compliant
        </motion.div>

        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as const }}
              className="font-display text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[1.02] sm:leading-[0.95]"
            >
              Your face. <br />
              <span className="text-gradient-primary">Their campaign.</span> <br />
              Everyone wins.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="mt-6 md:mt-7 text-base md:text-xl text-muted-foreground max-w-xl leading-relaxed"
            >
              India's AI face licensing marketplace. Creators license their AI face to brands.
              Brands generate ads in seconds. You approve every single image. No shoots. No middlemen.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="mt-8 md:mt-9 flex flex-col sm:flex-row flex-wrap gap-3"
            >
              <Link
                href="/for-creators"
                className="group w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
              >
                I'm a Creator
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/for-brands"
                className="group w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl border border-border bg-secondary/40 backdrop-blur font-semibold inline-flex items-center gap-2 hover:bg-secondary transition-colors"
              >
                I'm a Brand
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>

          {/* Floating face stack */}
          <div className="relative h-[500px] hidden lg:block">
            <FloatingCard img="/landing/creator-face.jpg" className="top-0 left-8 rotate-[-6deg]" delay={0.2}>
              <Tag>Priya · Mumbai</Tag>
            </FloatingCard>
            <FloatingCard img="/landing/creator-2.jpg" className="top-32 right-0 rotate-[5deg]" delay={0.4}>
              <Tag>Arjun · Bengaluru</Tag>
            </FloatingCard>
            <FloatingCard img="/landing/creator-3.jpg" className="bottom-0 left-16 rotate-[-2deg]" delay={0.6}>
              <Tag>Meera · Delhi</Tag>
            </FloatingCard>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, type: "spring" }}
              className="absolute top-4 right-12 z-10 px-3 py-2 rounded-xl bg-card border border-border shadow-card flex items-center gap-2"
            >
              <IndianRupee size={14} className="text-accent" />
              <span className="text-xs font-mono">+₹2,500</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.1, type: "spring" }}
              className="absolute bottom-20 right-2 z-10 px-3 py-2 rounded-xl bg-card border border-border shadow-card flex items-center gap-2"
            >
              <CheckCheck size={14} className="text-accent" />
              <span className="text-xs font-mono">Approved</span>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ img, className, delay, children }: {
  img: string; className: string; delay: number; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const }}
      className={`absolute h-56 w-44 rounded-2xl overflow-hidden border border-border shadow-card bg-secondary ${className}`}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, delay, ease: "easeInOut" }}
        className="h-full w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute bottom-2 left-2 right-2">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 rounded-md bg-background/80 backdrop-blur text-[10px] font-mono inline-block">
      {children}
    </div>
  );
}

function Marquee() {
  const items = [
    "Consent first", "INR payouts", "GST invoiced", "DPDP compliant",
    "KYC verified", "Made in India", "Creator approved", "Full usage rights",
  ];
  return (
    <section className="border-y border-border/60 bg-secondary/40 py-5 md:py-6 overflow-hidden">
      <div className="flex gap-12 items-center">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="flex gap-10 md:gap-12 items-center shrink-0 pl-10 md:pl-12"
        >
          {[...items, ...items].map((b, i) => (
            <span key={i} className="flex items-center gap-10 md:gap-12 font-display text-xl md:text-2xl font-bold text-muted-foreground whitespace-nowrap">
              {b}
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Camera,    title: "Train your face", text: "Upload reference photos. We train a private AI model just for you." },
    { icon: Bot,       title: "Brand picks you",  text: "Brands browse verified creators and describe the shot they want." },
    { icon: CheckCheck,title: "You approve",       text: "AI generates. You get 48 hours to approve or reject every image." },
    { icon: Wallet,    title: "Money lands",       text: "Approved = paid. Withdraw anytime to your Indian bank account." },
  ];
  return (
    <section className="px-4 md:px-5 py-20 md:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12 md:mb-16">
          <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Four steps. <span className="text-gradient-primary">Zero shoots.</span>
          </h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              {...fadeUp}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
              className="relative p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors group"
            >
              <div className="absolute -top-3 left-6 px-2 py-0.5 rounded-md bg-background border border-border text-xs font-mono">
                0{i + 1}
              </div>
              <s.icon size={28} className="text-primary mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="px-4 md:px-5 py-20 md:py-24 bg-tint-brand/40">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">See it in action</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Tap a product. Watch the magic.
          </h2>
          <p className="mt-4 text-muted-foreground text-base md:text-lg">
            This is exactly what brands see when they generate with a creator's licensed face.
          </p>
        </motion.div>
        <motion.div {...fadeUp}>
          <BrandDemo />
        </motion.div>
      </div>
    </section>
  );
}

function PathsSection() {
  return (
    <section className="px-4 md:px-5 py-20 md:py-24">
      <div className="mx-auto max-w-7xl grid md:grid-cols-2 gap-4 md:gap-5">
        <PathCard
          href="/for-creators"
          eyebrow="For Creators"
          title="Earn while you sleep."
          text="Train once. License forever. You decide every category, every brand, every image."
          tint="creator"
          bullets={[
            "You set your own price per generation",
            "48 hours to approve every single image",
            "Withdraw anytime to your Indian bank",
          ]}
        />
        <PathCard
          href="/for-brands"
          eyebrow="For Brands"
          title="Skip the shoot."
          text="Verified creators, instant generation, full usage rights, GST invoiced. Done in a day."
          tint="brand"
          bullets={[
            "Browse KYC-verified Indian creators",
            "Full commercial usage rights included",
            "Auto GST invoice on every generation",
          ]}
        />
      </div>
    </section>
  );
}

function PathCard({
  href, eyebrow, title, text, tint, bullets,
}: {
  href: string; eyebrow: string; title: string; text: string;
  tint: "creator" | "brand"; bullets: string[];
}) {
  return (
    <motion.div {...fadeUp}>
      <Link
        href={href}
        className={`group relative block p-7 md:p-10 rounded-3xl border border-border hover:border-primary/60 transition-colors overflow-hidden ${tint === "creator" ? "bg-tint-creator" : "bg-tint-brand"}`}
      >
        <div className="relative">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">{eyebrow}</p>
          <h3 className="font-display text-3xl md:text-4xl font-bold mb-3 text-foreground">{title}</h3>
          <p className="text-foreground/70 leading-relaxed mb-6 max-w-md">{text}</p>
          <ul className="space-y-2.5 mb-8">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <CheckCheck size={16} className="text-primary mt-0.5 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
          <div className="inline-flex items-center gap-2 font-semibold text-sm text-foreground">
            Explore
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function Trust() {
  const items = [
    { icon: ShieldCheck, t: "Consent on every gen", d: "Nothing goes live without the creator's tap." },
    { icon: Bot,         t: "AI moderation",         d: "Every output scanned for safety before delivery." },
    { icon: CheckCheck,  t: "DPDP Act compliant",    d: "Built for India's data protection law from day one." },
    { icon: Wallet,      t: "TDS & GST handled",     d: "Auto-calculated, auto-deducted, fully Indian-law ready." },
  ];
  return (
    <section className="px-4 md:px-5 py-20 md:py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12 md:mb-14">
          <p className="text-xs font-mono text-accent uppercase tracking-widest mb-4">Trust & Safety</p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Built like infrastructure. <span className="text-gradient-primary">Not a hack.</span>
          </h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((it, i) => (
            <motion.div
              key={it.t}
              {...fadeUp}
              transition={{ duration: 0.7, delay: i * 0.08 }}
              className="p-6 rounded-2xl border border-border bg-card"
            >
              <it.icon size={24} className="text-accent mb-4" />
              <div className="font-semibold mb-1.5">{it.t}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{it.d}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-4 md:px-5 py-20 md:py-24">
      <motion.div
        {...fadeUp}
        className="relative mx-auto max-w-7xl rounded-3xl overflow-hidden border border-border bg-card p-8 md:p-20 text-center"
      >
        <div className="absolute inset-0 bg-gradient-hero opacity-80" />
        <div className="absolute inset-0 grain opacity-50" />
        <div className="relative">
          <Sparkles className="mx-auto mb-6 text-accent" size={32} />
          <h2 className="font-display text-3xl sm:text-4xl md:text-7xl font-bold tracking-tighter leading-tight md:leading-none">
            The future of <br />
            advertising is <span className="text-gradient-primary">consensual.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            Faiceoff puts consent, control, and earnings back in the creator's hands.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <Link href="/for-creators" className="w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow">
              Become a creator <ArrowRight size={18} />
            </Link>
            <Link href="/for-brands" className="w-full sm:w-auto justify-center px-6 py-3.5 rounded-xl border border-border bg-background/40 backdrop-blur font-semibold inline-flex items-center gap-2 hover:bg-secondary transition-colors">
              Sign up as a brand <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
