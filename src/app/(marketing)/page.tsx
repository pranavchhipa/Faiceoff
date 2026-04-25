"use client";

// Faiceoff landing — "Studio Black" full revamp
// -----------------------------------------------------------------------------
// Image-first dark theme. Every section is designed to showcase photos of real
// Indian creators / brand composites. Where real photos don't exist yet we use
// visible <PhotoSlot /> placeholders — replace them by dropping jpgs into
// /public/landing/ and wiring a path into src/components/landing/images.ts.
//
// Sections (in order):
//   1.  Hero           — eyebrow + headline + 2 CTAs + hero portrait card
//   2.  TrustMarquee   — scrolling trust chips
//   3.  HowItWorks     — 3 big steps with mini visuals
//   4.  CreatorGallery — 3×3 grid (3 real + 6 placeholder creator slots)
//   5.  BrandDemo      — reuses existing interactive demo
//   6.  CreatorInbox   — mock approval queue (creator's POV)
//   7.  VaultGallery   — delivered creatives grid (4 real + 8 placeholders)
//   8.  Stats          — four big numbers
//   9.  Pricing        — Creator (free) vs Brand (top-up) cards
//  10.  Compliance     — 4 trust pillars
//  11.  FinalCTA       — split "I'm a creator" / "I'm a brand"
// -----------------------------------------------------------------------------

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Wallet,
  Camera,
  Bot,
  CheckCheck,
  IndianRupee,
  FileText,
  UserCheck,
  Clock,
  Image as ImageIcon,
  Check,
  X,
} from "lucide-react";
import { BrandDemo } from "@/components/landing/BrandDemo";
import {
  CREATORS,
  PRIYA_COMPOSITES,
  ARJUN_COMPOSITES,
  ALL_CREATORS,
  WATERMARK_MASK,
} from "@/components/landing/images";

// ── shared motion presets ────────────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1] as const;
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" } as const,
  transition: { duration: 0.7, ease },
};

export default function HomePage() {
  return (
    <div className="relative">
      <Hero />
      <TrustMarquee />
      <HowItWorks />
      <CreatorGallery />
      <BrandDemoSection />
      <CreatorInbox />
      <VaultGallery />
      <Stats />
      <Compliance />
      <FinalCTA />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · HERO
   ══════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative pt-32 md:pt-40 pb-20 md:pb-28 px-4 md:px-6">
      {/* backdrop glow */}
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="absolute inset-0 grain opacity-60 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
        {/* ── Left: copy ───────────────────────────────── */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/10 text-xs font-mono tracking-[0.18em] uppercase text-accent mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Live in India · DPDP compliant
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease }}
            className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.98]"
          >
            Your face. <br />
            Their campaign. <br />
            <span className="text-gradient-primary">Everyone wins.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="mt-7 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed"
          >
            India&apos;s first AI face licensing marketplace. Creators license
            their face, brands ship ads in minutes — every image
            creator-approved.
          </motion.p>

          {/* CTA hierarchy: Brand is primary (filled gold), Creator secondary (outlined).
              Brands drive revenue, so the visual weight goes to "I'm a Brand". */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3 }}
            className="mt-9 flex flex-col sm:flex-row flex-wrap gap-3"
          >
            <Link
              href="/for-brands"
              className="group w-full sm:w-auto justify-center px-7 py-4 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 hover:shadow-glow transition-shadow"
            >
              I&apos;m a Brand — start a campaign
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/for-creators"
              className="group w-full sm:w-auto justify-center px-7 py-4 rounded-xl border border-border bg-card/40 backdrop-blur font-semibold inline-flex items-center gap-2 hover:bg-card transition-colors"
            >
              I&apos;m a Creator
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* trust mini-row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-mono tracking-widest uppercase text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-accent" /> Consent on every gen
            </span>
            <span className="flex items-center gap-2">
              <FileText size={14} className="text-accent" /> GST invoiced
            </span>
            <span className="flex items-center gap-2">
              <IndianRupee size={14} className="text-accent" /> INR payouts
            </span>
          </motion.div>

          {/* social-proof strip — quote from a creator on the platform.
              Real validation > vague stats. Replace name/quote with a real
              one once a flagship creator is comfortable being on the page. */}
          <motion.figure
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.6 }}
            className="mt-8 max-w-md flex items-start gap-3 rounded-2xl border border-border bg-card/40 backdrop-blur p-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-accent/15 ring-1 ring-accent/30 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={CREATORS.priya.src}
                alt=""
                className="h-full w-full object-cover"
                style={WATERMARK_MASK}
              />
            </div>
            <blockquote className="text-sm leading-relaxed text-foreground/90">
              &ldquo;3 brand campaigns my first month. No shoots, no DMs from
              middlemen. Just my face, my rules.&rdquo;
              <footer className="mt-1.5 text-[11px] font-mono tracking-widest uppercase text-muted-foreground">
                — Priya · Mumbai · Lifestyle creator
              </footer>
            </blockquote>
          </motion.figure>
        </div>

        {/* ── Right: big hero card ─────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease }}
          className="relative"
        >
          <HeroCard />
        </motion.div>
      </div>
    </section>
  );
}

function HeroCard() {
  return (
    <div className="relative">
      {/* main portrait */}
      <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-border bg-card shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CREATORS.priya.src}
          alt="Priya — Mumbai"
          className="absolute inset-0 w-full h-full object-cover"
          style={WATERMARK_MASK}
        />

        {/* LIVE chip */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-md bg-background/75 backdrop-blur-md border border-border/80 text-xs font-mono tracking-[0.15em] flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          LIVE
        </div>

        {/* AI watermark */}
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-mono tracking-[0.15em] font-bold shadow-lg shadow-primary/30">
          AI · FAICEOFF
        </div>

        {/* bottom caption — slim single-line so it doesn't cover the watch */}
        <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg bg-background/80 backdrop-blur-md border border-border/60 flex items-center justify-between gap-3">
          <div className="font-display text-sm font-bold leading-tight truncate">Priya · Mumbai</div>
          <div className="shrink-0 font-display font-bold text-sm text-accent">₹2,500</div>
        </div>
      </div>

      {/* floating earnings badge — only on lg+ where there's horizontal room
          to extend outside the card without getting clipped at the edges */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1, type: "spring" }}
        className="hidden lg:flex absolute -top-5 -right-5 items-center gap-2 px-4 py-3 rounded-2xl bg-card border border-accent/30 shadow-glow"
      >
        <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center">
          <IndianRupee size={14} className="text-accent" />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Just earned</div>
          <div className="font-display font-bold">+₹2,500</div>
        </div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · TRUST MARQUEE
   ══════════════════════════════════════════════════════════════════════════ */

function TrustMarquee() {
  const items = [
    "Creator approved",
    "Consent first",
    "INR payouts",
    "DPDP Act compliant",
    "KYC verified",
    "Made in India",
    "GST auto-invoiced",
    "Full commercial rights",
  ];
  return (
    <section className="border-y border-border bg-secondary/40 py-6 overflow-hidden">
      <div className="flex items-center">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
          className="flex gap-12 items-center shrink-0 pl-12"
        >
          {[...items, ...items].map((b, i) => (
            <span
              key={i}
              className="flex items-center gap-12 font-display text-lg md:text-2xl font-bold text-muted-foreground whitespace-nowrap"
            >
              {b}
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · HOW IT WORKS
   ══════════════════════════════════════════════════════════════════════════ */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: Camera,
      title: "License your face",
      text: "Upload 10 photos. Sign the consent. Set your per-image price. We train a private AI model just for you.",
      thumb: CREATORS.priya.src,
      tag: "Training",
    },
    {
      n: "02",
      icon: Sparkles,
      title: "Brands generate",
      text: "Brands pick you, write a simple brief, pay in INR. AI makes the image in under a minute.",
      thumb: PRIYA_COMPOSITES.sneaker,
      tag: "Generating",
    },
    {
      n: "03",
      icon: CheckCheck,
      title: "You approve. You earn.",
      text: "Every image waits for your thumbs-up. 48h window. Say no, they get nothing. Say yes, money lands in your wallet.",
      thumb: PRIYA_COMPOSITES.phone,
      tag: "Approved",
    },
  ];

  return (
    <section className="px-4 md:px-6 py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-14">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">How it works</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Three steps. <span className="text-gradient-primary">That&apos;s it.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg max-w-xl">
            No shoots. No middlemen. The whole workflow fits on one screen.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4 md:gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              {...fadeUp}
              transition={{ duration: 0.7, delay: i * 0.1, ease }}
              className="relative rounded-3xl border border-border bg-card overflow-hidden group hover:border-accent/40 transition-colors"
            >
              {/* thumbnail top */}
              <div className="relative aspect-[5/3] overflow-hidden bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.thumb}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  style={WATERMARK_MASK}
                />
                <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-background/75 backdrop-blur text-[10px] font-mono tracking-widest uppercase">
                  {s.tag}
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-mono font-bold tracking-wider">
                  {s.n}
                </div>
              </div>

              {/* text */}
              <div className="p-6 md:p-7">
                <s.icon size={22} className="text-accent mb-4" />
                <h3 className="font-display text-2xl font-bold mb-2.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · CREATOR GALLERY
   ══════════════════════════════════════════════════════════════════════════ */

type CreatorItem =
  | { placeholder?: false; name: string; city: string; niche: string; price: string; img: string }
  | { placeholder: true; label: string; cta?: boolean };

function CreatorGallery() {
  // 8 real creators + 1 "you next" slot — drives the marketplace feel.
  const creators: CreatorItem[] = [
    ...ALL_CREATORS.map((c) => ({
      name: c.name,
      city: c.city,
      niche: c.niche,
      price: c.price,
      img: c.src,
    })),
    { placeholder: true, label: "You next?", cta: true },
  ];

  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">Licensed creators</p>
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
              Real Indian creators. <span className="text-gradient-primary">Verified faces.</span>
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              KYC-verified. DPDP-consented. Set their own price. Browse and pick in seconds.
            </p>
          </div>
          <Link
            href="/for-brands"
            className="shrink-0 inline-flex items-center gap-2 font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            Browse all creators
            <ArrowRight size={16} />
          </Link>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {creators.map((c, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.6, delay: i * 0.05, ease }}
            >
              {c.placeholder ? (
                <PhotoSlot label={c.label} cta={c.cta} aspect="3/4" />
              ) : (
                <CreatorCard name={c.name} city={c.city} niche={c.niche} price={c.price} img={c.img} />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreatorCard({
  name, city, niche, price, img,
}: { name: string; city: string; niche: string; price: string; img: string }) {
  return (
    <div className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-colors">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.09]"
        style={WATERMARK_MASK}
      />

      {/* KYC chip */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-background/75 backdrop-blur text-[10px] font-mono tracking-widest uppercase flex items-center gap-1.5">
        <ShieldCheck size={11} className="text-accent" /> Verified
      </div>

      {/* price chip */}
      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-background/75 backdrop-blur text-[10px] font-mono tracking-widest">
        <span className="text-accent font-bold">{price}</span> / gen
      </div>

      {/* bottom meta */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background/95 via-background/60 to-transparent">
        <div className="font-display text-lg font-bold">{name}</div>
        <div className="text-[11px] font-mono text-accent tracking-widest uppercase mt-0.5">{city}</div>
        <div className="text-xs text-muted-foreground mt-1">{niche}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PhotoSlot — reusable placeholder for un-photographed slots
   ══════════════════════════════════════════════════════════════════════════ */

function PhotoSlot({
  label = "PHOTO PLACEHOLDER",
  aspect = "3/4",
  cta = false,
}: { label?: string; aspect?: string; cta?: boolean }) {
  return (
    <div
      className={`relative rounded-2xl border border-dashed ${
        cta ? "border-accent/40 bg-accent/5" : "border-border bg-card/40"
      } overflow-hidden flex items-center justify-center`}
      style={{ aspectRatio: aspect }}
    >
      {/* inner frame */}
      <div className={`absolute inset-3 rounded-xl border ${cta ? "border-accent/20" : "border-border/40"}`} />

      {/* gold corner marks */}
      <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-accent/40" />
      <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-accent/40" />
      <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-accent/40" />
      <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-accent/40" />

      <div className="text-center px-4">
        <div className={`mx-auto mb-3 h-10 w-10 rounded-full flex items-center justify-center ${
          cta ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"
        }`}>
          {cta ? <Sparkles size={16} /> : <ImageIcon size={16} />}
        </div>
        <div className={`text-[10px] font-mono tracking-[0.2em] uppercase ${
          cta ? "text-accent font-bold" : "text-muted-foreground"
        }`}>
          {label}
        </div>
        {cta && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Onboard in 5 minutes →
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · BRAND DEMO (interactive)
   ══════════════════════════════════════════════════════════════════════════ */

function BrandDemoSection() {
  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border bg-[color:var(--tint-brand)]">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">For brands</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Tap a product. <span className="text-gradient-primary">Watch it happen.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            This is exactly what brands see when they generate with a licensed creator. No shoot. No model fees.
            GST invoice auto-generated.
          </p>
        </motion.div>
        <motion.div {...fadeUp}>
          <BrandDemo />
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · CREATOR INBOX (creator's POV)
   ══════════════════════════════════════════════════════════════════════════ */

function CreatorInbox() {
  const requests = [
    {
      brand: "Athleisure Co.",
      initials: "NI",
      campaign: "Monsoon Sneaker Drop",
      prompt: "Priya wearing white sneakers, soft pink backdrop, editorial",
      thumb: PRIYA_COMPOSITES.sneaker,
      fee: "₹2,500",
      left: "41h left",
      urgent: false,
    },
    {
      brand: "Tech Co.",
      initials: "OP",
      campaign: "Nord 4 launch teaser",
      prompt: "Priya holding new phone, neon blue rim light, night scene",
      thumb: PRIYA_COMPOSITES.phone,
      fee: "₹3,000",
      left: "12h left",
      urgent: true,
    },
    {
      brand: "The Ordinary",
      initials: "TO",
      campaign: "Morning routine reel",
      prompt: "Priya applying serum, peach morning light, close-up",
      thumb: PRIYA_COMPOSITES.skincare,
      fee: "₹2,200",
      left: "26h left",
      urgent: false,
    },
  ];

  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">For creators</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Your inbox. <span className="text-gradient-primary">Your rules.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Every brand request shows up here. See the image before it ships. One tap to approve, one tap to reject.
            You get 48 hours. Money lands the second you approve.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 lg:gap-8 items-start">
          {/* Inbox card stack */}
          <motion.div {...fadeUp} className="rounded-3xl border border-border bg-card overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-display font-extrabold text-sm">P</span>
                </div>
                <div>
                  <div className="font-display font-bold text-sm">Priya&apos;s inbox</div>
                  <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                    3 pending · 0 rejected this month
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                LIVE
              </div>
            </div>

            {/* list */}
            <div className="divide-y divide-border">
              {requests.map((r, i) => (
                <div
                  key={i}
                  className="flex items-stretch gap-4 p-4 md:p-5 hover:bg-secondary/20 transition-colors"
                >
                  {/* thumb */}
                  <div className="relative h-20 w-20 md:h-24 md:w-24 shrink-0 rounded-xl overflow-hidden border border-border bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" style={WATERMARK_MASK} />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-background/80 text-[8px] font-mono tracking-wider">
                      PREVIEW
                    </div>
                  </div>

                  {/* meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-5 w-5 rounded bg-secondary flex items-center justify-center">
                        <span className="text-[9px] font-mono font-bold">{r.initials}</span>
                      </div>
                      <span className="font-display font-bold text-sm">{r.brand}</span>
                      <span className="text-[10px] text-muted-foreground">· {r.campaign}</span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      <span className="text-accent">prompt →</span> {r.prompt}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px]">
                      <span className="font-display font-bold text-accent">{r.fee}</span>
                      <span className={`flex items-center gap-1 font-mono ${r.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                        <Clock size={10} /> {r.left}
                      </span>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="hidden sm:flex flex-col gap-2 shrink-0">
                    <button className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:shadow-glow transition-shadow">
                      <Check size={16} />
                    </button>
                    <button className="h-9 w-9 rounded-lg border border-border text-muted-foreground flex items-center justify-center hover:border-destructive hover:text-destructive transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-secondary/40 text-[11px] font-mono text-muted-foreground tracking-wider">
              <span>Auto-reject after 48h · policy setting</span>
              <span className="text-accent">+₹7,700 this week</span>
            </div>
          </motion.div>

          {/* Side cards */}
          <div className="grid gap-5">
            <motion.div {...fadeUp} className="rounded-3xl border border-border bg-card p-6 md:p-7">
              <UserCheck size={22} className="text-accent mb-4" />
              <h3 className="font-display text-xl font-bold mb-2">You are the director</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Block categories you don&apos;t want. Reject anything that doesn&apos;t fit your vibe.
                The AI can&apos;t ship without your tap.
              </p>
            </motion.div>

            <motion.div {...fadeUp} className="rounded-3xl overflow-hidden bg-primary text-primary-foreground p-6 md:p-7">
              <Wallet size={22} className="mb-4" />
              <h3 className="font-display text-xl font-bold mb-2">Instant INR payouts</h3>
              <p className="text-sm opacity-80 leading-relaxed">
                Approved means paid. Withdraw to your bank anytime. No 90-day waits, no invoices to chase.
              </p>
              <div className="mt-5 pt-5 border-t border-primary-foreground/15 flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest uppercase opacity-70">
                  Priya · this month
                </span>
                <span className="font-display text-2xl font-extrabold">₹42,500</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · VAULT GALLERY
   ══════════════════════════════════════════════════════════════════════════ */

type VaultItem = { img: string; tag: string; brand: string; price: string };

function VaultGallery() {
  // 8 real composites — Priya × 5 + Arjun × 3. No empty placeholders.
  const items: VaultItem[] = [
    { img: PRIYA_COMPOSITES.sneaker,    tag: "SNEAKER",    brand: "Athleisure Co.", price: "₹2,500" },
    { img: PRIYA_COMPOSITES.phone,      tag: "PHONE",      brand: "Tech Co.",       price: "₹3,000" },
    { img: PRIYA_COMPOSITES.skincare,   tag: "SKINCARE",   brand: "Skincare Co.",   price: "₹2,200" },
    { img: PRIYA_COMPOSITES.food,       tag: "BEVERAGE",   brand: "Beverage Co.",   price: "₹2,000" },
    { img: PRIYA_COMPOSITES.lipstick,   tag: "LIPSTICK",   brand: "Beauty Co.",     price: "₹2,300" },
    { img: ARJUN_COMPOSITES.haldiram,   tag: "SNACK",      brand: "Snack Co.",      price: "₹1,800" },
    { img: ARJUN_COMPOSITES.smartwatch, tag: "WATCH",      brand: "Wearable Co.",   price: "₹2,400" },
    { img: ARJUN_COMPOSITES.paperboat,  tag: "BEVERAGE",   brand: "Beverage Co.",   price: "₹1,900" },
  ];

  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border bg-[color:var(--tint-creator)]">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">The vault</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            What brands walk <span className="text-gradient-primary">out with.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Delivered creatives. Auto-tagged, GST-invoiced, ready to publish on Meta, Flipkart, Amazon — anywhere.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {items.map((it, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.04, ease }}
            >
              <VaultCard img={it.img} tag={it.tag} brand={it.brand} price={it.price} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VaultCard({
  img, tag, brand, price,
}: { img: string; tag: string; brand: string; price: string }) {
  return (
    <div className="group relative aspect-square rounded-2xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-colors">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={brand}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.10]"
        style={WATERMARK_MASK}
      />
      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-background/80 backdrop-blur text-[10px] font-mono tracking-[0.15em] uppercase">
        {tag}
      </div>
      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-mono font-bold tracking-wider">
        {price}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/95 to-transparent">
        <div className="text-xs font-mono text-muted-foreground">delivered to</div>
        <div className="text-sm font-display font-bold">{brand}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · STATS
   ══════════════════════════════════════════════════════════════════════════ */

function Stats() {
  const stats = [
    { value: "₹1.82L", label: "Creator earnings paid", sub: "+₹42k this week" },
    { value: "98%", label: "Approval rate", sub: "Creators stay in control" },
    { value: "41h", label: "Avg review time", sub: "Well under 48h window" },
    { value: "12s", label: "Avg generation time", sub: "From brief to image" },
  ];

  return (
    <section className="px-4 md:px-6 py-20 md:py-24 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="rounded-3xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {stats.map((s, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.6, delay: i * 0.08, ease }}
                className="p-8 md:p-10"
              >
                <div className="font-display text-4xl md:text-5xl font-extrabold tracking-tight leading-none">
                  <span className="text-accent">{s.value.slice(0, 1)}</span>
                  {s.value.slice(1)}
                </div>
                <div className="mt-3 text-xs font-mono text-muted-foreground uppercase tracking-[0.18em]">
                  {s.label}
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground/70">{s.sub}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · PRICING
   ══════════════════════════════════════════════════════════════════════════ */

function Pricing() {
  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">Pricing</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Free for creators. <span className="text-gradient-primary">Honest for brands.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5">
          <PricingCard
            eyebrow="For Creators"
            title="Free forever"
            price="₹0"
            priceSub="we earn only when you earn"
            features={[
              "No signup or monthly fee",
              "Keep 75% of every generation",
              "Set your own per-image price",
              "Withdraw to bank anytime (UPI + IMPS)",
              "Block any category you don't want",
              "Full DPDP consent on every gen",
            ]}
            cta="Start earning"
            href="/auth/signup/creator"
            accent={false}
          />
          <PricingCard
            eyebrow="For Brands"
            title="Pay per image"
            price="₹5,000"
            priceSub="starter wallet top-up · 5 free gens"
            features={[
              "First 5 generations free",
              "Top up from ₹5,000 via Cashfree",
              "GST invoice auto-generated",
              "Full commercial usage rights",
              "Bulk discount at ₹50k+ top-up",
              "Priority support under 2h",
            ]}
            cta="Top up wallet"
            href="/auth/signup/brand"
            accent={true}
          />
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  eyebrow, title, price, priceSub, features, cta, href, accent,
}: {
  eyebrow: string;
  title: string;
  price: string;
  priceSub: string;
  features: string[];
  cta: string;
  href: string;
  accent: boolean;
}) {
  return (
    <motion.div
      {...fadeUp}
      className={`relative rounded-3xl border ${
        accent ? "border-accent/40 bg-card" : "border-border bg-card"
      } p-8 md:p-10 overflow-hidden`}
    >
      {accent && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-mono font-bold tracking-widest uppercase rounded-bl-lg">
          Most common
        </div>
      )}
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.22em] mb-3">{eyebrow}</p>
      <h3 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-2">{title}</h3>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`font-display text-5xl font-extrabold ${accent ? "text-accent" : ""}`}>{price}</span>
      </div>
      <p className="text-xs text-muted-foreground font-mono tracking-wider uppercase mb-7">{priceSub}</p>

      <ul className="space-y-3 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm">
            <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
              accent ? "bg-accent/15 text-accent" : "bg-secondary text-accent"
            }`}>
              <Check size={12} strokeWidth={3} />
            </div>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={`group w-full justify-center px-6 py-3.5 rounded-xl font-semibold inline-flex items-center gap-2 transition-all ${
          accent
            ? "bg-primary text-primary-foreground hover:shadow-glow"
            : "border border-border bg-secondary/40 hover:bg-secondary"
        }`}
      >
        {cta}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   10 · COMPLIANCE
   ══════════════════════════════════════════════════════════════════════════ */

function Compliance() {
  const pillars = [
    {
      icon: ShieldCheck,
      title: "DPDP Act 2023",
      text: "India's data protection law, baked in from day one. Every face has explicit consent.",
    },
    {
      icon: UserCheck,
      title: "Creator-first consent",
      text: "Nothing ships without the creator's tap. 48-hour window on every single image.",
    },
    {
      icon: FileText,
      title: "GST auto-invoiced",
      text: "Every generation comes with a proper B2B invoice. Your CA will love us.",
    },
    {
      icon: Bot,
      title: "AI safety moderation",
      text: "Hive AI scans every output. Blocked concepts get rejected before they reach your creator.",
    },
  ];

  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="max-w-2xl mb-12">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">Built for India</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Infrastructure. <span className="text-gradient-primary">Not a hack.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Every piece is built to pass Indian legal review. No scraping. No stolen faces. No shortcuts.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              {...fadeUp}
              transition={{ duration: 0.6, delay: i * 0.08, ease }}
              className="rounded-2xl border border-border bg-card p-6 hover:border-accent/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-5">
                <p.icon size={20} className="text-accent" />
              </div>
              <div className="font-display font-bold text-lg mb-2">{p.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   11 · FINAL CTA (split)
   ══════════════════════════════════════════════════════════════════════════ */

function FinalCTA() {
  return (
    <section className="px-4 md:px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp} className="grid md:grid-cols-2 gap-5">
          <CTAHalf
            eyebrow="For Creators"
            title="Your face. Your rules. Your income."
            sub="Onboard in 5 minutes. First payout in 7 days."
            cta="I'm a Creator"
            href="/auth/signup/creator"
            img={CREATORS.arjun.src}
            accent={true}
          />
          <CTAHalf
            eyebrow="For Brands"
            title="Skip the shoot. Keep the quality."
            sub="5 free generations. GST-invoiced. Indian creators only."
            cta="I'm a Brand"
            href="/auth/signup/brand"
            img={PRIYA_COMPOSITES.sneaker}
            accent={false}
          />
        </motion.div>
      </div>
    </section>
  );
}

function CTAHalf({
  eyebrow, title, sub, cta, href, img, accent,
}: {
  eyebrow: string; title: string; sub: string; cta: string; href: string; img: string; accent: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-3xl overflow-hidden border border-border bg-card aspect-[4/5] md:aspect-[5/6] block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity"
        style={WATERMARK_MASK}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/20" />

      <div className="relative h-full flex flex-col justify-end p-8 md:p-12">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.22em] mb-4">{eyebrow}</p>
        <h3 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-4">
          {title}
        </h3>
        <p className="text-muted-foreground mb-8 max-w-md">{sub}</p>
        <div
          className={`inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold self-start transition-all ${
            accent
              ? "bg-primary text-primary-foreground group-hover:shadow-glow"
              : "border border-border bg-card/60 backdrop-blur group-hover:bg-card"
          }`}
        >
          {cta}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
