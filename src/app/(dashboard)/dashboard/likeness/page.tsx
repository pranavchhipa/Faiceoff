"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import {
  ScanFace,
  Camera,
  Shield,
  Brain,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  ImagePlus,
  Sparkles,
} from "lucide-react";

/* ── Types ── */

interface LoraModel {
  id: string;
  replicate_model_id: string | null;
  training_status: string;
  version: number;
  creator_approved: boolean;
  sample_images: string[] | null;
  created_at: string;
}

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

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "Trained", color: "bg-[var(--color-mint)] text-emerald-700", icon: CheckCircle2 },
  trained: { label: "Trained", color: "bg-[var(--color-mint)] text-emerald-700", icon: CheckCircle2 },
  training: { label: "Training", color: "bg-amber-50 text-amber-700", icon: Loader2 },
  queued: { label: "Queued", color: "bg-[var(--color-ocean)] text-blue-700", icon: Clock },
  pending: { label: "Pending", color: "bg-[var(--color-ocean)] text-blue-700", icon: Clock },
  failed: { label: "Failed", color: "bg-red-50 text-red-600", icon: AlertTriangle },
};

export default function LikenessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loraModel, setLoraModel] = useState<LoraModel | null>(null);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [blockedConcepts, setBlockedConcepts] = useState<ComplianceVector[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTraining, setIsTraining] = useState(false);
  const [isNonCreator, setIsNonCreator] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Route through API (admin client bypasses RLS). Client-side supabase
    // reads on `creators` have been flaky — see /api/creator/likeness-data.
    try {
      const res = await fetch("/api/creator/likeness-data", { cache: "no-store" });
      const data = (await res.json()) as {
        isCreator?: boolean;
        loraModel?: LoraModel | null;
        photos?: ReferencePhoto[];
        blockedConcepts?: ComplianceVector[];
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
      setLoraModel(data.loraModel ?? null);
      setPhotos(data.photos ?? []);
      setBlockedConcepts(data.blockedConcepts ?? []);
    } catch (err) {
      console.error("[likeness] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // Poll training status every 20s while a training is in progress
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/lora/status", { cache: "no-store" });
      const data = (await res.json()) as {
        status?: string;
        error?: string;
      };

      if (data.status === "completed") {
        toast.success("Your face model is trained and ready!");
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        await fetchData();
      } else if (data.status === "failed") {
        toast.error(`Training failed: ${data.error ?? "unknown error"}`);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        await fetchData();
      }
    } catch (err) {
      console.error("[lora/status] poll error", err);
    }
  }, [fetchData]);

  useEffect(() => {
    if (loraModel?.training_status === "training" && !pollRef.current) {
      pollRef.current = setInterval(pollStatus, 20_000);
      // First poll immediately (helps sync state right after nav)
      pollStatus();
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loraModel?.training_status, pollStatus]);

  async function handleTrainFace() {
    if (photos.length < 4) {
      toast.error("Upload at least 4 reference photos before training.");
      return;
    }

    setIsTraining(true);
    try {
      const res = await fetch("/api/lora/train", { method: "POST" });
      const data = (await res.json()) as {
        success?: boolean;
        training_id?: string;
        training_status?: string;
        error?: string;
        already_training?: boolean;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to start training");
        return;
      }

      if (data.already_training) {
        toast.info("Training is already in progress — hang tight.");
      } else {
        toast.success("Training started! This takes ~25 minutes.");
      }

      await fetchData();
    } catch (err) {
      console.error("[lora/train]", err);
      toast.error("Something went wrong starting training.");
    } finally {
      setIsTraining(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[var(--color-ink)]/30" />
      </div>
    );
  }

  // Non-creator (brand/admin) — show a helpful message instead of empty creator UI
  if (isNonCreator) {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-700 text-[var(--color-ink)]">My Likeness</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink)]/50">
            Manage your face model, reference photos, and likeness settings
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 text-center" style={ghostBorder}>
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-[var(--color-ocean)]">
            <ScanFace className="size-6 text-blue-600" />
          </div>
          <h2 className="text-base font-700 text-[var(--color-ink)]">
            This page is for creators
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[var(--color-ink)]/55">
            You&rsquo;re signed in with a brand account. Likeness and face model
            settings live on creator accounts. Brands discover and license
            creators from the Discover page.
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

  const status = STATUS_MAP[loraModel?.training_status ?? "pending"] ?? STATUS_MAP.pending;
  const StatusIcon = status.icon;
  const canTrain =
    photos.length >= 4 &&
    (!loraModel ||
      loraModel.training_status === "queued" ||
      loraModel.training_status === "failed");
  const isCurrentlyTraining = loraModel?.training_status === "training";

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-700 text-[var(--color-ink)]">My Likeness</h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink)]/50">
          Manage your face model, reference photos, and likeness settings
        </p>
      </div>

      {/* LoRA Model Status */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-lilac)]">
            <Brain className="size-4.5 text-[var(--color-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-700 text-[var(--color-ink)]">AI Face Model</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-600 ${status.color}`}>
                <StatusIcon className="size-3" />
                {status.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-ink)]/45">
              {loraModel
                ? `Model v${loraModel.version} — ${loraModel.replicate_model_id ? "Connected to Replicate" : "Awaiting deployment"}`
                : "No model trained yet. Complete onboarding to start training."
              }
            </p>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-3">
          {[
            { label: "Model Version", value: loraModel ? `v${loraModel.version}` : "—", sub: loraModel ? "Latest" : "N/A" },
            { label: "Training Images", value: String(photos.length), sub: "Reference photos" },
            { label: "Total Generations", value: "0", sub: "All time" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-[var(--color-surface-container-lowest)] p-3" style={ghostBorder}>
              <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-ink)]/35">{stat.label}</p>
              <p className="mt-0.5 text-base font-700 text-[var(--color-ink)]">{stat.value}</p>
              <p className="text-[11px] text-[var(--color-ink)]/35">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Training CTA */}
        {loraModel?.training_status !== "completed" && (
          <div className="mt-3.5 flex items-center justify-between gap-3 rounded-lg bg-[var(--color-lilac)]/50 px-3.5 py-3" style={ghostBorder}>
            <div className="min-w-0 flex-1">
              {isCurrentlyTraining ? (
                <>
                  <p className="text-[13px] font-600 text-[var(--color-ink)]">
                    Training in progress
                  </p>
                  <p className="text-[11px] text-[var(--color-ink)]/50">
                    This usually takes ~25 minutes. You can close this page — we&rsquo;ll pick it up when it&rsquo;s done.
                  </p>
                </>
              ) : photos.length < 4 ? (
                <>
                  <p className="text-[13px] font-600 text-[var(--color-ink)]">
                    Upload more photos to train your face model
                  </p>
                  <p className="text-[11px] text-[var(--color-ink)]/50">
                    You have {photos.length} photo{photos.length !== 1 ? "s" : ""} — need at least 4 (10-15 recommended).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-600 text-[var(--color-ink)]">
                    {loraModel?.training_status === "failed"
                      ? "Last training failed — retry now"
                      : "Ready to train your AI face model"}
                  </p>
                  <p className="text-[11px] text-[var(--color-ink)]/50">
                    Uses your {photos.length} reference photos. Takes ~25 min, one-time cost.
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleTrainFace}
              disabled={!canTrain || isTraining || isCurrentlyTraining}
              className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3.5 py-2 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isTraining ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Starting…
                </>
              ) : isCurrentlyTraining ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Training…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  {loraModel?.training_status === "failed" ? "Retry training" : "Train my face"}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Reference Photos */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-blush)]">
              <Camera className="size-4 text-rose-600" />
            </div>
            <div>
              <h2 className="text-sm font-700 text-[var(--color-ink)]">Reference Photos</h2>
              <p className="text-xs text-[var(--color-ink)]/45">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} used to train your face model
              </p>
            </div>
          </div>
          <button className="rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3 py-1.5 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80">
            Upload More
          </button>
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
              ))
          }
        </div>
      </div>

      {/* Likeness Protection */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-ocean)]">
            <Shield className="size-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-700 text-[var(--color-ink)]">Likeness Protection</h2>
            <p className="text-xs text-[var(--color-ink)]/45">
              {blockedConcepts.length} blocked concept{blockedConcepts.length !== 1 ? "s" : ""}
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
                <span className="text-[13px] font-500 text-[var(--color-ink)]">{item.blocked_concept}</span>
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
              No blocked concepts set. Add concepts you never want associated with your likeness.
            </p>
          </div>
        )}

        <button className="mt-3 text-xs font-600 text-[var(--color-primary)] hover:underline">
          Manage blocked concepts &rarr;
        </button>
      </div>
    </div>
  );
}
