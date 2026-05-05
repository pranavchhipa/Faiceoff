"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  ImageIcon,
  RefreshCw,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  CAMERA_TYPE_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  type PillOption,
} from "@/config/campaign-options";

interface SessionSummary {
  id: string;
  name: string;
  creator_id: string;
  gen_credits_total: number | null;
  gen_credits_used: number;
  status: string;
  package_tier: string | null;
}

interface Generation {
  id: string;
  status: string;
  image_url: string | null;
  created_at: string;
}

type PillKey = string | null;

interface Brief {
  product_name: string;
  product_image_url: string;
  setting: PillKey;
  time_lighting: PillKey;
  mood_palette: PillKey;
  interaction: PillKey;
  pose_energy: PillKey;
  expression: PillKey;
  outfit_style: PillKey;
  camera_framing: PillKey;
  camera_type: PillKey;
  aspect_ratio: string;
  custom_notes: string;
}

const DEFAULT_BRIEF: Brief = {
  product_name: "",
  product_image_url: "",
  setting: null,
  time_lighting: null,
  mood_palette: null,
  interaction: null,
  pose_energy: null,
  expression: null,
  outfit_style: null,
  camera_framing: null,
  camera_type: "iphone_15_pro",
  aspect_ratio: "1:1",
  custom_notes: "",
};

const POLL_INTERVAL = 4000;
const TERMINAL_STATUSES = new Set(["ready_for_brand_review", "ready_for_approval", "approved", "rejected", "failed", "discarded"]);
const PENDING_STATUSES = new Set(["draft", "compliance_check", "generating", "output_check"]);

function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly PillOption[];
  value: PillKey;
  onChange: (v: PillKey) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(value === o.key ? null : o.key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-600 transition-all ${
              value === o.key
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BriefSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {title}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />}
      </button>
      {open && <div className="space-y-4 px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function BrandStudioPage() {
  const { id: collabId } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [brief, setBrief] = useState<Brief>(DEFAULT_BRIEF);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGenId, setPendingGenId] = useState<string | null>(null);
  const [recentGens, setRecentGens] = useState<Generation[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load session
  useEffect(() => {
    fetch(`/api/collabs/${collabId}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setSession(d.session);
          setRecentGens((d.generations ?? []).slice(0, 12));
        }
      })
      .finally(() => setSessionLoading(false));
  }, [collabId]);

  // Poll for pending generation
  const pollGenStatus = useCallback(async (genId: string) => {
    const res = await fetch(`/api/generations/${genId}`);
    if (!res.ok) return;
    const d = await res.json();
    const gen = d.generation;
    if (!gen) return;
    if (TERMINAL_STATUSES.has(gen.status)) {
      clearInterval(pollRef.current!);
      setPendingGenId(null);
      setRecentGens((prev) => {
        const existing = prev.find((g) => g.id === genId);
        if (existing) return prev.map((g) => g.id === genId ? { ...g, status: gen.status, image_url: gen.image_url } : g);
        return [{ id: gen.id, status: gen.status, image_url: gen.image_url, created_at: gen.created_at }, ...prev];
      });
      // Refresh session credits
      fetch(`/api/collabs/${collabId}`, { cache: "no-store" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setSession(d.session); });
    }
  }, [collabId]);

  useEffect(() => {
    if (!pendingGenId) return;
    pollRef.current = setInterval(() => pollGenStatus(pendingGenId), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pendingGenId, pollGenStatus]);

  async function handleUploadImage(file: File) {
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/campaigns/upload-product-image", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setBrief((b) => ({ ...b, product_image_url: d.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    if (!brief.product_name.trim()) { setError("Product name is required"); return; }
    if (!brief.product_image_url)   { setError("Product image is required"); return; }

    setGenerating(true);
    try {
      const res = await fetch(`/api/collabs/${collabId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structured_brief: brief }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Generation failed");
      const genId = d.generation_id;
      setRecentGens((prev) => [{ id: genId, status: "draft", image_url: null, created_at: new Date().toISOString() }, ...prev]);
      setPendingGenId(genId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function setPill<K extends keyof Brief>(key: K) {
    return (val: Brief[K]) => setBrief((b) => ({ ...b, [key]: val }));
  }

  if (sessionLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (!session || session.status !== "active") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-[var(--color-muted-foreground)]">Studio unavailable — collab not active.</p>
        <Link href={`/brand/collabs/${collabId}`} className="mt-4 block text-sm text-[var(--color-primary)]">Back to collab</Link>
      </div>
    );
  }

  const creditsLeft = (session.gen_credits_total ?? 0) - (session.gen_credits_used ?? 0);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <Link
          href={`/brand/collabs/${collabId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to collab
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              Studio
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">{session.name}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-center">
            <p className="font-display text-[20px] font-800 leading-none text-[var(--color-foreground)]">{creditsLeft}</p>
            <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">credits left</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Brief panel */}
        <div className="space-y-3">
          {/* Product basics */}
          <BriefSection title="Product" defaultOpen>
            <div>
              <label className="mb-1 block font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Product name *
              </label>
              <input
                type="text"
                value={brief.product_name}
                onChange={(e) => setBrief((b) => ({ ...b, product_name: e.target.value }))}
                placeholder="e.g. Mango Sorbet SPF 50 Sunscreen"
                maxLength={200}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Product image *
              </label>
              {brief.product_image_url ? (
                <div className="relative inline-block">
                  <img
                    src={brief.product_image_url}
                    alt="Product"
                    className="h-24 w-24 rounded-xl border border-[var(--color-border)] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setBrief((b) => ({ ...b, product_image_url: "" }))}
                    className="absolute -right-2 -top-2 rounded-full bg-[var(--color-card)] p-0.5 shadow-sm border border-[var(--color-border)]"
                  >
                    <X className="h-3 w-3 text-[var(--color-muted-foreground)]" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImg}
                  className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40"
                >
                  {uploadingImg ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadImage(file);
                  e.target.value = "";
                }}
              />
            </div>
          </BriefSection>

          {/* Scene */}
          <BriefSection title="Scene & Setting" defaultOpen>
            <PillGroup label="Setting" options={SETTING_OPTIONS} value={brief.setting} onChange={setPill("setting")} />
            <PillGroup label="Time / Lighting" options={TIME_LIGHTING_OPTIONS} value={brief.time_lighting} onChange={setPill("time_lighting")} />
            <PillGroup label="Mood / Palette" options={MOOD_PALETTE_OPTIONS} value={brief.mood_palette} onChange={setPill("mood_palette")} />
          </BriefSection>

          {/* Creator direction */}
          <BriefSection title="Creator Direction">
            <PillGroup label="Interaction" options={INTERACTION_OPTIONS} value={brief.interaction} onChange={setPill("interaction")} />
            <PillGroup label="Pose Energy" options={POSE_ENERGY_OPTIONS} value={brief.pose_energy} onChange={setPill("pose_energy")} />
            <PillGroup label="Expression" options={EXPRESSION_OPTIONS} value={brief.expression} onChange={setPill("expression")} />
            <PillGroup label="Outfit Style" options={OUTFIT_STYLE_OPTIONS} value={brief.outfit_style} onChange={setPill("outfit_style")} />
          </BriefSection>

          {/* Camera + Format */}
          <BriefSection title="Camera & Format">
            <PillGroup label="Camera Framing" options={CAMERA_FRAMING_OPTIONS} value={brief.camera_framing} onChange={setPill("camera_framing")} />
            <PillGroup label="Camera Type" options={CAMERA_TYPE_OPTIONS} value={brief.camera_type} onChange={setPill("camera_type")} />
            <div>
              <p className="mb-1.5 font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Aspect ratio</p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIO_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setBrief((b) => ({ ...b, aspect_ratio: o.key }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-600 transition-all ${
                      brief.aspect_ratio === o.key
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </BriefSection>

          {/* Notes */}
          <BriefSection title="Additional Notes">
            <textarea
              value={brief.custom_notes}
              onChange={(e) => setBrief((b) => ({ ...b, custom_notes: e.target.value }))}
              placeholder="Anything specific — product placement, props, background details…"
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
            />
            <p className="text-right font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {brief.custom_notes.length}/500
            </p>
          </BriefSection>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-[13px] text-red-500">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !!pendingGenId || creditsLeft <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3.5 text-[15px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</>
            ) : pendingGenId ? (
              <><RefreshCw className="h-5 w-5 animate-spin" /> Generating…</>
            ) : creditsLeft <= 0 ? (
              "No credits remaining"
            ) : (
              <><Wand2 className="h-5 w-5" /> Generate image ({creditsLeft} left)</>
            )}
          </button>
        </div>

        {/* Output panel */}
        <div>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Recent generations
          </p>
          {recentGens.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-10 text-center">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 text-[var(--color-muted-foreground)]" />
              <p className="text-[12px] text-[var(--color-muted-foreground)]">Generations appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-2">
              {recentGens.map((g) => (
                <GenCell key={g.id} gen={g} collabId={collabId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Queued",
  compliance_check: "Checking…",
  generating: "Generating…",
  output_check: "Reviewing…",
  ready_for_brand_review: "Ready",
  ready_for_approval: "Sent to creator",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  discarded: "Discarded",
};

function GenCell({ gen, collabId }: { gen: Generation; collabId: string }) {
  const isPending = PENDING_STATUSES.has(gen.status);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] aspect-square relative">
      {gen.image_url ? (
        <>
          <img src={gen.image_url} alt="Generation" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2">
            <p className="font-mono text-[9px] text-white">{STATUS_LABEL[gen.status] ?? gen.status}</p>
          </div>
          {gen.status === "ready_for_brand_review" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Link
                href={`/brand/collabs/${collabId}?review=${gen.id}`}
                className="rounded-xl bg-[var(--color-primary)] px-3 py-1.5 font-mono text-[10px] font-700 text-[var(--color-primary-foreground)] shadow"
              >
                Review
              </Link>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
          ) : (
            <ImageIcon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
          )}
          <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">
            {STATUS_LABEL[gen.status] ?? gen.status}
          </p>
        </div>
      )}
    </div>
  );
}
