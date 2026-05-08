"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  ImageIcon,
  RefreshCw,
  Upload,
  X,
  ChevronDown,
  Box,
  Sparkles,
  Camera,
  PenLine,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Eye,
  AtSign,
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

interface CreatorInfo {
  name: string | null;
  avatar_url: string | null;
  handle: string | null;
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

const STATUS_LABEL: Record<string, string> = {
  draft: "Queued",
  compliance_check: "Compliance check",
  generating: "Generating",
  output_check: "Reviewing",
  ready_for_brand_review: "Ready",
  ready_for_approval: "Sent to creator",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  discarded: "Discarded",
};

const STATUS_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  draft:                  { bg: "bg-[var(--color-secondary)]", text: "text-[var(--color-muted-foreground)]", dot: "bg-[var(--color-muted-foreground)]" },
  compliance_check:       { bg: "bg-blue-500/10",              text: "text-blue-600",                         dot: "bg-blue-500" },
  generating:             { bg: "bg-[var(--color-primary)]/10",text: "text-[var(--color-primary)]",           dot: "bg-[var(--color-primary)]" },
  output_check:           { bg: "bg-blue-500/10",              text: "text-blue-600",                         dot: "bg-blue-500" },
  ready_for_brand_review: { bg: "bg-amber-500/10",             text: "text-amber-600",                        dot: "bg-amber-500" },
  ready_for_approval:     { bg: "bg-violet-500/10",            text: "text-violet-600",                       dot: "bg-violet-500" },
  approved:               { bg: "bg-emerald-500/10",           text: "text-emerald-600",                      dot: "bg-emerald-500" },
  rejected:               { bg: "bg-red-500/10",               text: "text-red-500",                          dot: "bg-red-500" },
  failed:                 { bg: "bg-red-500/10",               text: "text-red-500",                          dot: "bg-red-500" },
  discarded:              { bg: "bg-[var(--color-secondary)]", text: "text-[var(--color-muted-foreground)]", dot: "bg-[var(--color-muted-foreground)]" },
};

// Section icons
const SECTION_ICONS = {
  product: Box,
  scene: Sparkles,
  creator: PenLine,
  camera: Camera,
  notes: PenLine,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pill group
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Section accordion
// ─────────────────────────────────────────────────────────────────────────────
function BriefSection({
  title,
  icon: Icon,
  filledCount,
  totalCount,
  optional,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  filledCount?: number;
  totalCount?: number;
  optional?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasProgress = filledCount != null && totalCount != null && totalCount > 0;
  const complete = hasProgress && filledCount === totalCount;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-secondary)]/40"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          complete ? "bg-emerald-500/10 text-emerald-500" : "bg-[var(--color-secondary)] text-[var(--color-foreground)]"
        }`}>
          {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              {title}
            </span>
            {optional && (
              <span className="rounded-full bg-[var(--color-secondary)] px-1.5 py-0.5 font-mono text-[9px] font-700 text-[var(--color-muted-foreground)]">
                Optional
              </span>
            )}
          </div>
          {hasProgress && (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {filledCount}/{totalCount} selected
            </p>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-[var(--color-border)] px-4 py-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function BrandStudioPage() {
  const { id: collabId } = useParams<{ id: string }>();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [creator, setCreator] = useState<CreatorInfo>({ name: null, avatar_url: null, handle: null });
  const [sessionLoading, setSessionLoading] = useState(true);
  const [brief, setBrief] = useState<Brief>(DEFAULT_BRIEF);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGenId, setPendingGenId] = useState<string | null>(null);
  const [recentGens, setRecentGens] = useState<Generation[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
          if (d.creator) setCreator(d.creator);
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
    } else {
      // Reflect intermediate status in recent list
      setRecentGens((prev) => prev.map((g) => g.id === genId ? { ...g, status: gen.status } : g));
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

  const collabCapLeft = (session.gen_credits_total ?? 0) - (session.gen_credits_used ?? 0);
  const total         = session.gen_credits_total ?? 0;
  const used          = session.gen_credits_used ?? 0;
  const usedPct       = total > 0 ? Math.round((used / total) * 100) : 0;

  // Counts for section progress
  const sceneFilled    = [brief.setting, brief.time_lighting, brief.mood_palette].filter(Boolean).length;
  const creatorFilled  = [brief.interaction, brief.pose_energy, brief.expression, brief.outfit_style].filter(Boolean).length;
  const cameraFilled   = [brief.camera_framing, brief.camera_type, brief.aspect_ratio].filter(Boolean).length;
  const productFilled  = (brief.product_name ? 1 : 0) + (brief.product_image_url ? 1 : 0);

  const readyToGen = brief.product_name.trim() && brief.product_image_url && collabCapLeft > 0;

  // Latest pending or terminal generation for hero
  const heroGen = recentGens[0] ?? null;
  const isHeroPending = heroGen ? PENDING_STATUSES.has(heroGen.status) : false;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleUploadImage(file);
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">

      {/* Back link */}
      <Link
        href={`/brand/collabs/${collabId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to collab
      </Link>

      {/* ── Hero header ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Wand2 className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
            Studio · Generate
          </p>
          <h1 className="mt-1 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] sm:text-[40px]">
            {session.name}
          </h1>
          <div className="mt-2.5 flex items-center gap-2">
            {creator.avatar_url ? (
              <Image
                src={creator.avatar_url}
                alt={creator.name ?? "Creator"}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                unoptimized
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[10px] font-700 text-[var(--color-foreground)] ring-2 ring-[var(--color-border)]">
                {(creator.name ?? "C").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[12px] font-700 text-[var(--color-foreground)]">
              with {creator.name ?? "Creator"}
            </span>
            {creator.handle && (
              <span className="flex items-center gap-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                <AtSign className="h-2.5 w-2.5" />
                {creator.handle.replace(/^@/, "")}
              </span>
            )}
          </div>
        </div>

        {/* Credits tile */}
        <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-card)] px-5 py-3 shadow-[0_4px_14px_-6px_rgba(201,169,110,0.3)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10">
              <Zap className="h-5 w-5 text-[var(--color-primary)]" />
            </span>
            <div>
              <p className="font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Iterations left
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[24px] font-800 leading-none text-[var(--color-foreground)]">
                  {collabCapLeft}
                </span>
                <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">of {total}</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--color-secondary)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${usedPct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-[var(--color-primary)]"
            />
          </div>
        </div>
      </motion.div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">

        {/* ─── LEFT — Brief form ─── */}
        <div className="space-y-3">
          {/* Product section */}
          <BriefSection
            title="Product"
            icon={SECTION_ICONS.product}
            filledCount={productFilled}
            totalCount={2}
            defaultOpen
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
              {/* Big product image upload */}
              <div>
                <p className="mb-1.5 font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Product image *
                </p>
                {brief.product_image_url ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[var(--color-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brief.product_image_url}
                      alt="Product"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setBrief((b) => ({ ...b, product_image_url: "" }))}
                      className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white backdrop-blur-md transition hover:bg-black/75"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                    disabled={uploadingImg}
                    className={`group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all ${
                      dragActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-secondary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]/70"
                    }`}
                  >
                    {uploadingImg ? (
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]" />
                        <p className="text-center text-[11px] font-600 leading-tight text-[var(--color-muted-foreground)]">
                          Drop or click<br />to upload
                        </p>
                      </>
                    )}
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

              <div className="flex flex-col justify-end gap-3">
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
                <p className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                  Tip: use a clean, well-lit product photo. The AI uses this as the source-of-truth for the product&apos;s shape, color and labeling.
                </p>
              </div>
            </div>
          </BriefSection>

          {/* Scene */}
          <BriefSection
            title="Scene & setting"
            icon={SECTION_ICONS.scene}
            filledCount={sceneFilled}
            totalCount={3}
            defaultOpen
          >
            <PillGroup label="Setting"          options={SETTING_OPTIONS}        value={brief.setting}        onChange={setPill("setting")} />
            <PillGroup label="Time / lighting"  options={TIME_LIGHTING_OPTIONS}  value={brief.time_lighting}  onChange={setPill("time_lighting")} />
            <PillGroup label="Mood / palette"   options={MOOD_PALETTE_OPTIONS}   value={brief.mood_palette}   onChange={setPill("mood_palette")} />
          </BriefSection>

          {/* Creator direction */}
          <BriefSection
            title="Creator direction"
            icon={SECTION_ICONS.creator}
            filledCount={creatorFilled}
            totalCount={4}
            optional
          >
            <PillGroup label="Interaction"   options={INTERACTION_OPTIONS}   value={brief.interaction}   onChange={setPill("interaction")} />
            <PillGroup label="Pose energy"   options={POSE_ENERGY_OPTIONS}   value={brief.pose_energy}   onChange={setPill("pose_energy")} />
            <PillGroup label="Expression"    options={EXPRESSION_OPTIONS}    value={brief.expression}    onChange={setPill("expression")} />
            <PillGroup label="Outfit style"  options={OUTFIT_STYLE_OPTIONS}  value={brief.outfit_style}  onChange={setPill("outfit_style")} />
          </BriefSection>

          {/* Camera + Format */}
          <BriefSection
            title="Camera & format"
            icon={SECTION_ICONS.camera}
            filledCount={cameraFilled}
            totalCount={3}
            optional
          >
            <PillGroup label="Camera framing" options={CAMERA_FRAMING_OPTIONS} value={brief.camera_framing} onChange={setPill("camera_framing")} />
            <PillGroup label="Camera type"    options={CAMERA_TYPE_OPTIONS}    value={brief.camera_type}    onChange={setPill("camera_type")} />
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
          <BriefSection
            title="Additional notes"
            icon={SECTION_ICONS.notes}
            optional
          >
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
            <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-[13px] text-red-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Generate CTA — sticky bottom on mobile */}
          <div className="sticky bottom-4 z-10 lg:static lg:z-auto">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !!pendingGenId || !readyToGen}
              className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-4 text-[15px] font-700 transition-all ${
                readyToGen && !generating && !pendingGenId
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_8px_24px_-8px_rgba(201,169,110,0.6)] hover:-translate-y-0.5 active:scale-[0.98]"
                  : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] cursor-not-allowed"
              }`}
            >
              {generating ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</>
              ) : pendingGenId ? (
                <><RefreshCw className="h-5 w-5 animate-spin" /> Generating image…</>
              ) : collabCapLeft <= 0 ? (
                "Iteration limit reached"
              ) : !brief.product_name.trim() || !brief.product_image_url ? (
                <>Fill product details to generate</>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Generate image
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 font-mono text-[10px]">
                    1 credit · {collabCapLeft} left
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ─── RIGHT — Output panel ─── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">

          {/* Hero / latest */}
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-4 py-2.5">
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                <Eye className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
                Latest output
              </p>
              {heroGen && (
                <StatusChip status={heroGen.status} />
              )}
            </div>

            <div className="relative aspect-square w-full bg-[var(--color-secondary)]">
              {heroGen?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroGen.image_url}
                  alt="Latest generation"
                  className="h-full w-full object-cover"
                />
              ) : isHeroPending ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="relative">
                    <div className="h-16 w-16 animate-pulse rounded-2xl bg-[var(--color-primary)]/15" />
                    <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-[var(--color-primary)]" />
                  </div>
                  <p className="text-center font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    {STATUS_LABEL[heroGen?.status ?? "generating"]}…<br />
                    <span className="text-[10px]">Usually takes 20–40 seconds</span>
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10">
                    <Sparkles className="h-7 w-7 text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                      Your output appears here
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">
                      Fill the brief on the left and click Generate. The AI will compose the creator&apos;s likeness with your product.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {heroGen?.status === "ready_for_brand_review" && (
              <Link
                href={`/brand/collabs/${collabId}?review=${heroGen.id}`}
                className="flex items-center justify-center gap-1.5 border-t border-[var(--color-border)] bg-[var(--color-primary)]/8 px-4 py-3 text-[13px] font-700 text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/12"
              >
                <Eye className="h-3.5 w-3.5" /> Review and decide
              </Link>
            )}
          </div>

          {/* Recent grid */}
          {recentGens.length > 1 && (
            <div>
              <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Recent ({recentGens.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {recentGens.slice(1).map((g) => (
                  <GenCell key={g.id} gen={g} collabId={collabId} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status chip
// ─────────────────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
  const isPending = PENDING_STATUSES.has(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 ${tone.bg} ${tone.text}`}>
      <span className="relative flex h-1.5 w-1.5">
        {isPending && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-60`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell
// ─────────────────────────────────────────────────────────────────────────────
function GenCell({ gen, collabId }: { gen: Generation; collabId: string }) {
  const isPending = PENDING_STATUSES.has(gen.status);
  const tone = STATUS_TONE[gen.status] ?? STATUS_TONE.draft;

  return (
    <Link
      href={gen.status === "ready_for_brand_review" ? `/brand/collabs/${collabId}?review=${gen.id}` : "#"}
      className={`group relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] ${gen.status === "ready_for_brand_review" ? "cursor-pointer" : "pointer-events-none"}`}
    >
      {gen.image_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gen.image_url} alt="Generation" className="h-full w-full object-cover" />
          {/* Bottom status pill */}
          <div className="absolute inset-x-1 bottom-1">
            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-700 backdrop-blur-md ${tone.bg} ${tone.text}`}>
              <Clock className="h-2 w-2" />
              {STATUS_LABEL[gen.status] ?? gen.status}
            </span>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
          ) : (
            <ImageIcon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          )}
          <p className="font-mono text-[9px] leading-tight text-[var(--color-muted-foreground)]">
            {STATUS_LABEL[gen.status] ?? gen.status}
          </p>
        </div>
      )}
    </Link>
  );
}
