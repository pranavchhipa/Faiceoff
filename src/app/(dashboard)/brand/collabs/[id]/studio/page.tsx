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
  Send,
  Trash2,
  Maximize2,
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
import { compressImageForUpload } from "@/lib/utils/image-compression";

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
  retry_count?: number | null;
}

type PillKey = string | null;

interface LabelBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Brief {
  product_name: string;
  product_image_url: string;
  /**
   * Phase 2.2.b — exact text on the product packaging the brand wants
   * reproduced character-for-character (brand name, tagline, SKU, etc.).
   * Optional. When provided, fed into the PRODUCT TEXT LOCK block in the
   * Gemini anchor prompt and scanned by compliance.
   */
  pack_text: string;
  /**
   * Phase 6c — normalised 0..1 label bounding box from the vision call.
   * Used by runGeneration to build the 3-panel product composite.
   */
  label_bbox: LabelBbox | null;
  /**
   * Phase 6e — when true, forces Stage 2 product refinement regardless of
   * OCR drift. Surfaced as the "High detail mode" toggle.
   */
  high_detail_mode: boolean;
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
  pack_text: "",
  label_bbox: null,
  high_detail_mode: false,
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

/** Convert a "W:H" aspect-ratio key (e.g. "4:5") into a CSS `aspect-ratio` value. */
function aspectRatioCss(key: string | null | undefined): string {
  if (!key || !key.includes(":")) return "1 / 1";
  const [w, h] = key.split(":");
  const wn = Number(w);
  const hn = Number(h);
  if (!Number.isFinite(wn) || !Number.isFinite(hn) || wn <= 0 || hn <= 0) return "1 / 1";
  return `${wn} / ${hn}`;
}

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
  const outputCardRef = useRef<HTMLDivElement>(null);

  // Phase 6a/6b — vision-call suggestions for the uploaded product image.
  // suggestionsLoading = true while the suggest-brief endpoint is in flight.
  // `suggestion` = the latest result (or null if not fetched yet).
  // `suggestedKeys` = set of pill keys we pre-selected from the suggestion
  // so the UI can render a ✨ chip and the "Apply all" CTA.
  const [suggestion, setSuggestion] = useState<{
    productCategory: string;
    extractedPackText: { primary: string; secondary: string; finePrint: string };
    suggestions: {
      interaction: string[];
      setting: string[];
      pose_energy: string[];
      outfit_style: string[];
      time_lighting: string[];
      mood_palette: string[];
      expression: string[];
      camera_framing: string[];
    };
    labelBbox: LabelBbox | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

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
        if (existing) return prev.map((g) => g.id === genId ? { ...g, status: gen.status, image_url: gen.image_url, retry_count: gen.retry_count } : g);
        return [{ id: gen.id, status: gen.status, image_url: gen.image_url, created_at: gen.created_at, retry_count: gen.retry_count }, ...prev];
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

  // ── Review-gate actions (Send / Retry / Discard on ready_for_brand_review) ──
  const [reviewAction, setReviewAction] = useState<"send" | "discard" | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryNotes, setRetryNotes] = useState("");

  // ── Multi-image selection for batch send-to-creator ─────────────────────
  // Brands can tick multiple ready_for_brand_review images (hero + recents)
  // and send them all to the creator in one shot via the floating action bar
  // that appears at the bottom of the right column.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // If a selected gen leaves ready_for_brand_review (sent / discarded /
  // retried), drop it from the selection so the action bar count stays honest.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const stillSelectable = new Set(
        recentGens
          .filter((g) => g.status === "ready_for_brand_review")
          .map((g) => g.id),
      );
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (stillSelectable.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [recentGens]);

  async function handleSendSelected() {
    if (reviewAction) return;
    const ids = Array.from(selectedIds).filter((id) =>
      recentGens.some(
        (g) => g.id === id && g.status === "ready_for_brand_review",
      ),
    );
    if (ids.length === 0) return;
    setReviewAction("send");
    setError(null);
    try {
      const res = await fetch("/api/generations/bulk-send-for-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_ids: ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to send");
      const sent = new Set(ids);
      setRecentGens((prev) =>
        prev.map((g) =>
          sent.has(g.id) && g.status === "ready_for_brand_review"
            ? { ...g, status: "ready_for_approval" }
            : g,
        ),
      );
      clearSelection();
      setToast({
        kind: "success",
        text: `Sent ${d.sent ?? ids.length} image${
          (d.sent ?? ids.length) === 1 ? "" : "s"
        } to ${creator.name ?? "creator"} — 48h to approve`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setReviewAction(null);
    }
  }

  // ── Lightbox (click an output image to view full-size) ──
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Close on Escape
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);
  const [retrySubmitting, setRetrySubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "info"; text: string } | null>(null);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleSendForApproval(genId: string) {
    if (reviewAction) return;
    setReviewAction("send");
    setError(null);
    try {
      const res = await fetch(`/api/generations/${genId}/send-for-approval`, { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? d.message ?? "Failed to send");
      setRecentGens((prev) => prev.map((g) => g.id === genId ? { ...g, status: "ready_for_approval" } : g));
      setToast({ kind: "success", text: `Sent to ${creator.name ?? "creator"} — they have 48h to approve` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setReviewAction(null);
    }
  }

  // Bulk-send every ready_for_brand_review image to the creator at once.
  async function handleBulkSend() {
    if (reviewAction) return;
    const readyIds = recentGens
      .filter((g) => g.status === "ready_for_brand_review")
      .map((g) => g.id);
    if (readyIds.length === 0) return;
    setReviewAction("send");
    setError(null);
    try {
      const res = await fetch("/api/generations/bulk-send-for-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_ids: readyIds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to send");
      const sentIds = new Set(readyIds);
      setRecentGens((prev) =>
        prev.map((g) =>
          sentIds.has(g.id) && g.status === "ready_for_brand_review"
            ? { ...g, status: "ready_for_approval" }
            : g,
        ),
      );
      setToast({
        kind: "success",
        text: `Sent ${d.sent} image${d.sent === 1 ? "" : "s"} to ${creator.name ?? "creator"} — 48h to approve`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setReviewAction(null);
    }
  }

  async function handleDiscard(genId: string) {
    if (reviewAction) return;
    if (!confirm("Discard this image? This can't be undone.")) return;
    setReviewAction("discard");
    setError(null);
    try {
      const res = await fetch(`/api/generations/${genId}/discard`, { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? d.message ?? "Failed to discard");
      setRecentGens((prev) => prev.map((g) => g.id === genId ? { ...g, status: "discarded" } : g));
      setToast({ kind: "info", text: "Image discarded" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard");
    } finally {
      setReviewAction(null);
    }
  }

  async function handleSubmitRetry(genId: string) {
    if (retrySubmitting) return;
    const notes = retryNotes.trim();
    if (!notes) { setError("Tell us what to change"); return; }
    setRetrySubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/generations/${genId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iteration_notes: notes }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Retry failed");
      const newId = d.new_generation_id as string;
      // Mark old as discarded; insert new as draft
      setRecentGens((prev) => [
        { id: newId, status: "draft", image_url: null, created_at: new Date().toISOString(), retry_count: d.retry_count ?? 1 },
        ...prev.map((g) => g.id === genId ? { ...g, status: "discarded" } : g),
      ]);
      setPendingGenId(newId);
      setRetryOpen(false);
      setRetryNotes("");
      // Refresh credits
      fetch(`/api/collabs/${collabId}`, { cache: "no-store" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setSession(d.session); });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrySubmitting(false);
    }
  }

  async function handleUploadImage(file: File) {
    setUploadingImg(true);
    setError(null);
    try {
      // Phase 1, fix 1.5 — compress before upload (Studio was previously sending
      // raw files, while /brand/discover/[creatorId]/request was compressing —
      // a 6 MB phone photo would 413 here but succeed on the request page).
      // Settings mirror the brand-request page so both upload paths behave
      // identically. Server cap is 3.8 MB; double-pass keeps us under it.
      let compressed = await compressImageForUpload(file, {
        maxDimension: 1600,
        quality: 0.82,
        passThroughByteThreshold: 800_000,
      });
      if (compressed.size > 3_800_000) {
        compressed = await compressImageForUpload(compressed, {
          maxDimension: 1280,
          quality: 0.7,
          passThroughByteThreshold: 0,
        });
      }
      if (compressed.size > 3_800_000) {
        throw new Error("Image is too large even after compression. Try a smaller original.");
      }

      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/campaigns/upload-product-image", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setBrief((b) => ({ ...b, product_image_url: d.url }));
      // Phase 6a/6b — fire suggestions in background. Failure is silent so
      // the brand can keep filling the form by hand.
      void fetchSuggestions(d.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImg(false);
    }
  }

  // Phase 6a/6b — background vision call. Never throws; on any failure the
  // suggestion stays null and the form behaves like Phase 5.
  async function fetchSuggestions(productImageUrl: string) {
    setSuggestionsLoading(true);
    setSuggestion(null);
    try {
      const res = await fetch("/api/campaigns/suggest-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_image_url: productImageUrl }),
      });
      if (!res.ok) return;
      const d = (await res.json()) as {
        suggestion: {
          productCategory: string;
          extractedPackText: { primary: string; secondary: string; finePrint: string };
          suggestions: typeof DEFAULT_BRIEF extends infer _ ? Record<string, string[]> : never;
          labelBbox: LabelBbox | null;
          confidence: "high" | "medium" | "low";
        };
        cache_hit: boolean;
      };
      const s = d.suggestion;
      setSuggestion({
        productCategory: s.productCategory,
        extractedPackText: s.extractedPackText,
        suggestions: {
          interaction: s.suggestions.interaction ?? [],
          setting: s.suggestions.setting ?? [],
          pose_energy: s.suggestions.pose_energy ?? [],
          outfit_style: s.suggestions.outfit_style ?? [],
          time_lighting: s.suggestions.time_lighting ?? [],
          mood_palette: s.suggestions.mood_palette ?? [],
          expression: s.suggestions.expression ?? [],
          camera_framing: s.suggestions.camera_framing ?? [],
        },
        labelBbox: s.labelBbox,
        confidence: s.confidence,
      });
      // Auto-apply label_bbox so the 3-panel label composite kicks in (image-
      // based). pack_text is no longer collected — the product photo is the
      // only authority for packaging text.
      setBrief((b) => ({
        ...b,
        label_bbox: s.labelBbox,
      }));
    } catch {
      // silent — keep form usable
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // Phase 6a — bulk-apply suggested pills (only fills slots brand hasn't touched).
  function applyAllSuggestions() {
    if (!suggestion) return;
    setBrief((b) => ({
      ...b,
      setting: b.setting ?? suggestion.suggestions.setting[0] ?? null,
      interaction: b.interaction ?? suggestion.suggestions.interaction[0] ?? null,
      pose_energy: b.pose_energy ?? suggestion.suggestions.pose_energy[0] ?? null,
      outfit_style: b.outfit_style ?? suggestion.suggestions.outfit_style[0] ?? null,
      time_lighting: b.time_lighting ?? suggestion.suggestions.time_lighting[0] ?? null,
      mood_palette: b.mood_palette ?? suggestion.suggestions.mood_palette[0] ?? null,
      expression: b.expression ?? suggestion.suggestions.expression[0] ?? null,
      camera_framing: b.camera_framing ?? suggestion.suggestions.camera_framing[0] ?? null,
    }));
  }

  // Phase 6a — discard the suggestion display without touching brand values.
  function clearSuggestions() {
    setSuggestion(null);
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
      // Smoothly bring the output card into view — user clicked from far below
      setTimeout(() => {
        outputCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">

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
                    <img loading="lazy" decoding="async"
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
                {/* Image-authoritative product: the typed "text on packaging"
                    field was removed — typed text could override the correct
                    photo (one typo = wrong product). All packaging text is
                    copied exactly from the product image. */}
                {/* Phase 6e — High detail mode toggle */}
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/60 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={brief.high_detail_mode}
                    onChange={(e) => setBrief((b) => ({ ...b, high_detail_mode: e.target.checked }))}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)]"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-600 leading-tight text-[var(--color-foreground)]">
                      High detail mode <span className="font-400 text-[11px] text-[var(--color-muted-foreground)]">(recommended for dense labels / fine print)</span>
                    </span>
                    <span className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                      Forces an additional refinement pass for sharper product text. Generation may take 5–10s longer.
                    </span>
                  </div>
                </label>
                <p className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                  Tip: use a clean, well-lit product photo. The AI uses this as the source-of-truth for the product&apos;s shape, color and labeling.
                </p>
              </div>
            </div>
          </BriefSection>

          {/* Phase 6a/6b — vision-call suggestion banner */}
          {(suggestionsLoading || suggestion) && (
            <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.04] px-4 py-3">
              {suggestionsLoading ? (
                <div className="flex items-center gap-2 text-[12px] font-600 text-[var(--color-foreground)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-primary)]" />
                  <span>✨ Analyzing your product…</span>
                </div>
              ) : suggestion ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-600 text-[var(--color-foreground)]">
                        ✨ Suggested settings for this product
                      </span>
                      <span className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                        {suggestion.productCategory
                          ? `Detected as ${suggestion.productCategory.replace(/_/g, " ")}.`
                          : ""}
                        {" "}Click below to apply, or pick your own.
                      </span>
                    </div>
                    <span className="rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-primary)]">
                      {suggestion.confidence}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={applyAllSuggestions}
                      className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-600 text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
                    >
                      Apply all suggestions
                    </button>
                    <button
                      type="button"
                      onClick={clearSuggestions}
                      className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
                    >
                      Clear suggestions
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

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
        <div className="space-y-4">

          {/* Hero / latest — sticky so it stays visible while user scrolls the brief on the left
              (top-[72px] = TopBar height 56px + 16px gap) */}
          <div ref={outputCardRef} className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] scroll-mt-[72px] lg:sticky lg:top-[72px] lg:z-20">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-4 py-2.5">
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                <Eye className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
                Latest output
              </p>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                  {brief.aspect_ratio}
                </span>
                {heroGen && <StatusChip status={heroGen.status} />}
              </div>
            </div>

            <div
              className="relative w-full bg-[var(--color-secondary)] flex items-center justify-center"
              style={{ aspectRatio: aspectRatioCss(brief.aspect_ratio), maxHeight: "65vh" }}
            >
              {heroGen?.image_url ? (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(heroGen.image_url!)}
                  className="group relative h-full w-full cursor-zoom-in"
                  aria-label="View full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async"
                    src={heroGen.image_url}
                    alt="Latest generation"
                    className="h-full w-full object-contain"
                  />
                  {/* Hover hint */}
                  <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-2.5 w-2.5" />
                    Tap to expand
                  </span>
                </button>
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
              <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {/* Send */}
                  <button
                    type="button"
                    onClick={() => handleSendForApproval(heroGen.id)}
                    disabled={!!reviewAction}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-[12.5px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-6px_rgba(201,169,110,0.5)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {reviewAction === "send"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    <span>Send</span>
                  </button>

                  {/* Retry */}
                  {(heroGen.retry_count ?? 0) === 0 ? (
                    <button
                      type="button"
                      onClick={() => { setRetryOpen(true); setRetryNotes(""); }}
                      disabled={!!reviewAction}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-[12.5px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                  ) : (
                    <div
                      title="Retry already used on this image"
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5 text-[12.5px] font-700 text-[var(--color-muted-foreground)]/70"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry used</span>
                    </div>
                  )}

                  {/* Discard */}
                  <button
                    type="button"
                    onClick={() => handleDiscard(heroGen.id)}
                    disabled={!!reviewAction}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-[12.5px] font-700 text-[var(--color-muted-foreground)] transition hover:border-red-500/40 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reviewAction === "discard"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                    <span>Discard</span>
                  </button>
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  {(heroGen.retry_count ?? 0) === 0
                    ? "Send to creator · or refine once with feedback"
                    : "Retry already used — send to creator or discard"}
                </p>
              </div>
            )}
          </div>

          {/* Bulk send-to-creator — appears when 2+ images await review.
              Kept as a fast "send everything ready" shortcut alongside the
              per-image selection bar below. */}
          {recentGens.filter((g) => g.status === "ready_for_brand_review").length >= 2 && (
            <button
              type="button"
              onClick={handleBulkSend}
              disabled={reviewAction !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[13px] font-700 text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send all {recentGens.filter((g) => g.status === "ready_for_brand_review").length} ready images to {creator.name ?? "creator"}
            </button>
          )}

          {/* All generations gallery — every gen from this collab (hero is
              the first item too, but we show it again here so brands can
              select it together with older shots). Checkboxes appear on
              ready_for_brand_review cards; selection drives the floating
              "Send N to creator" action bar at the bottom of the viewport. */}
          {recentGens.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  All generations ({recentGens.length})
                </p>
                {recentGens.filter((g) => g.status === "ready_for_brand_review").length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const ready = recentGens
                        .filter((g) => g.status === "ready_for_brand_review")
                        .map((g) => g.id);
                      // Toggle: if every ready id is already selected, clear; else select all ready.
                      const allSelected = ready.every((id) => selectedIds.has(id));
                      if (allSelected) {
                        clearSelection();
                      } else {
                        setSelectedIds(new Set(ready));
                      }
                    }}
                    className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-primary)] transition-colors hover:text-[var(--color-foreground)]"
                  >
                    {recentGens
                      .filter((g) => g.status === "ready_for_brand_review")
                      .every((g) => selectedIds.has(g.id)) &&
                    recentGens.some((g) => g.status === "ready_for_brand_review")
                      ? "Deselect all"
                      : "Select all ready"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {recentGens.map((g) => (
                  <GenCell
                    key={g.id}
                    gen={g}
                    collabId={collabId}
                    selected={selectedIds.has(g.id)}
                    onToggleSelect={toggleSelect}
                    onPreview={(url) => setLightboxUrl(url)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating multi-select action bar ──
          Appears bottom-center when any ready_for_brand_review images are
          ticked. Sits above the existing toast / lightbox UIs. */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-card)] px-4 py-3 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)] backdrop-blur-md">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
                <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
              </span>
              <div className="flex flex-col">
                <span className="font-display text-[14px] font-800 leading-none text-[var(--color-foreground)]">
                  {selectedIds.size} image{selectedIds.size === 1 ? "" : "s"} selected
                </span>
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                  Send to {creator.name ?? "creator"} for approval
                </span>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg px-3 py-2 text-[12px] font-700 text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSelected}
                disabled={reviewAction !== null}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_8px_20px_-8px_rgba(201,169,110,0.6)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {reviewAction === "send" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Send {selectedIds.size} for approval</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lightbox (full-size view of generated image) ── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-full max-w-[1400px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async"
                src={lightboxUrl}
                alt="Generated image full size"
                className="max-h-[92vh] max-w-full rounded-lg object-contain shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
              />
              {/* Close button */}
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                aria-label="Close"
                className="absolute right-3 top-3 rounded-full bg-black/55 p-2 text-white backdrop-blur-md transition hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
              {/* Open in new tab */}
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-white backdrop-blur-md transition hover:bg-black/80"
              >
                Open in new tab
              </a>
              <p className="absolute bottom-3 left-3 hidden font-mono text-[10px] text-white/70 sm:block">
                Press Esc or click outside to close
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast (Send / Discard feedback) ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
          >
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)] backdrop-blur-md ${
                toast.kind === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
              }`}
            >
              {toast.kind === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Eye className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              )}
              <span className="text-[13px] font-600">{toast.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Retry modal ── */}
      <AnimatePresence>
        {retryOpen && heroGen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
            onClick={() => !retrySubmitting && setRetryOpen(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[560px] overflow-hidden rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.4)] sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-primary)]/8 px-5 py-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15">
                  <Wand2 className="h-4 w-4 text-[var(--color-primary)]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                    One last refinement
                  </p>
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                    Only retry available · 1 credit
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !retrySubmitting && setRetryOpen(false)}
                  disabled={retrySubmitting}
                  className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)] disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4 p-5">
                {/* Image preview + brief recap */}
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]">
                    {heroGen.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={heroGen.image_url}
                        alt="Attempt 1"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-[var(--color-muted-foreground)]" />
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[8.5px] font-700 uppercase tracking-[0.14em] text-white backdrop-blur-md">
                      Attempt 1
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                      Your brief
                    </p>
                    <BriefRecapRow label="Setting" value={brief.setting} options={SETTING_OPTIONS} />
                    <BriefRecapRow label="Mood" value={brief.mood_palette} options={MOOD_PALETTE_OPTIONS} />
                    <BriefRecapRow label="Camera" value={brief.camera_type} options={CAMERA_TYPE_OPTIONS} />
                    <BriefRecapRow label="Aspect" value={brief.aspect_ratio} options={ASPECT_RATIO_OPTIONS} />
                  </div>
                </div>

                {/* Iteration textarea */}
                <div>
                  <label className="mb-1.5 block font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    What would you like to change?
                  </label>
                  <textarea
                    value={retryNotes}
                    onChange={(e) => setRetryNotes(e.target.value)}
                    placeholder="e.g. make the pose standing, warmer lighting, hands holding the product closer to face"
                    rows={4}
                    maxLength={500}
                    autoFocus
                    disabled={retrySubmitting}
                    className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none disabled:opacity-60"
                  />
                  <p className="mt-1 text-right font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {retryNotes.length}/500
                  </p>
                </div>

                {error && retryOpen && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-[12px] text-red-500">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setRetryOpen(false)}
                  disabled={retrySubmitting}
                  className="rounded-xl px-4 py-2 text-[13px] font-700 text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitRetry(heroGen.id)}
                  disabled={retrySubmitting || !retryNotes.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-6px_rgba(201,169,110,0.5)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {retrySubmitting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</>
                    : <><RefreshCw className="h-3.5 w-3.5" /> Retry · 1 credit</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Small helper to display a brief field's human label in the retry modal
function BriefRecapRow({
  label,
  value,
  options,
}: {
  label: string;
  value: string | null | undefined;
  options: readonly PillOption[];
}) {
  if (!value) return null;
  const opt = options.find((o) => o.key === value);
  const display = opt ? opt.label : value.startsWith("custom:") ? value.slice(7) : value;
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-14 shrink-0 font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="text-[12px] font-600 text-[var(--color-foreground)]">
        {display}
      </span>
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
function GenCell({
  gen,
  collabId,
  selected,
  onToggleSelect,
  onPreview,
}: {
  gen: Generation;
  collabId: string;
  /** Whether this cell is in the brand's current multi-select. */
  selected?: boolean;
  /** Toggles selection. Only wired for ready_for_brand_review cells. */
  onToggleSelect?: (id: string) => void;
  /** Opens the image in the shared lightbox. */
  onPreview?: (url: string) => void;
}) {
  const isPending = PENDING_STATUSES.has(gen.status);
  const tone = STATUS_TONE[gen.status] ?? STATUS_TONE.draft;
  const selectable = gen.status === "ready_for_brand_review";

  // Plain <div> outer — the click target inside is more nuanced than a single
  // <Link>, so we render the right element per-action.
  const inner = gen.image_url ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        loading="lazy"
        decoding="async"
        src={gen.image_url}
        alt="Generation"
        className={`h-full w-full object-cover transition-transform duration-300 ${
          selected ? "scale-[0.96]" : "group-hover:scale-[1.02]"
        }`}
      />
      {/* Bottom status pill */}
      <div className="pointer-events-none absolute inset-x-1 bottom-1">
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
  );

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-xl border bg-[var(--color-secondary)] transition-all ${
        selected
          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40"
          : "border-[var(--color-border)]"
      }`}
    >
      {/* Image (click → lightbox preview when one exists; for stuck pending cells,
          there's nothing to click). */}
      {gen.image_url ? (
        <button
          type="button"
          onClick={() => onPreview?.(gen.image_url!)}
          className="block h-full w-full cursor-zoom-in"
          aria-label="Preview image"
        >
          {inner}
        </button>
      ) : (
        <div className="block h-full w-full">{inner}</div>
      )}

      {/* Selection checkbox — top-left, visible on hover for selectable
          cells, always visible once selected. Stops propagation so the
          click doesn't also open the lightbox. */}
      {selectable && onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(gen.id);
          }}
          aria-label={selected ? "Deselect image" : "Select image"}
          className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
            selected
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] opacity-100"
              : "border-white/60 bg-black/55 text-white opacity-0 backdrop-blur-md group-hover:opacity-100"
          }`}
        >
          {selected ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3 w-3 rounded-sm border border-white/80" />
          )}
        </button>
      )}

      {/* Open-in-review deep link — appears as a tiny overflow tap target so
          brands who prefer the per-image review page can still get there.
          (Selection / preview is the primary path; this is the legacy escape
          hatch.) */}
      {gen.status === "ready_for_brand_review" && (
        <Link
          href={`/brand/collabs/${collabId}?review=${gen.id}`}
          aria-label="Open review"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-white/30 bg-black/55 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Maximize2 className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
