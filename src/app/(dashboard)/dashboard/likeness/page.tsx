"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ScanFace,
  Camera,
  Shield,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Info,
} from "lucide-react";

/* ── Types ── */

interface ReferencePhoto {
  id: string;
  storage_path: string;
  is_primary: boolean;
  uploaded_at: string;
  url: string | null;
}

interface ComplianceVector {
  id: string;
  blocked_concept: string;
  created_at: string;
}

/* ── Constants ── */

const ghostBorder = { border: "1px solid rgba(171,173,174,0.18)" };

/**
 * My Likeness — creator-facing settings surface for the face anchor pipeline.
 *
 * Pipeline note:
 *   LoRA training was retired in migration 00026. The live generation flow
 *   (`/api/generations/create` → Replicate Flux Kontext Max) uses the
 *   creator's reference photos as identity anchors at generation time — no
 *   per-creator model, no training step. This page is the read-only surface
 *   over reference photos + blocked concepts.
 */
export default function LikenessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [blockedConcepts, setBlockedConcepts] = useState<ComplianceVector[]>(
    [],
  );
  const [totalGenerations, setTotalGenerations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isNonCreator, setIsNonCreator] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await fetch("/api/creator/likeness-data", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        isCreator?: boolean;
        photos?: ReferencePhoto[];
        blockedConcepts?: ComplianceVector[];
        totalGenerations?: number;
        error?: string;
      };

      if (!res.ok) {
        console.error("[likeness] fetch failed", data.error);
        setLoading(false);
        return;
      }

      if (!data.isCreator) {
        setIsNonCreator(true);
        setLoading(false);
        return;
      }

      setIsNonCreator(false);
      setPhotos(data.photos ?? []);
      setBlockedConcepts(data.blockedConcepts ?? []);
      setTotalGenerations(data.totalGenerations ?? 0);
    } catch (err) {
      console.error("[likeness] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[var(--color-ink)]/30" />
      </div>
    );
  }

  // Non-creator (brand/admin) — show a helpful message
  if (isNonCreator) {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-700 text-[var(--color-ink)]">
            My Likeness
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink)]/50">
            Manage your reference photos and likeness settings
          </p>
        </div>
        <div
          className="rounded-xl bg-white p-6 text-center"
          style={ghostBorder}
        >
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-[var(--color-ocean)]">
            <ScanFace className="size-6 text-blue-600" />
          </div>
          <h2 className="text-base font-700 text-[var(--color-ink)]">
            This page is for creators
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[var(--color-ink)]/55">
            You&rsquo;re signed in with a brand account. Likeness settings live
            on creator accounts. Brands discover and license creators from the
            Discover page.
          </p>
          <a
            href="/dashboard/creators"
            className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-4 py-2 text-xs font-600 text-white hover:bg-[var(--color-ink)]/80"
          >
            Go to Discover Creators
          </a>
        </div>
      </div>
    );
  }

  const hasEnoughPhotos = photos.length >= 3;

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-700 text-[var(--color-ink)]">
          My Likeness
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink)]/50">
          Your reference photos are used as face anchors when brands generate
          approved content with your likeness
        </p>
      </div>

      {/* ─── Status Hero ─── */}
      <div
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-mint)]/60 via-white to-[var(--color-lilac)]/40 p-5"
        style={ghostBorder}
      >
        <div className="absolute -right-12 -top-12 size-48 rounded-full bg-[var(--color-mint)] opacity-30 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              {hasEnoughPhotos ? (
                <CheckCircle2 className="size-5 text-emerald-600" />
              ) : (
                <Info className="size-5 text-[var(--color-ink)]/60" />
              )}
            </div>
            <div>
              <h2 className="text-base font-700 text-[var(--color-ink)]">
                {hasEnoughPhotos
                  ? "Your likeness is ready"
                  : "Add more reference photos"}
              </h2>
              <p className="text-[12px] text-[var(--color-ink)]/55">
                {hasEnoughPhotos
                  ? "Brands can now generate content with your likeness. Each generation uses your photos as face anchors — no model training required."
                  : `You have ${photos.length} photo${photos.length !== 1 ? "s" : ""} — we recommend at least 3 (5+ for best results).`}
              </p>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div
              className="rounded-lg bg-white/70 p-2.5"
              style={ghostBorder}
            >
              <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                Reference photos
              </p>
              <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                {photos.length}
              </p>
            </div>
            <div
              className="rounded-lg bg-white/70 p-2.5"
              style={ghostBorder}
            >
              <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                Blocked concepts
              </p>
              <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                {blockedConcepts.length}
              </p>
            </div>
            <div
              className="rounded-lg bg-white/70 p-2.5"
              style={ghostBorder}
            >
              <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                Generations
              </p>
              <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                {totalGenerations}
              </p>
            </div>
          </div>

          {!hasEnoughPhotos && (
            <div className="mt-3">
              <a
                href="/dashboard/onboarding/photos"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3.5 py-2 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80"
              >
                <ImagePlus className="size-3.5" />
                Add reference photos
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ─── Reference Photos ─── */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-blush)]">
              <Camera className="size-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-700 text-[var(--color-ink)]">
                Reference Photos
              </h2>
              <p className="text-xs text-[var(--color-ink)]/45">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} — used as
                face anchors for each generation
              </p>
            </div>
          </div>
          <a
            href="/dashboard/onboarding/photos"
            className="shrink-0 text-center rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3 py-1.5 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80"
          >
            {photos.length > 0 ? "Manage photos" : "Add photos"}
          </a>
        </div>

        <div className="mt-3.5 grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:grid-cols-8">
          {photos.length > 0
            ? photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg bg-[var(--color-surface-container-lowest)] flex items-center justify-center overflow-hidden"
                  style={ghostBorder}
                >
                  {photo.is_primary && (
                    <span className="absolute top-1 left-1 z-10 rounded bg-[var(--color-primary)] px-1 py-px text-[9px] font-600 text-white">
                      Primary
                    </span>
                  )}
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt="Reference"
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ScanFace className="size-5 text-[var(--color-ink)]/12" />
                  )}
                </div>
              ))
            : Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg bg-[var(--color-surface-container-lowest)] flex items-center justify-center"
                  style={ghostBorder}
                >
                  {i === 0 ? (
                    <ImagePlus className="size-5 text-[var(--color-ink)]/12" />
                  ) : (
                    <ScanFace className="size-5 text-[var(--color-ink)]/10" />
                  )}
                </div>
              ))}
        </div>
      </div>

      {/* ─── Likeness Protection ─── */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-ocean)]">
            <Shield className="size-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-700 text-[var(--color-ink)]">
              Likeness Protection
            </h2>
            <p className="text-xs text-[var(--color-ink)]/45">
              {blockedConcepts.length} blocked concept
              {blockedConcepts.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {blockedConcepts.length > 0 ? (
          <div className="space-y-2">
            {blockedConcepts.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-[var(--color-surface-container-lowest)] px-3 py-2"
                style={ghostBorder}
              >
                <span className="text-[13px] font-500 text-[var(--color-ink)]">
                  {item.blocked_concept}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-600 text-red-600">
                  <Shield className="size-2.5" />
                  Blocked
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Shield className="size-6 text-[var(--color-ink)]/15 mb-2" />
            <p className="text-xs font-500 text-[var(--color-ink)]/40">
              No blocked concepts set. Add concepts you never want associated
              with your likeness.
            </p>
          </div>
        )}

        <a href="/creator/blocked-categories" className="mt-3 text-xs font-600 text-[var(--color-primary)] hover:underline inline-block">
          Manage blocked concepts &rarr;
        </a>
      </div>
    </div>
  );
}
