"use client";

/**
 * Creator Public Profile — Setup
 *
 * Single-page flow:
 *   1. Pick up to 4 categories (chips, animated selection)
 *   2. Choose / customize the public URL slug
 *   3. Hit "Generate my demos" — kicks off after() jobs
 *   4. Live bento gallery fills in as each demo completes
 *   5. Per-demo Regenerate (3 free) / Hide controls
 *   6. Publish — flips profile_published, exposes /creators/<slug>
 *   7. Copy link + QR snippet
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Share2,
  Sparkles,
  Trash2,
  Upload as UploadIcon,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMO_CATEGORIES,
  ALL_CATEGORY_KEYS,
  MAX_CATEGORIES_PER_CREATOR,
  FREE_REGENERATIONS_PER_CATEGORY,
  type DemoCategoryKey,
} from "@/lib/profile/demo-prompts";
import { validateSlug } from "@/lib/profile/slug";
import {
  detectPlatform,
  platformLabel,
  type SocialPlatform,
} from "@/lib/profile/platform-detect";
import { PlatformIcon } from "@/components/profile/platform-icon";
import { compressImageForUpload } from "@/lib/utils/image-compression";

interface DemoSample {
  id: string;
  category: DemoCategoryKey;
  status: "pending" | "ready" | "failed";
  image_url: string | null;
  regeneration_count: number;
  error_message: string | null;
  created_at: string;
}

interface ProfileLink {
  id: string;
  label: string;
  url: string;
  /** Auto-detected from URL host. Drives the platform-icon row on /creators/<slug>. */
  platform?: SocialPlatform | null;
}

interface ProfileStatus {
  creator: {
    slug: string | null;
    categories: DemoCategoryKey[];
    published: boolean;
    published_at: string | null;
    theme: string;
    view_count: number;
    links: ProfileLink[];
    cover_image_path: string | null;
    cover_image_url: string | null;
    city: string | null;
  } | null;
  samples: DemoSample[];
}

export default function ProfileSetupPage() {
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DemoCategoryKey[]>([]);
  const [slugDraft, setSlugDraft] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [errBanner, setErrBanner] = useState<string | null>(null);

  // Custom link buttons (Linktree-style)
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [linksDirty, setLinksDirty] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksSaved, setLinksSaved] = useState(false);

  // ── Cover image (own photo, shown on /creators/<slug> hero) ─────────────
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverDragActive, setCoverDragActive] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── City (location pin on Discover cards + public profile hero) ─────────
  const [cityDraft, setCityDraft] = useState("");
  const cityHydratedRef = useRef(false);

  // ── Fetch initial state ─────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/profile/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ProfileStatus;
      setStatus(data);
      if (data.creator) {
        if (selected.length === 0 && data.creator.categories.length > 0) {
          setSelected(data.creator.categories);
        }
        if (!slugDraft && data.creator.slug) {
          setSlugDraft(data.creator.slug);
        }
        // Hydrate links only if the creator hasn't started editing them
        if (!linksDirty) {
          setLinks(data.creator.links ?? []);
        }
        // Hydrate the cover preview from whatever's on file. The signed URL
        // is fresh (1h) so it'll just work in the <img> below.
        if (data.creator.cover_image_url) {
          setCoverImageUrl(data.creator.cover_image_url);
        }
        // Hydrate city once (don't clobber whatever the creator is typing).
        if (!cityHydratedRef.current) {
          setCityDraft(data.creator.city ?? "");
          cityHydratedRef.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selected.length, slugDraft, linksDirty]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Poll while any sample is pending ────────────────────────────────────
  const anyPending = useMemo(
    () => (status?.samples ?? []).some((s) => s.status === "pending"),
    [status],
  );
  useEffect(() => {
    if (!anyPending) return;
    const handle = setInterval(() => refresh(), 4_000);
    return () => clearInterval(handle);
  }, [anyPending, refresh]);

  // ── Selection handlers ──────────────────────────────────────────────────
  function toggleCategory(key: DemoCategoryKey) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_CATEGORIES_PER_CREATOR) return prev;
      return [...prev, key];
    });
  }

  function handleSlugChange(v: string) {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlugDraft(cleaned);
    if (!cleaned) {
      setSlugError(null);
      return;
    }
    const r = validateSlug(cleaned);
    setSlugError(r.ok ? null : r.reason);
  }

  // ── Save categories + slug + kick off demos ─────────────────────────────
  async function handleGenerate() {
    if (selected.length === 0) {
      setErrBanner("Pick at least 1 category");
      return;
    }
    if (slugError) {
      setErrBanner("Fix the URL handle first");
      return;
    }
    setSaving(true);
    setErrBanner(null);
    try {
      const res = await fetch("/api/creator/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selected,
          slug: slugDraft || undefined,
          // Send city when the creator has something typed (empty string clears it)
          city: cityDraft.trim() ? cityDraft.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrBanner(data.detail ?? data.error ?? "Failed to start generation");
        return;
      }
      // Refresh status so UI shows pending cards immediately
      await refresh();
    } catch (err) {
      setErrBanner(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Regenerate one category ─────────────────────────────────────────────
  async function handleRegenerate(category: DemoCategoryKey) {
    try {
      const res = await fetch("/api/creator/profile/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrBanner(data.detail ?? data.error ?? "Regeneration failed");
        return;
      }
      await refresh();
    } catch (err) {
      setErrBanner(err instanceof Error ? err.message : "Unknown error");
    }
  }

  // ── Publish toggle ──────────────────────────────────────────────────────
  async function handlePublish(next: boolean) {
    setPublishing(true);
    setErrBanner(null);
    try {
      const res = await fetch("/api/creator/profile/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrBanner(data.error ?? "Failed to update publish status");
        return;
      }
      await refresh();
    } finally {
      setPublishing(false);
    }
  }

  // ── Cover image upload handler ──────────────────────────────────────────
  // Uses the existing /api/creator/upload-cover route (stores under
  // covers/<creator_id>/cover.<ext> in the reference-photos bucket and
  // updates creators.cover_image_path). The endpoint returns a fresh signed
  // URL so the preview is instant. Compression keeps mobile photos under
  // the server's 8MB cap.
  async function handleCoverUpload(file: File) {
    setUploadingCover(true);
    setErrBanner(null);
    try {
      let compressed = await compressImageForUpload(file, {
        maxDimension: 1800,
        quality: 0.84,
        passThroughByteThreshold: 900_000,
      });
      if (compressed.size > 7_500_000) {
        compressed = await compressImageForUpload(compressed, {
          maxDimension: 1400,
          quality: 0.72,
          passThroughByteThreshold: 0,
        });
      }
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/creator/upload-cover", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setErrBanner(d.error ?? "Cover upload failed");
        return;
      }
      if (d.cover_image_url) setCoverImageUrl(d.cover_image_url);
    } catch (err) {
      setErrBanner(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  function onCoverDrop(e: React.DragEvent) {
    e.preventDefault();
    setCoverDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleCoverUpload(file);
  }

  // ── Custom links handlers ───────────────────────────────────────────────
  function addLink() {
    if (links.length >= 10) return;
    setLinks((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, label: "", url: "", platform: null },
    ]);
    setLinksDirty(true);
    setLinksSaved(false);
  }
  function updateLink(id: string, field: "label" | "url", value: string) {
    setLinks((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === "url") {
          // Re-detect the platform live so the icon hint updates as the
          // creator types. The server re-detects on save too — this is just
          // a UX preview so the row's icon stays in sync with the URL field.
          return { ...l, url: value, platform: detectPlatform(value) };
        }
        return { ...l, [field]: value };
      }),
    );
    setLinksDirty(true);
    setLinksSaved(false);
  }
  function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setLinksDirty(true);
    setLinksSaved(false);
  }
  function moveLink(id: string, dir: -1 | 1) {
    setLinks((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
    setLinksDirty(true);
    setLinksSaved(false);
  }
  async function saveLinks() {
    setSavingLinks(true);
    setErrBanner(null);
    try {
      // Drop empty rows (both fields blank)
      const payload = links.filter((l) => l.label.trim() || l.url.trim());
      const res = await fetch("/api/creator/profile/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrBanner(data.error ?? "Failed to save links");
        return;
      }
      setLinks(data.links ?? []);
      setLinksDirty(false);
      setLinksSaved(true);
      setTimeout(() => setLinksSaved(false), 2200);
    } finally {
      setSavingLinks(false);
    }
  }

  // ── Share link helpers ──────────────────────────────────────────────────
  const liveSlug = status?.creator?.slug;
  const liveUrl = liveSlug
    ? `${typeof window !== "undefined" ? window.location.origin : "https://faiceoff.com"}/creators/${liveSlug}`
    : null;
  async function copyLink() {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      // ignore
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--color-secondary)]" />
        <div className="mt-4 h-4 w-96 animate-pulse rounded bg-[var(--color-secondary)]" />
      </div>
    );
  }

  const samplesByCategory = new Map<DemoCategoryKey, DemoSample>();
  for (const s of status?.samples ?? []) {
    samplesByCategory.set(s.category, s);
  }
  const readyCount = (status?.samples ?? []).filter((s) => s.status === "ready").length;
  const canPublish = readyCount > 0 && selected.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-8 lg:px-8 lg:pt-10">
      {/* ── Hero ── */}
      <div className="mb-10">
        <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Public Profile · Step 1 of 1
        </span>
        <h1 className="mt-3 font-display text-[36px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[44px]">
          Your shareable creator page.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
          Pick the categories you want brands to discover you in. We&apos;ll build
          a hand-crafted Style Preview of you in each — no real-product needed. Drop
          the link in your Instagram bio and you&apos;re open for business.
        </p>
      </div>

      {errBanner && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-500">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errBanner}</span>
        </div>
      )}

      {/* ── Section 1 · Categories ── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              1 · Pick your categories
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
              Up to {MAX_CATEGORIES_PER_CREATOR}. Each gets a custom demo.
            </p>
          </div>
          <span className="font-mono text-[12px] font-700 text-[var(--color-muted-foreground)]">
            {selected.length} / {MAX_CATEGORIES_PER_CREATOR}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ALL_CATEGORY_KEYS.map((key) => {
            const def = DEMO_CATEGORIES[key];
            const isSelected = selected.includes(key);
            const disabled =
              !isSelected && selected.length >= MAX_CATEGORIES_PER_CREATOR;
            return (
              <button
                type="button"
                key={key}
                onClick={() => toggleCategory(key)}
                disabled={disabled}
                className={`group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-[0_4px_16px_-8px_rgba(201,169,110,0.5)]"
                    : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
                } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
              >
                <span className="text-[22px] leading-none">{def.emoji}</span>
                <span className="font-display text-[13px] font-700 leading-tight tracking-tight text-[var(--color-foreground)]">
                  {def.label}
                </span>
                <span className="text-[10.5px] leading-tight text-[var(--color-muted-foreground)]">
                  {def.tagline}
                </span>
                {isSelected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
                    <CheckCircle2 className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Section 1b · Cover photo (own image, optional) ──
          A real photo of you for the share-profile hero — sits alongside the
          AI Style Previews so visitors see a real face first, then the
          AI-generated frames. /api/creator/upload-cover handles storage.    */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              1b · Your cover photo <span className="ml-2 font-mono text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Optional</span>
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
              One real photo of you — shown on your share-profile hero. Helps brands recognise the real face behind the AI Style Previews.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Big upload tile */}
          <div className="sm:w-[200px]">
            {coverImageUrl ? (
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImageUrl}
                  alt="Your cover"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  aria-label="Replace cover photo"
                  className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5 text-[12px] font-700 text-white transition hover:from-black/80"
                >
                  {uploadingCover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadIcon className="h-3.5 w-3.5" />
                  )}
                  Replace photo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setCoverDragActive(true); }}
                onDragLeave={() => setCoverDragActive(false)}
                onDrop={onCoverDrop}
                disabled={uploadingCover}
                className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all ${
                  coverDragActive
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
                } ${uploadingCover ? "cursor-wait opacity-70" : "cursor-pointer"}`}
              >
                {uploadingCover ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                    <p className="text-[11.5px] font-600 text-[var(--color-muted-foreground)]">
                      Uploading…
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary)]">
                      <ImagePlus className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                    </div>
                    <p className="px-4 text-center text-[12px] font-600 leading-snug text-[var(--color-muted-foreground)]">
                      Drop or click<br />to upload your photo
                    </p>
                  </>
                )}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoverUpload(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* Side hint */}
          <div className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/40 p-4">
            <div className="flex items-start gap-2.5">
              <Camera className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <div className="space-y-2 text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]">
                <p>
                  <span className="font-700 text-[var(--color-foreground)]">Best photo to pick:</span> a clean, well-lit headshot or 3/4 portrait — no busy background, no group shot, no heavy filters.
                </p>
                <p>
                  <span className="font-700 text-[var(--color-foreground)]">What we do with it:</span> show it as the cover of your share-profile only. Not used for AI training, not given to brands, not shared. You can replace or remove it any time.
                </p>
                <p className="text-[11.5px]">
                  Max 8&nbsp;MB · JPG/PNG. We compress automatically before upload.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2 · Slug + city ── */}
      <section className="mb-10">
        <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
          2 · Your public URL
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Keep the handle short — easier to drop in a DM or bio. The city shows as a small location pin on brand discovery + your profile hero.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px]">
          <div className="flex items-stretch overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <span className="flex items-center bg-[var(--color-secondary)] px-3 font-mono text-[12px] font-600 text-[var(--color-muted-foreground)]">
              faiceoff.com/creators/
            </span>
            <Input
              value={slugDraft}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="your-handle"
              className="h-11 flex-1 rounded-none border-0 font-mono text-[13px] focus-visible:ring-0"
            />
          </div>
          <div className="flex items-stretch overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <span className="flex items-center bg-[var(--color-secondary)] px-3 font-mono text-[10.5px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              City
            </span>
            <Input
              value={cityDraft}
              onChange={(e) => setCityDraft(e.target.value.slice(0, 80))}
              placeholder="Mumbai"
              maxLength={80}
              className="h-11 flex-1 rounded-none border-0 text-[13px] focus-visible:ring-0"
            />
          </div>
        </div>
        {slugError && (
          <p className="mt-2 text-[12px] text-red-500">{slugError}</p>
        )}
      </section>

      {/* ── Section 3 · Generate + gallery ── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              3 · Your Style Previews
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
              {anyPending
                ? "Generating… each frame takes ~60-90 seconds."
                : "Hand-crafted style frames of you in each category. Brand-safe — no real logos."}
            </p>
          </div>
          {!anyPending && (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={saving || selected.length === 0}
              className="h-9 gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Build my Style Previews
            </Button>
          )}
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {selected.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 p-8 text-center">
              <p className="text-[13px] text-[var(--color-muted-foreground)]">
                Pick categories above to see your demos here.
              </p>
            </div>
          ) : (
            selected.map((key) => {
              const def = DEMO_CATEGORIES[key];
              const sample = samplesByCategory.get(key);
              return (
                <DemoCard
                  key={key}
                  category={key}
                  emoji={def.emoji}
                  label={def.label}
                  accent={def.accent}
                  sample={sample}
                  onRegenerate={() => handleRegenerate(key)}
                />
              );
            })
          )}
        </div>
      </section>

      {/* ── Section 4 · Custom links (Linktree-style) ────────────────────── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              4 · Your links
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
              Add buttons to anything — Instagram, YouTube, WhatsApp, your site, latest work. Social platforms (auto-detected) render as icons; everything else becomes a labeled button.
            </p>
          </div>
          {links.length < 10 && (
            <Button
              type="button"
              onClick={addLink}
              className="h-9 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 text-[13px] font-700 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add link
            </Button>
          )}
        </div>

        {/* Mini preview row — every link with a detected platform shows as a
            Linktree-style icon. Updates live as the creator types URLs. */}
        {links.some((l) => l.platform) && (
          <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="mb-2.5 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              ▸ Platform icons preview
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {links
                .filter((l) => l.platform)
                .map((l) => (
                  <span
                    key={`preview-${l.id}`}
                    title={platformLabel(l.platform as SocialPlatform)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]"
                  >
                    <PlatformIcon platform={l.platform as SocialPlatform} width={18} height={18} />
                  </span>
                ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
              These render as a Linktree-style icon row on your public profile. Add an Instagram, YouTube, or TikTok URL and it auto-detects.
            </p>
          </div>
        )}

        {links.length === 0 ? (
          <button
            type="button"
            onClick={addLink}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 px-6 py-10 text-center transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary)]">
              <Link2 className="h-4.5 w-4.5 text-[var(--color-muted-foreground)]" />
            </div>
            <p className="text-[13px] font-600 text-[var(--color-foreground)]">
              Add your first link
            </p>
            <p className="max-w-xs text-[12px] text-[var(--color-muted-foreground)]">
              e.g. &ldquo;My YouTube&rdquo; → youtube.com/@you, or &ldquo;WhatsApp me&rdquo; → wa.me/91…
            </p>
          </button>
        ) : (
          <div className="space-y-2">
            {links.map((link, idx) => (
              <div
                key={link.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2.5"
              >
                {/* Reorder */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveLink(link.id, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    className="flex h-4 w-5 items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-25"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLink(link.id, 1)}
                    disabled={idx === links.length - 1}
                    aria-label="Move down"
                    className="flex h-4 w-5 items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-25"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                {/* Platform indicator — shows the auto-detected icon for any
                    recognised social URL. Falls back to a generic link glyph
                    while the URL is still being typed / unrecognised. */}
                <div
                  title={
                    link.platform
                      ? `Detected: ${platformLabel(link.platform)} — will render as a Linktree-style icon on your public profile.`
                      : "Type a recognised URL (e.g. instagram.com/...) to render this as a platform icon. Otherwise it stays a labeled button."
                  }
                  className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border sm:flex ${
                    link.platform
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {link.platform ? (
                    <PlatformIcon platform={link.platform} width={16} height={16} />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </div>

                {/* Inputs */}
                <div className="grid flex-1 gap-2 sm:grid-cols-[180px_1fr]">
                  <Input
                    value={link.label}
                    onChange={(e) => updateLink(link.id, "label", e.target.value)}
                    placeholder="Button label"
                    maxLength={40}
                    className="h-9 text-[13px]"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) => updateLink(link.id, "url", e.target.value)}
                    placeholder="instagram.com/@you  ·  youtube.com/@you  ·  yoursite.com"
                    className="h-9 font-mono text-[12px]"
                  />
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeLink(link.id)}
                  aria-label="Remove link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Save bar */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] text-[var(--color-muted-foreground)]">
                {links.length} / 10 links
              </span>
              <Button
                type="button"
                onClick={saveLinks}
                disabled={savingLinks || !linksDirty}
                className="h-9 gap-2 rounded-lg bg-[var(--color-primary)] px-5 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {savingLinks ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : linksSaved ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : null}
                {linksSaved ? "Saved" : "Save links"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 5 · Your link + Publish ──────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-5 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              5 · Your creator link
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
              One link, always live. Update the handle anytime above — the old URL stops working the moment you save.
            </p>
          </div>
        </div>

        {/* The link card — premium, single, prominent */}
        <div
          className={`relative overflow-hidden rounded-2xl border ${
            status?.creator?.published
              ? "border-emerald-400/40 bg-gradient-to-br from-emerald-500/[0.08] via-[var(--color-card)] to-[var(--color-card)]"
              : "border-[var(--color-border)] bg-[var(--color-card)]"
          }`}
        >
          {/* Decorative glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
            style={{
              background: status?.creator?.published
                ? "radial-gradient(circle, #10b981, transparent 60%)"
                : "radial-gradient(circle, var(--color-primary), transparent 60%)",
            }}
          />

          {/* Status pill row */}
          <div className="relative flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-2">
              {status?.creator?.published ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live · public
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-secondary)] px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]" />
                  Draft · only you can see
                </span>
              )}
              <span className="hidden text-[11px] text-[var(--color-muted-foreground)] sm:inline">
                Only one link active per creator.
              </span>
            </div>
            {status?.creator?.view_count !== undefined && status.creator.view_count > 0 && (
              <span className="font-mono text-[11px] font-600 text-[var(--color-muted-foreground)]">
                {status.creator.view_count.toLocaleString("en-IN")} {status.creator.view_count === 1 ? "view" : "views"}
              </span>
            )}
          </div>

          {/* URL display */}
          <div className="relative px-5 py-6 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Your shareable URL
            </p>
            <p className="mt-2 break-all font-display text-[20px] font-700 tracking-tight text-[var(--color-foreground)] md:text-[26px]">
              faiceoff.com/creators/
              <span className="text-[var(--color-primary)]">
                {liveSlug ?? slugDraft ?? "your-handle"}
              </span>
            </p>
          </div>

          {/* Action row */}
          <div className="relative grid grid-cols-2 gap-px border-t border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-4">
            {/* Copy */}
            <button
              type="button"
              onClick={copyLink}
              disabled={!liveSlug}
              className="flex items-center justify-center gap-2 bg-[var(--color-card)] px-3 py-3.5 text-[12.5px] font-700 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)] disabled:opacity-40"
              title={liveSlug ? "Copy link" : "Save categories first to enable"}
            >
              <Copy className="h-3.5 w-3.5" />
              {copyState === "copied" ? "Copied" : "Copy link"}
            </button>

            {/* Preview */}
            <Link
              href={liveSlug ? `/creators/${liveSlug}?preview=1` : "#"}
              target="_blank"
              aria-disabled={!liveSlug}
              onClick={(e) => {
                if (!liveSlug) e.preventDefault();
              }}
              className={`flex items-center justify-center gap-2 bg-[var(--color-card)] px-3 py-3.5 text-[12.5px] font-700 transition hover:bg-[var(--color-secondary)] ${
                liveSlug
                  ? "text-[var(--color-foreground)]"
                  : "pointer-events-none text-[var(--color-muted-foreground)] opacity-40"
              }`}
              title={liveSlug ? "Preview as a brand would see it" : "Save first"}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Link>

            {/* View live (only when published) OR Share */}
            {status?.creator?.published && liveSlug ? (
              <Link
                href={`/creators/${liveSlug}`}
                target="_blank"
                className="flex items-center justify-center gap-2 bg-[var(--color-card)] px-3 py-3.5 text-[12.5px] font-700 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)]"
              >
                <Share2 className="h-3.5 w-3.5" />
                Open live
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="flex items-center justify-center gap-2 bg-[var(--color-card)] px-3 py-3.5 text-[12.5px] font-700 text-[var(--color-muted-foreground)] opacity-40"
                title="Publish first to open the public version"
              >
                <Share2 className="h-3.5 w-3.5" />
                Open live
              </button>
            )}

            {/* Publish / Unpublish — primary CTA */}
            {status?.creator?.published ? (
              <button
                type="button"
                onClick={() => handlePublish(false)}
                disabled={publishing}
                className="flex items-center justify-center gap-2 bg-[var(--color-card)] px-3 py-3.5 text-[12.5px] font-700 text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePublish(true)}
                disabled={publishing || !canPublish}
                className="flex items-center justify-center gap-2 bg-emerald-500 px-3 py-3.5 text-[12.5px] font-700 text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Publish
              </button>
            )}
          </div>
        </div>

        {/* Helper text below the card */}
        {!status?.creator?.published && (
          <p className="mt-3 text-[12px] text-[var(--color-muted-foreground)]">
            {!canPublish ? (
              <>
                <ArrowRight className="mr-1 inline h-3 w-3" />
                Build at least 1 Style Preview to unlock Publish.
              </>
            ) : (
              <>
                <Eye className="mr-1 inline h-3 w-3" />
                Preview shows the exact page brands will see. Looks good? Hit Publish.
              </>
            )}
          </p>
        )}
        {status?.creator?.published && (
          <p className="mt-3 text-[12px] text-[var(--color-muted-foreground)]">
            <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-500" />
            You&apos;re live. Drop the URL in your Instagram bio, WhatsApp, anywhere — only this one link is active.
          </p>
        )}
      </section>
    </div>
  );
}

/* ───────── DemoCard ───────── */

function DemoCard({
  category,
  emoji,
  label,
  accent,
  sample,
  onRegenerate,
}: {
  category: DemoCategoryKey;
  emoji: string;
  label: string;
  accent: string;
  sample: DemoSample | undefined;
  onRegenerate: () => void;
}) {
  const status = sample?.status ?? "idle";
  const regenLeft =
    sample?.regeneration_count !== undefined
      ? Math.max(0, FREE_REGENERATIONS_PER_CATEGORY - sample.regeneration_count)
      : FREE_REGENERATIONS_PER_CATEGORY;

  return (
    <div
      className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]"
      style={{ ["--demo-accent" as string]: accent }}
    >
      {/* Image / state */}
      {status === "ready" && sample?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async"
          src={sample.image_url}
          alt={`${label} demo`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        />
      ) : status === "pending" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-card)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
            <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Generating
            </span>
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              ~60-90s
            </span>
          </div>
        </div>
      ) : status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--color-card)] p-4 text-center">
          <XCircle className="h-5 w-5 text-red-500" />
          <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-red-500">
            Failed
          </span>
          <p className="line-clamp-3 text-[10.5px] text-[var(--color-muted-foreground)]">
            {sample?.error_message ?? "Try again"}
          </p>
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-secondary)] px-2 py-1 font-mono text-[10px] font-700 text-[var(--color-foreground)] hover:bg-[var(--color-card)]"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-card)]">
          <span className="text-[40px] opacity-30">{emoji}</span>
        </div>
      )}

      {/* Overlay header */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2.5">
        <span
          className="flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider text-white backdrop-blur-md ring-1 ring-white/10"
        >
          <span>{emoji}</span>
          {category}
        </span>
        {status === "ready" && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenLeft === 0}
            title={
              regenLeft === 0
                ? "Free regenerations used. Contact support."
                : `Regenerate (${regenLeft} free left)`
            }
            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 disabled:opacity-30"
          >
            <RefreshCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Overlay footer with label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent p-3">
        <div className="font-display text-[14px] font-700 leading-tight tracking-tight text-white">
          {label}
        </div>
        {status === "ready" && regenLeft < FREE_REGENERATIONS_PER_CATEGORY && (
          <div className="mt-0.5 font-mono text-[9.5px] text-white/70">
            {regenLeft > 0
              ? `${regenLeft} free regen left`
              : "Regen limit reached"}
          </div>
        )}
      </div>
    </div>
  );
}
