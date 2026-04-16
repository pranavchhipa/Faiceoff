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
  Wand2,
  RefreshCw,
  X,
  Copy,
  ExternalLink,
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
  trigger_word?: string | null;
  training_started_at?: string | null;
  training_completed_at?: string | null;
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

/* ── Helpers ── */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start || !end) return "—";
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
  } catch {
    return "—";
  }
}

export default function LikenessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loraModel, setLoraModel] = useState<LoraModel | null>(null);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [blockedConcepts, setBlockedConcepts] = useState<ComplianceVector[]>([]);
  const [totalGenerations, setTotalGenerations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTraining, setIsTraining] = useState(false);
  const [isNonCreator, setIsNonCreator] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Test-generation modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPrompt, setTestPrompt] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);
  const [testUsedPrompt, setTestUsedPrompt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await fetch("/api/creator/likeness-data", { cache: "no-store" });
      const data = (await res.json()) as {
        isCreator?: boolean;
        loraModel?: LoraModel | null;
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
      setLoraModel(data.loraModel ?? null);
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
      pollStatus();
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loraModel?.training_status, pollStatus]);

  async function handleTrainFace(isRetrain = false) {
    if (photos.length < 4) {
      toast.error("Upload at least 4 reference photos before training.");
      return;
    }

    if (isRetrain) {
      const ok = window.confirm(
        "Retraining will create a new version of your face model using your current photos. Your existing model stays active until the new one finishes. Continue?"
      );
      if (!ok) return;
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
        toast.success(
          isRetrain
            ? "Retraining started! New model in ~25 min."
            : "Training started! This takes ~25 minutes."
        );
      }

      await fetchData();
    } catch (err) {
      console.error("[lora/train]", err);
      toast.error("Something went wrong starting training.");
    } finally {
      setIsTraining(false);
    }
  }

  async function handleTestGeneration() {
    setTestRunning(true);
    setTestImageUrl(null);
    try {
      const res = await fetch("/api/lora/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: testPrompt.trim() || undefined }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        image_url?: string;
        prompt?: string;
        error?: string;
      };

      if (!res.ok || !data.success || !data.image_url) {
        toast.error(data.error ?? "Test generation failed");
        return;
      }

      setTestImageUrl(data.image_url);
      setTestUsedPrompt(data.prompt ?? null);
    } catch (err) {
      console.error("[lora/test]", err);
      toast.error("Something went wrong. Check console.");
    } finally {
      setTestRunning(false);
    }
  }

  function openTestModal() {
    setTestModalOpen(true);
    setTestImageUrl(null);
    setTestUsedPrompt(null);
    setTestPrompt("");
  }

  function copyModelId() {
    if (!loraModel?.replicate_model_id) return;
    navigator.clipboard.writeText(loraModel.replicate_model_id);
    toast.success("Model ID copied");
  }

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
  const isTrained = loraModel?.training_status === "completed";
  const isCurrentlyTraining = loraModel?.training_status === "training";
  const canTrain =
    photos.length >= 4 &&
    (!loraModel ||
      loraModel.training_status === "queued" ||
      loraModel.training_status === "failed");
  const sampleImages = (loraModel?.sample_images ?? []).filter(Boolean);

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-700 text-[var(--color-ink)]">My Likeness</h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink)]/50">
          Manage your face model, reference photos, and likeness settings
        </p>
      </div>

      {/* ─── Trained Hero (replaces the small status card when complete) ─── */}
      {isTrained ? (
        <div
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-mint)]/60 via-white to-[var(--color-lilac)]/40 p-5"
          style={ghostBorder}
        >
          <div className="absolute -right-12 -top-12 size-48 rounded-full bg-[var(--color-mint)] opacity-30 blur-3xl" />
          <div className="relative flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-700 text-[var(--color-ink)]">
                    Your AI face model is live
                  </h2>
                  <p className="text-[12px] text-[var(--color-ink)]/55">
                    Brands can now generate content with your likeness. Test it before they do.
                  </p>
                </div>
              </div>

              {/* Metadata grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-white/70 p-2.5" style={ghostBorder}>
                  <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                    Version
                  </p>
                  <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                    v{loraModel?.version ?? 1}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2.5" style={ghostBorder}>
                  <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                    Trained on
                  </p>
                  <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                    {formatDate(loraModel?.training_completed_at ?? loraModel?.created_at)}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2.5" style={ghostBorder}>
                  <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                    Duration
                  </p>
                  <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                    {formatDuration(
                      loraModel?.training_started_at,
                      loraModel?.training_completed_at
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2.5" style={ghostBorder}>
                  <p className="text-[9px] font-600 uppercase tracking-wider text-[var(--color-ink)]/40">
                    Generations
                  </p>
                  <p className="mt-0.5 text-sm font-700 text-[var(--color-ink)]">
                    {totalGenerations}
                  </p>
                </div>
              </div>

              {/* Model ID + trigger word */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-[var(--color-ink)]/40">Model:</span>
                <button
                  type="button"
                  onClick={copyModelId}
                  className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink)]/70 hover:bg-white"
                  style={ghostBorder}
                  title="Copy model ID"
                >
                  <span className="truncate max-w-[240px]">
                    {loraModel?.replicate_model_id ?? "—"}
                  </span>
                  <Copy className="size-2.5 shrink-0" />
                </button>
                <span className="text-[var(--color-ink)]/40">Trigger:</span>
                <span
                  className="rounded-md bg-white/70 px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink)]/70"
                  style={ghostBorder}
                >
                  {loraModel?.trigger_word ?? "TOK"}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 flex-row sm:flex-col gap-2">
              <button
                type="button"
                onClick={openTestModal}
                className="flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3.5 py-2 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80"
              >
                <Wand2 className="size-3.5" />
                Test my model
              </button>
              <button
                type="button"
                onClick={() => handleTrainFace(true)}
                disabled={isTraining || isCurrentlyTraining}
                className="flex items-center gap-1.5 rounded-[var(--radius-button)] bg-white px-3.5 py-2 text-xs font-600 text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                style={ghostBorder}
              >
                <RefreshCw className={`size-3.5 ${isTraining ? "animate-spin" : ""}`} />
                Retrain
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ─── Non-trained state: original status card ───
        <div className="rounded-xl bg-white p-4" style={ghostBorder}>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-lilac)]">
              <Brain className="size-4.5 text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-700 text-[var(--color-ink)]">AI Face Model</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-600 ${status.color}`}>
                  <StatusIcon className={`size-3 ${isCurrentlyTraining ? "animate-spin" : ""}`} />
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--color-ink)]/45">
                {loraModel
                  ? `Model v${loraModel.version} — ${isCurrentlyTraining ? "Training on Replicate" : "Awaiting training"}`
                  : "No model trained yet. Upload photos and click Train my face."
                }
              </p>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-3">
            {[
              { label: "Model Version", value: loraModel ? `v${loraModel.version}` : "—", sub: loraModel ? "Latest" : "N/A" },
              { label: "Training Images", value: String(photos.length), sub: "Reference photos" },
              { label: "Total Generations", value: String(totalGenerations), sub: "All time" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-[var(--color-surface-container-lowest)] p-3" style={ghostBorder}>
                <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-ink)]/35">{stat.label}</p>
                <p className="mt-0.5 text-base font-700 text-[var(--color-ink)]">{stat.value}</p>
                <p className="text-[11px] text-[var(--color-ink)]/35">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Training CTA */}
          <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-[var(--color-lilac)]/50 px-3.5 py-3" style={ghostBorder}>
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
              onClick={() => handleTrainFace(false)}
              disabled={!canTrain || isTraining || isCurrentlyTraining}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3.5 py-2 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80 disabled:cursor-not-allowed disabled:opacity-40 w-full sm:w-auto"
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
        </div>
      )}

      {/* ─── Sample Outputs (only when trained) ─── */}
      {isTrained && sampleImages.length > 0 && (
        <div className="rounded-xl bg-white p-4" style={ghostBorder}>
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-lilac)]">
              <Sparkles className="size-4 text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-700 text-[var(--color-ink)]">Sample Outputs</h2>
              <p className="text-xs text-[var(--color-ink)]/45">
                Generated during training to preview your model
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {sampleImages.slice(0, 8).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square overflow-hidden rounded-lg bg-[var(--color-surface-container-lowest)]"
                style={ghostBorder}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Sample ${i + 1}`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-600 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ExternalLink className="size-2.5 inline" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ─── Reference Photos ─── */}
      <div className="rounded-xl bg-white p-4" style={ghostBorder}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-blush)]">
              <Camera className="size-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-700 text-[var(--color-ink)]">Reference Photos</h2>
              <p className="text-xs text-[var(--color-ink)]/45">
                {isTrained
                  ? `${photos.length} photo${photos.length !== 1 ? "s" : ""} were used to train your current model. Add more and retrain to update it.`
                  : `${photos.length} photo${photos.length !== 1 ? "s" : ""} ready for training`}
              </p>
            </div>
          </div>
          <a
            href="/dashboard/onboarding/photos"
            className="shrink-0 text-center rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3 py-1.5 text-xs font-600 text-white transition-colors hover:bg-[var(--color-ink)]/80"
          >
            {isTrained ? "Add photos" : "Upload more"}
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
              ))
          }
        </div>
      </div>

      {/* ─── Likeness Protection ─── */}
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

      {/* ─── Test-generation Modal ─── */}
      {testModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !testRunning && setTestModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
            style={ghostBorder}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-700 text-[var(--color-ink)]">
                  Test your face model
                </h3>
                <p className="mt-0.5 text-[12px] text-[var(--color-ink)]/55">
                  Generate one test image to see how your model looks before brands use it. Costs ≈ $0.03.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !testRunning && setTestModalOpen(false)}
                className="rounded-md p-1 text-[var(--color-ink)]/40 hover:bg-[var(--color-ink)]/5 disabled:opacity-30"
                disabled={testRunning}
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="block text-[11px] font-600 uppercase tracking-wider text-[var(--color-ink)]/50">
              Prompt <span className="font-400 normal-case text-[var(--color-ink)]/35">(optional)</span>
            </label>
            <textarea
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              disabled={testRunning}
              placeholder="e.g. wearing a black leather jacket, golden hour lighting"
              rows={3}
              className="mt-1 w-full resize-none rounded-[var(--radius-input)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[13px] text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-50"
              style={ghostBorder}
            />
            <p className="mt-1 text-[10px] text-[var(--color-ink)]/40">
              Leave blank for a default studio portrait. Your trigger word ({loraModel?.trigger_word ?? "TOK"}) is added automatically.
            </p>

            {testImageUrl && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-600 uppercase tracking-wider text-[var(--color-ink)]/50">
                  Result
                </p>
                <div
                  className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--color-surface-container-lowest)]"
                  style={ghostBorder}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={testImageUrl}
                    alt="Test generation"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                {testUsedPrompt && (
                  <p className="mt-2 text-[10px] text-[var(--color-ink)]/40">
                    <span className="font-600">Prompt used: </span>
                    {testUsedPrompt}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                disabled={testRunning}
                className="rounded-[var(--radius-button)] bg-white px-3.5 py-2 text-xs font-600 text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5 disabled:opacity-50"
                style={ghostBorder}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleTestGeneration}
                disabled={testRunning}
                className="flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-3.5 py-2 text-xs font-600 text-white hover:bg-[var(--color-ink)]/80 disabled:opacity-50"
              >
                {testRunning ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-3.5" />
                    {testImageUrl ? "Generate another" : "Generate"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
