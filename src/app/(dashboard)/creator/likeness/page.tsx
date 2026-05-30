"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/likeness — Creator's face model + reference photos + niche management
//
// Editorial layout with a portrait hero, face-model readiness card, reference
// photo grid with upload slot, and niche/pricing chips. This is where the
// creator controls how their face is used (which is the whole product).
//
// Pipeline note: per migration 00026 we no longer train per-creator LoRAs.
// The face model is "ready" when the creator has enough reference photos
// uploaded — those feed Flux Kontext Max directly as multi-image identity.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";

interface CreatorProfile {
  instagram_handle: string | null;
  bio: string | null;
  kyc_status: string | null;
}

interface ReferencePhoto {
  id: string;
  url: string | null;
  is_primary: boolean;
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function CreatorLikenessPage() {
  const { user } = useAuth();
  const { data: statsData, loading: statsLoading } = useCachedFetch<{
    creator?: CreatorProfile;
  }>(user ? "/api/dashboard/stats" : null);
  const { data: likenessData, loading: likenessLoading, refresh: refetchLikeness } =
    useCachedFetch<{ photos?: ReferencePhoto[] }>(
      user ? "/api/creator/likeness-data" : null,
    );

  const profile = statsData?.creator ?? null;
  const [optimisticPhotos, setOptimisticPhotos] = useState<
    ReferencePhoto[] | null
  >(null);
  const referencePhotos = optimisticPhotos ?? likenessData?.photos ?? [];
  const loading =
    (statsLoading && !statsData) || (likenessLoading && !likenessData);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);

  async function handleSetPrimary(photoId: string) {
    if (settingPrimary) return;
    setSettingPrimary(photoId);
    // Optimistic: update local state immediately
    setOptimisticPhotos((prev) => {
      const base = prev ?? likenessData?.photos ?? [];
      return base.map((p) => ({ ...p, is_primary: p.id === photoId }));
    });
    try {
      const res = await fetch(
        `/api/creator/reference-photos/${photoId}/set-primary`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.message ?? j.error ?? "Couldn't set primary");
        // Reload from server to undo the optimistic state
        await refetchLikeness();
        setOptimisticPhotos(null);
      } else {
        await refetchLikeness();
        setOptimisticPhotos(null);
      }
    } catch (err) {
      console.error("[likeness] set-primary failed", err);
    } finally {
      setSettingPrimary(null);
    }
  }

  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Creator";
  const firstName = displayName.split(" ")[0];
  const avatarUrl =
    (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ??
    null;

  const photos = referencePhotos.length;
  const targetPhotos = 30;
  const progress = Math.min(100, Math.round((photos / targetPhotos) * 100));
  // Face model is "ready" when the creator has enough reference photos
  // queued — those feed Flux Kontext directly (LoRA training retired in 00026).
  const faceModelReady = photos >= targetPhotos;
  const kycVerified = profile?.kyc_status === "approved";

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
          Every generation uses your reference photos as the identity anchor —
          more photos = sharper output. Control which niches brands can book,
          and set your per-generation rate.
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
                {faceModelReady && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 font-mono text-[9px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)]">
                    <Sparkles className="h-2.5 w-2.5" />
                    Face model live
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

        {/* Face model status card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                Face model
              </p>
              <h3 className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
                {faceModelReady ? "Live & ready" : "Add more photos"}
              </h3>
            </div>
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                faceModelReady
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              }`}
            >
              {faceModelReady ? (
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
            {faceModelReady
              ? `Your face model is anchored on ${photos} reference photos. Add more to sharpen niches or refresh with newer looks.`
              : `Upload ${targetPhotos - photos} more reference photos to make your face model live. Brands can book the moment you cross the threshold.`}
          </p>

          <div className="mt-4 flex gap-2">
            <a
              href="/dashboard/onboarding/photos"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform hover:-translate-y-0.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload photos
            </a>
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

        {referencePhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)]/30 py-12 text-center">
            <Camera className="h-6 w-6 text-[var(--color-muted-foreground)]" />
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              No reference photos yet
            </p>
            <p className="max-w-sm text-[12px] text-[var(--color-muted-foreground)]">
              Upload at least {targetPhotos} clear, varied solo shots of your
              face to make brands able to book you.
            </p>
            <a
              href="/dashboard/onboarding/photos"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-700 text-[var(--color-primary-foreground)]"
            >
              <Upload className="h-3 w-3" />
              Upload now
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {referencePhotos.map((photo, i) => {
              const isLoading = settingPrimary === photo.id;
              return (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.08 + i * 0.03, duration: 0.3 }}
                  className={`group relative aspect-square overflow-hidden rounded-lg border bg-[var(--color-secondary)] transition-all ${
                    photo.is_primary
                      ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt=""
                      fill
                      sizes="120px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Camera className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                    </div>
                  )}
                  {photo.is_primary && (
                    <span className="absolute left-1 top-1 z-10 inline-flex items-center gap-0.5 rounded bg-[var(--color-primary)] px-1 py-px font-mono text-[8px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)]">
                      <Star className="h-2 w-2 fill-current" />
                      Primary
                    </span>
                  )}

                  {/* Hover overlay: Set primary + Delete actions */}
                  <div className="absolute inset-0 flex flex-col items-stretch justify-end gap-1 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {!photo.is_primary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(photo.id)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--color-primary)]/95 px-1.5 py-1 font-mono text-[9px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)] backdrop-blur-md transition hover:bg-[var(--color-primary)] disabled:opacity-60"
                      >
                        {isLoading ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Star className="h-2.5 w-2.5" />
                        )}
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 rounded-md bg-black/55 px-1.5 py-1 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md transition hover:bg-black/75"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                      Delete
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {photos < targetPhotos && (
              <a
                href="/dashboard/onboarding/photos"
                className="group flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-background)]/30 text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]"
              >
                <div className="text-center">
                  <Plus className="mx-auto h-5 w-5" />
                  <p className="mt-0.5 font-mono text-[9px] font-700 uppercase tracking-wider">
                    +{targetPhotos - photos}
                  </p>
                </div>
              </a>
            )}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3 w-3 text-[var(--color-primary)]" />
          Clear light, varied angles, solo shots. Aim for {targetPhotos}+ for max fidelity.
        </p>
      </motion.section>

      {/* ═══════════ Manage your face — quick links ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <ManageCard
          icon={ShieldCheck}
          label="Blocked categories"
          desc="Concepts that brands can never generate with your face. Three-layer check (keywords + vector + LLM) on every request."
          href="/creator/blocked-categories"
        />
        <ManageCard
          icon={Sparkles}
          label="Packages & pricing"
          desc="Set the Frame / Feature / Cover packs brands can book — that's where your per-collab pricing lives."
          href="/creator/packages"
        />
      </motion.section>
    </div>
  );
}

/* ───────── Manage card ───────── */

function ManageCard({
  icon: Icon,
  label,
  desc,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]/30"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
          {label}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
          {desc}
        </p>
      </div>
      <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]">
        Open →
      </span>
    </a>
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
