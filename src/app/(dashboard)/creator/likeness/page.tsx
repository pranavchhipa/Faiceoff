"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/likeness — Creator's LoRA + reference photos + niche management
//
// Editorial layout with a portrait hero, LoRA training status card, reference
// photo grid with upload slot, and niche/pricing chips. This is where the
// creator controls how their face is used (which is the whole product).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  IndianRupee,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface CategoryInfo {
  category: string;
  price_per_generation_paise: number;
  subcategories: string[];
}

interface LoraInfo {
  training_status?: string | null;
  creator_approved?: boolean | null;
}

interface CreatorProfile {
  instagram_handle: string | null;
  bio: string | null;
  kyc_status: string | null;
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const MOCK_PHOTOS = [
  "/landing/creator-face.jpg",
  "/landing/creator-2.jpg",
  "/landing/creator-3.jpg",
  "/landing/product-sneaker.jpg",
  "/landing/product-phone.jpg",
  "/landing/product-skincare.jpg",
];

export default function CreatorLikenessPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [lora, setLora] = useState<LoraInfo | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Creator";
  const firstName = displayName.split(" ")[0];
  const avatarUrl =
    (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ??
    null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          if (data.creator) setProfile(data.creator);
          if (data.loraStatus) setLora(data.loraStatus);
          if (typeof data.photoCount === "number")
            setPhotoCount(data.photoCount);
          if (data.categories) setCategories(data.categories);
        }
      } catch (err) {
        console.error("Likeness fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (user) load();
  }, [user]);

  // Seed values for empty accounts
  const photos = photoCount > 0 ? photoCount : 28;
  const targetPhotos = 30;
  const progress = Math.min(100, Math.round((photos / targetPhotos) * 100));
  const loraTrained = lora?.training_status === "succeeded";
  const kycVerified = profile?.kyc_status === "approved";

  const niches =
    categories.length > 0
      ? categories
      : [
          {
            category: "Fashion",
            price_per_generation_paise: 250_000,
            subcategories: ["Editorial", "Streetwear"],
          },
          {
            category: "Beauty",
            price_per_generation_paise: 250_000,
            subcategories: ["Skincare", "Makeup"],
          },
          {
            category: "Lifestyle",
            price_per_generation_paise: 200_000,
            subcategories: ["Home", "Travel"],
          },
        ];

  if (loading) return <LikenessSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 md:mb-8"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Fingerprint className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          Your face · your rules
        </p>
        <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
          Likeness
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
          Every generation uses your trained LoRA. More reference photos = sharper output.
          Control which niches brands can book, and set your per-generation rate.
        </p>
      </motion.div>

      {/* ═══════════ Hero — portrait + LoRA status ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr] lg:gap-6"
      >
        {/* Portrait */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="relative aspect-[16/10] bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-muted)]">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={firstName}
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 600px"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-display text-[120px] font-800 text-[var(--color-muted-foreground)]/30">
                {firstName[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-5">
              <div className="mb-2 flex items-center gap-2">
                {kycVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 font-mono text-[9px] font-800 uppercase tracking-wider text-white backdrop-blur-sm">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    KYC live
                  </span>
                )}
                {loraTrained && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 font-mono text-[9px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)]">
                    <Sparkles className="h-2.5 w-2.5" />
                    LoRA trained
                  </span>
                )}
              </div>
              <h2 className="font-display text-[26px] font-800 tracking-tight text-white">
                {firstName}
              </h2>
              {profile?.instagram_handle && (
                <p className="font-mono text-[11px] text-white/80">
                  @{profile.instagram_handle.replace(/^@/, "")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* LoRA status card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                LoRA model
              </p>
              <h3 className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
                {loraTrained ? "Trained & ready" : "Training soon"}
              </h3>
            </div>
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                loraTrained
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              }`}
            >
              {loraTrained ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <RefreshCw className="h-5 w-5 animate-spin" />
              )}
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
              <span>Reference photos</span>
              <span className="font-700 text-[var(--color-foreground)]">
                {photos} / {targetPhotos}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-secondary)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)]/70 to-[var(--color-primary)]"
              />
            </div>
          </div>

          <p className="mt-3 text-[12px] text-[var(--color-muted-foreground)]">
            {loraTrained
              ? `Your LoRA was trained on ${photos} photos. Add more to sharpen niches or retrain with recent looks.`
              : `Upload ${targetPhotos - photos} more reference photos to kick off LoRA training. Takes ~18min on our GPU.`}
          </p>

          <div className="mt-4 flex gap-2">
            <button className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform hover:-translate-y-0.5">
              <Upload className="h-3.5 w-3.5" />
              Upload photos
            </button>
            {loraTrained && (
              <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]">
                <RefreshCw className="h-3.5 w-3.5" />
                Retrain
              </button>
            )}
          </div>
        </div>
      </motion.section>

      {/* ═══════════ Reference photo grid ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Reference photos
            </p>
            <h3 className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              {photos} uploaded
            </h3>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]">
            <Camera className="h-3 w-3" />
            Guidelines
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {MOCK_PHOTOS.map((src, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.03, duration: 0.3 }}
              className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--color-border)]"
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="120px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-md">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          ))}

          {/* Add slot */}
          <button className="group flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-background)]/30 text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]">
            <div className="text-center">
              <Plus className="mx-auto h-5 w-5" />
              <p className="mt-0.5 font-mono text-[9px] font-700 uppercase tracking-wider">
                +{targetPhotos - photos}
              </p>
            </div>
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3 w-3 text-[var(--color-primary)]" />
          Clear light, varied angles, solo shots. Aim for {targetPhotos}+ for max fidelity.
        </p>
      </motion.section>

      {/* ═══════════ Niches + pricing ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Niches & pricing
            </p>
            <h3 className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              Where brands can book you
            </h3>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-700 text-[var(--color-primary-foreground)]">
            <Plus className="h-3 w-3" />
            Add niche
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {niches.map((n, i) => (
            <motion.div
              key={n.category}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/40 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)]">
                  <Tag className="h-2.5 w-2.5" />
                  {n.category}
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <IndianRupee className="h-5 w-5 text-[var(--color-foreground)]" />
                <p className="font-display text-[26px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                  {(n.price_per_generation_paise / 100).toLocaleString("en-IN")}
                </p>
                <span className="text-[11px] text-[var(--color-muted-foreground)]">/gen</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {n.subcategories?.map((sub) => (
                  <span
                    key={sub}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-[10px] font-600 text-[var(--color-muted-foreground)]"
                  >
                    {sub}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          <ShieldCheck className="h-3 w-3 text-[var(--color-primary)]" />
          Block-listed concepts are checked via pgvector before every generation.
          Update anytime.
        </p>
      </motion.section>
    </div>
  );
}

/* ───────── Skeleton ───────── */

function LikenessSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1200px] animate-pulse px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-8 h-16 w-56 rounded-lg bg-[var(--color-secondary)]" />
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr] lg:gap-6">
        <div className="aspect-[16/10] rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-[240px] rounded-2xl bg-[var(--color-secondary)]" />
      </div>
      <div className="mb-6 h-[280px] rounded-2xl bg-[var(--color-secondary)]" />
      <div className="h-[240px] rounded-2xl bg-[var(--color-secondary)]" />
    </div>
  );
}
