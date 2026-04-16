"use client";

import { useState } from "react";
import Image from "next/image";
import { 
  PlayCircle, 
  ShieldCheck, 
  CreditCard, 
  Lock, 
  TrendingUp, 
  Sparkles, 
  Zap, 
  Shield, 
  ArrowRight 
} from "lucide-react";

export default function ForCreatorsPage() {
  const [dailyAds, setDailyAds] = useState(12);
  const [tier, setTier] = useState<"Startup" | "Corporate" | "Luxury">("Startup");
  const [isExclusive, setIsExclusive] = useState(false);

  // Simple revenue calculation logic
  const baseRate = 25; // $25 base per generation
  const tierMultiplier = tier === "Startup" ? 1 : tier === "Corporate" ? 2.5 : 5;
  const exclusiveMultiplier = isExclusive ? 1.5 : 1;
  const monthlyRevenue = Math.round(dailyAds * 30 * baseRate * tierMultiplier * exclusiveMultiplier);

  return (
    <div className="w-full bg-background font-body text-on-surface overflow-hidden">
      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-32 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-10 sm:gap-16">
        <div className="w-full md:w-1/2 space-y-6 sm:space-y-8 z-10">
          <h1 className="text-[2.5rem] sm:text-6xl md:text-8xl font-bold font-headline leading-[0.95] tracking-tighter text-on-surface">
            Your Face. <br />
            <span className="text-primary-dim">Your Rules.</span> <br />
            Your Revenue.
          </h1>
          <p className="text-base sm:text-xl text-on-surface-variant max-w-lg leading-relaxed">
            License your digital likeness to global brands. Maintain 100% ownership with DPDP-compliant security and instant payouts via Razorpay.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 pt-2 sm:pt-4">
            <button className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl font-headline font-bold text-base sm:text-lg active:scale-95 transition-all shadow-xl shadow-primary/25 cursor-pointer">
              Start Earning Now
            </button>
            <button className="flex items-center justify-center gap-3 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl font-headline font-bold text-base sm:text-lg border border-outline-variant/30 text-on-surface hover:bg-surface-container-low transition-all cursor-pointer">
              <PlayCircle className="w-5 h-5" />
              See How it Works
            </button>
          </div>
        </div>
        <div className="w-full md:w-1/2 relative mt-12 md:mt-0">
          <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
            <Image 
              src="/images/creator_hero.png" 
              alt="Editorial portrait" 
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent"></div>
            {/* Floating Data Badge */}
            <div className="absolute bottom-6 left-6 right-6 backdrop-blur-md bg-white/70 p-6 rounded-xl border border-white/20 shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-label uppercase text-primary tracking-widest">Active License</span>
                <span className="text-xs text-on-surface-variant">Real-time tracking</span>
              </div>
              <div className="text-2xl font-headline font-bold text-on-surface">
                $1,420.00 <span className="text-sm font-body font-normal text-on-surface-variant">earned this week</span>
              </div>
            </div>
          </div>
          {/* Abstract geometry */}
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-primary-container/30 rounded-full blur-3xl -z-10"></div>
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-tertiary-fixed/20 rounded-full blur-3xl -z-10"></div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="bg-surface-container-low py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8 sm:gap-12">
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <h3 className="text-sm font-label uppercase tracking-[0.2em] text-on-surface-variant/60 mb-2">Trusted Infrastructure</h3>
            <div className="flex flex-wrap items-center gap-8 md:gap-12 grayscale opacity-60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-8 h-8" />
                <span className="font-headline font-bold text-xl tracking-tighter">DPDP ACT</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-8 h-8" />
                <span className="font-headline font-bold text-xl tracking-tighter">RAZORPAY</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-8 h-8" />
                <span className="font-headline font-bold text-xl tracking-tighter">ENCRYPTED</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 w-full md:w-auto">
            <div className="h-12 w-[1px] bg-outline-variant/30 hidden md:block"></div>
            <p className="text-sm font-body text-on-surface-variant max-w-xs m-0">
              &ldquo;The most secure marketplace for AI-generated likeness and professional creator assets.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* Earnings Calculator (Bento Style) */}
      <section className="py-12 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-8 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold tracking-tight text-on-surface">Passive Income Potential</h2>
          <p className="text-on-surface-variant mt-3 sm:mt-4 text-base sm:text-lg">Calculate how much your digital twin can earn while you sleep.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8">
          {/* Calculator Controls */}
          <div className="lg:col-span-7 bg-surface-container-lowest p-6 sm:p-8 md:p-12 rounded-2xl border border-outline-variant/10 shadow-[0px_24px_48px_rgba(44,47,48,0.04)]">
            <div className="space-y-12">
              <div>
                <div className="flex justify-between items-end mb-6">
                  <label className="text-xl font-headline font-semibold text-on-surface">Daily Ad Placements</label>
                  <span className="text-3xl font-headline font-bold text-primary">{dailyAds}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={dailyAds}
                  onChange={(e) => setDailyAds(Number(e.target.value))}
                  className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary" 
                />
              </div>
              <div>
                <div className="flex justify-between items-end mb-6">
                  <label className="text-xl font-headline font-semibold text-on-surface">Brand Tier Intensity</label>
                  <span className="text-3xl font-headline font-bold text-primary">{tier}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {(["Startup", "Corporate", "Luxury"] as const).map((t) => (
                    <button 
                      key={t}
                      onClick={() => setTier(t)}
                      className={`py-3 rounded-lg border font-headline font-bold transition-colors ${
                        tier === t 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-outline-variant/20 hover:border-primary/50 text-on-surface-variant"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 sm:mb-6 gap-3">
                  <label className="text-lg sm:text-xl font-headline font-semibold text-on-surface">Exclusive Rights</label>
                  <div className="flex items-center gap-3 sm:gap-4 cursor-pointer" onClick={() => setIsExclusive(!isExclusive)}>
                    <span className={`text-sm font-label ${!isExclusive ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Non-Exclusive</span>
                    <button className={`w-12 h-6 rounded-full relative flex items-center px-1 transition-colors ${isExclusive ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isExclusive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                    <span className={`text-sm font-label ${isExclusive ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Exclusive</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Result Card */}
          <div className="lg:col-span-5 bg-gradient-to-br from-primary to-primary-container p-6 sm:p-12 rounded-2xl flex flex-col justify-between text-on-primary shadow-xl">
            <div className="space-y-2">
              <span className="text-sm font-label tracking-widest uppercase opacity-80">Estimated Monthly Revenue</span>
              <div className="text-5xl sm:text-6xl lg:text-7xl font-headline font-bold break-all">${monthlyRevenue.toLocaleString()}</div>
              <p className="text-on-primary/70 font-body">Based on current marketplace demand for your aesthetic profile.</p>
            </div>
            <div className="space-y-6 pt-8 sm:pt-12 mt-6 sm:mt-0 border-t border-white/20">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold font-headline">+124% increase</div>
                  <div className="text-xs opacity-70">Projected annual growth</div>
                </div>
              </div>
              <button className="w-full py-4 bg-white text-primary font-headline font-bold rounded-xl shadow-lg active:scale-95 transition-all">
                Claim Your Profile
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Bento */}
      <section className="py-12 sm:py-24 px-4 sm:px-6 lg:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8">
            {/* Feature 1 */}
            <div className="md:col-span-2 bg-surface-container-low p-6 sm:p-10 rounded-2xl flex flex-col md:flex-row gap-6 sm:gap-10 items-center overflow-hidden">
              <div className="md:w-1/2 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-headline font-bold">Privacy-First Licensing</h3>
                <p className="text-on-surface-variant leading-relaxed">
                  We don't store your raw identity. Every license is encrypted with a unique hash that only grants usage for specific brand campaigns you approve.
                </p>
              </div>
              <div className="md:w-1/2 relative aspect-[4/3] rounded-xl overflow-hidden shadow-lg w-full">
                <Image 
                  src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=600&auto=format&fit=crop" 
                  alt="Security Interface" 
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            {/* Feature 2 */}
            <div className="bg-surface-container-lowest p-6 sm:p-10 rounded-2xl border border-outline-variant/10 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-tertiary-fixed/20 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-tertiary" />
                </div>
                <h3 className="text-2xl font-headline font-bold">Instant Payouts</h3>
                <p className="text-on-surface-variant">No more waiting 30-90 days for agency fees. Get paid via Razorpay the moment an AI generation is rendered.</p>
              </div>
              <div className="pt-8">
                <div className="flex -space-x-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest border-2 border-surface flex items-center justify-center font-bold text-xs">A</div>
                  <div className="w-10 h-10 rounded-full bg-primary border-2 border-surface flex items-center justify-center font-bold text-xs text-white">B</div>
                  <div className="w-10 h-10 rounded-full bg-secondary border-2 border-surface flex items-center justify-center font-bold text-xs text-white">C</div>
                </div>
              </div>
            </div>
            {/* Feature 3 */}
            <div className="bg-surface-container-lowest p-6 sm:p-10 rounded-2xl border border-outline-variant/10 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-2xl font-headline font-bold">Legal Shield</h3>
              <p className="text-on-surface-variant">Automatic smart contracts generate a legally binding DPDP-compliant agreement for every single brand partnership.</p>
            </div>
            {/* Feature 4 */}
            <div className="md:col-span-2 bg-inverse-surface text-on-primary p-6 sm:p-10 rounded-2xl relative overflow-hidden group">
              <div className="relative z-10 space-y-5 sm:space-y-6">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold">Ready to transcend the physical?</h3>
                <p className="text-surface-variant max-w-md">Join over 5,000 elite creators who have already automated their commercial modeling career.</p>
                <button className="bg-primary hover:bg-primary-dim text-white px-8 py-3 rounded-xl font-headline font-bold transition-all inline-flex items-center gap-2">
                  Apply to Join <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              {/* Decorative mesh */}
              <div className="absolute top-0 right-0 w-1/2 h-full opacity-30 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent"></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
