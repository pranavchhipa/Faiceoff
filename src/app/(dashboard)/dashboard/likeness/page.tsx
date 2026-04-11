"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
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
}

interface ComplianceVector {
  id: string;
  blocked_concept: string;
  created_at: string;
}

/* ── Constants ── */

const ghostBorder = { border: "1px solid rgba(171,173,174,0.18)" };

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  trained: { label: "Trained", color: "bg-[var(--color-mint)] text-emerald-700", icon: CheckCircle2 },
  training: { label: "Training", color: "bg-amber-50 text-amber-700", icon: Loader2 },
  pending: { label: "Pending", color: "bg-[var(--color-ocean)] text-blue-700", icon: Clock },
  failed: { label: "Failed", color: "bg-red-50 text-red-600", icon: AlertTriangle },
};

export default function LikenessPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const [loraModel, setLoraModel] = useState<LoraModel | null>(null);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [blockedConcepts, setBlockedConcepts] = useState<ComplianceVector[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get creator record first
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!creator) {
      setLoading(false);
      return;
    }

    // Fetch all data in parallel
    const [loraRes, photosRes, complianceRes] = await Promise.all([
      supabase
        .from("creator_lora_models")
        .select("*")
        .eq("creator_id", creator.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("creator_reference_photos")
        .select("*")
        .eq("creator_id", creator.id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("creator_compliance_vectors")
        .select("id, blocked_concept, created_at")
        .eq("creator_id", creator.id),
    ]);

    if (loraRes.data) setLoraModel(loraRes.data as LoraModel);
    if (photosRes.data) setPhotos(photosRes.data as ReferencePhoto[]);
    if (complianceRes.data) setBlockedConcepts(complianceRes.data as ComplianceVector[]);

    setLoading(false);
  }, [user, supabase]);

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

  const status = STATUS_MAP[loraModel?.training_status ?? "pending"] ?? STATUS_MAP.pending;
  const StatusIcon = status.icon;

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
                    <span className="absolute top-1 left-1 rounded bg-[var(--color-primary)] px-1 py-px text-[9px] font-600 text-white">
                      Primary
                    </span>
                  )}
                  <ScanFace className="size-5 text-[var(--color-ink)]/12" />
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
