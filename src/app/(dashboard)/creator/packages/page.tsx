"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Tags,
  Zap,
  Globe,
  Star,
  ToggleLeft,
  ToggleRight,
  IndianRupee,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const TIERS = [
  {
    id: "frame" as const,
    label: "Frame",
    badge: "Social · Organic",
    duration: "90-day license",
    icon: ImageIcon,
    forCreator: "Brand uses your AI-generated likeness for organic social posts — no paid ads. Lowest commitment, great for testing a brand fit.",
    forBrand: "Organic reach only. Posts on the brand's social handles for 90 days. No boosting or paid distribution.",
    defaultPrice: 300000,  // ₹3,000
    band: "from-sky-400 to-sky-600",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    badgeColor: "text-sky-400",
    forYouBg: "bg-sky-500/8",
    btnBg: "bg-sky-500 hover:bg-sky-400",
  },
  {
    id: "feature" as const,
    label: "Feature",
    badge: "Social · Paid",
    duration: "6-month license",
    icon: Zap,
    forCreator: "Brand can run paid ads using your likeness — Instagram, YouTube, Google Display. Higher value, more brand visibility for you.",
    forBrand: "Paid & boosted ads across social platforms. Includes organic too. Valid for 6 months from date of first use.",
    defaultPrice: 750000,  // ₹7,500
    band: "from-[#c9a96e] to-[#e8c89a]",
    iconBg: "bg-[var(--color-primary)]/15",
    iconColor: "text-[var(--color-primary)]",
    badgeColor: "text-[var(--color-primary)]",
    forYouBg: "bg-[var(--color-primary)]/8",
    btnBg: "bg-[var(--color-primary)] hover:opacity-90",
  },
  {
    id: "cover" as const,
    label: "Cover",
    badge: "Full Digital",
    duration: "12-month license",
    icon: Globe,
    forCreator: "Full digital rights — brand can use your likeness on website, OOH, packaging, email, and all ad platforms. Top-tier engagement.",
    forBrand: "Unlimited digital usage — web, OOH, email, packaging, all ad platforms. Broadest rights for 12 months.",
    defaultPrice: 1500000, // ₹15,000
    band: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    badgeColor: "text-violet-400",
    forYouBg: "bg-violet-500/8",
    btnBg: "bg-violet-600 hover:bg-violet-500",
  },
] as const;

type Tier = (typeof TIERS)[number]["id"];

interface Package {
  id: string;
  tier: Tier;
  price_paise: number;
  final_images: number;
  is_active: boolean;
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function PriceInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = useState(String(Math.round(value / 100)));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const s = e.target.value.replace(/[^0-9]/g, "");
    setRaw(s);
    const n = parseInt(s, 10);
    if (!isNaN(n)) onChange(n * 100);
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-700 text-[var(--color-muted-foreground)]">
        ₹
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={handleChange}
        onBlur={() => setRaw(String(Math.round(value / 100)))}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] py-2 pl-7 pr-3 text-[14px] font-700 text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30"
      />
    </div>
  );
}

function ImagesInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] text-[14px] font-800 text-[var(--color-foreground)] hover:bg-[var(--color-card)] active:scale-95"
      >
        −
      </button>
      <span className="w-8 text-center font-display text-[16px] font-800 text-[var(--color-foreground)]">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] text-[14px] font-800 text-[var(--color-foreground)] hover:bg-[var(--color-card)] active:scale-95"
      >
        +
      </button>
    </div>
  );
}

interface PackageCardProps {
  tier: (typeof TIERS)[number];
  pkg: Package | null;
  saving: boolean;
  onSave: (tier: Tier, price_paise: number, final_images: number) => void;
  onToggle: (tier: Tier, is_active: boolean) => void;
}

function PackageCard({ tier, pkg, saving, onSave, onToggle }: PackageCardProps) {
  const [price, setPrice] = useState(pkg?.price_paise ?? tier.defaultPrice);
  const [images, setImages] = useState(pkg?.final_images ?? 5);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (pkg) {
      setPrice(pkg.price_paise);
      setImages(pkg.final_images);
      setDirty(false);
    }
  }, [pkg]);

  const Icon = tier.icon;
  const exists = !!pkg;
  const isActive = pkg?.is_active ?? false;

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
    >
      {/* Coloured top band */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${tier.band}`} />

      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tier.iconBg}`}>
              <Icon className={`h-5 w-5 ${tier.iconColor}`} />
            </span>
            <div>
              <h3 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
                {tier.label}
              </h3>
              <span className={`text-[11px] font-600 ${tier.badgeColor}`}>
                {tier.badge} · {tier.duration}
              </span>
            </div>
          </div>
          {exists && (
            <button
              type="button"
              onClick={() => onToggle(tier.id, !isActive)}
              className="flex items-center gap-1 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            >
              {isActive
                ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                : <ToggleLeft className="h-5 w-5" />}
              {isActive ? "Active" : "Paused"}
            </button>
          )}
        </div>

        {/* Descriptions */}
        <div className="space-y-3">
          <div className={`rounded-xl p-3 ${tier.forYouBg}`}>
            <p className={`text-[10px] font-700 uppercase tracking-[0.14em] mb-1 ${tier.iconColor}`}>For you</p>
            <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed">{tier.forCreator}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-secondary)] p-3">
            <p className="text-[10px] font-700 uppercase tracking-[0.14em] mb-1 text-[var(--color-muted-foreground)]">Brand gets</p>
            <p className="text-[13px] text-[var(--color-muted-foreground)] leading-relaxed">{tier.forBrand}</p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-700 text-[var(--color-muted-foreground)]">
              Package price
            </label>
            <PriceInput value={price} onChange={(v) => { setPrice(v); setDirty(true); }} />
            {price < 150000 && <p className="mt-1 text-[11px] text-red-400">Min ₹1,500</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-700 text-[var(--color-muted-foreground)]">
              Final images
            </label>
            <ImagesInput value={images} onChange={(v) => { setImages(v); setDirty(true); }} />
          </div>
        </div>

        {/* Save button */}
        <button
          type="button"
          disabled={saving || price < 150000}
          onClick={() => { onSave(tier.id, price, images); setDirty(false); }}
          className={`mt-auto w-full rounded-xl py-3 text-[14px] font-700 transition-all active:scale-[0.98] disabled:opacity-40 ${
            exists && !dirty
              ? "border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
              : `${tier.btnBg} text-white shadow-lg`
          }`}
        >
          {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            : exists && !dirty ? "✓ Saved"
            : exists ? "Save changes"
            : "Add package"}
        </button>
      </div>
    </motion.div>
  );
}

export default function CreatorPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Tier | null>(null);
  const [toggleLiveLoading, setToggleLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pkgRes, creatorRes] = await Promise.all([
        fetch("/api/creator/packages", { cache: "no-store" }),
        fetch("/api/whoami", { cache: "no-store" }),
      ]);
      if (pkgRes.ok) {
        const d = await pkgRes.json();
        setPackages(d.packages ?? []);
      }
      if (creatorRes.ok) {
        const d = await creatorRes.json();
        setIsLive(d.creator?.is_live ?? false);
      }
    } catch (err) {
      console.error("[packages] load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (tier: Tier, price_paise: number, final_images: number) => {
    setSaving(tier);
    setLiveError(null);
    try {
      const res = await fetch("/api/creator/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, price_paise, final_images }),
      });
      const d = await res.json();
      if (!res.ok) {
        setLiveError(d.error ?? `Failed to save ${tier} package`);
        return;
      }
      setPackages((prev) => {
        const filtered = prev.filter((p) => p.tier !== tier);
        return [...filtered, d.package];
      });
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (tier: Tier, is_active: boolean) => {
    const pkg = packages.find((p) => p.tier === tier);
    if (!pkg) return;
    setSaving(tier);
    try {
      const res = await fetch(`/api/creator/packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      if (res.ok) {
        setPackages((prev) =>
          prev.map((p) => (p.id === pkg.id ? { ...p, is_active } : p))
        );
      }
    } finally {
      setSaving(null);
    }
  };

  const handleToggleLive = async () => {
    setLiveError(null);
    setToggleLiveLoading(true);
    try {
      const res = await fetch("/api/creator/go-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_live: !isLive }),
      });
      const d = await res.json();
      if (!res.ok) {
        setLiveError(d.error ?? "Failed to update live status");
      } else {
        setIsLive(d.is_live);
      }
    } finally {
      setToggleLiveLoading(false);
    }
  };

  const hasActive = packages.some((p) => p.is_active);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Tags className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            My Packages
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Set your packages
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Set a price for each tier. Brands pick one and send you a collab request — you approve or decline.
          </p>
        </div>

        {/* Go Live toggle */}
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleToggleLive}
            disabled={toggleLiveLoading || (!isLive && !hasActive)}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-700 transition-all active:scale-[0.98] disabled:opacity-50 ${
              isLive
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)]"
            }`}
          >
            {toggleLiveLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLive ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Star className="h-4 w-4" />
            )}
            {isLive ? "Live — visible to brands" : "Go Live"}
          </button>
          {!hasActive && !isLive && (
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Add at least one package to go live
            </p>
          )}
          {liveError && (
            <p className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="h-3 w-3" /> {liveError}
            </p>
          )}
        </div>
      </motion.div>

      {/* How it works strip */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3.5"
      >
        <IndianRupee className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        <p className="text-[13px] text-[var(--color-muted-foreground)]">
          Brand pays the package price upfront. Funds are held by Faiceoff and released to your balance after you approve the generated images.
        </p>
      </motion.div>

      {/* Package cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier, i) => {
          const pkg = packages.find((p) => p.tier === tier.id) ?? null;
          return (
            <motion.div
              key={tier.id}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.45, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <PackageCard
                tier={tier}
                pkg={pkg}
                saving={saving === tier.id}
                onSave={handleSave}
                onToggle={handleToggle}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Help section */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          How packages work
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <HowItem
            n="1"
            title="Brand picks a tier"
            body="They see your Frame, Feature, or Cover options on your profile and send a request."
          />
          <HowItem
            n="2"
            title="You accept, brand pays"
            body="Review the request and accept if it's a good fit. Brand pays the package price upfront — Faiceoff holds it securely."
          />
          <HowItem
            n="3"
            title="Collab ends, payout released"
            body="Brand generates AI images using your likeness. You review each one. Once the collab is complete, your full payout is released to your Faiceoff balance."
          />
        </div>
      </motion.div>
    </div>
  );
}

function HowItem({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] font-mono text-[10px] font-800 text-[var(--color-primary-foreground)]">
          {n}
        </span>
        <h4 className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
          {title}
        </h4>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
        {body}
      </p>
    </div>
  );
}
