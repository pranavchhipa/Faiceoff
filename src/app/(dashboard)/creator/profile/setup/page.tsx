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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCcw,
  Share2,
  Sparkles,
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

interface DemoSample {
  id: string;
  category: DemoCategoryKey;
  status: "pending" | "ready" | "failed";
  image_url: string | null;
  regeneration_count: number;
  error_message: string | null;
  created_at: string;
}

interface ProfileStatus {
  creator: {
    slug: string | null;
    categories: DemoCategoryKey[];
    published: boolean;
    published_at: string | null;
    theme: string;
    view_count: number;
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
      }
    } finally {
      setLoading(false);
    }
  }, [selected.length, slugDraft]);

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
          a hand-crafted Style Reel of you in each — no real-product needed. Drop
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

      {/* ── Section 2 · Slug ── */}
      <section className="mb-10">
        <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
          2 · Your public URL
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Keep it short — easier to drop in a DM or bio.
        </p>
        <div className="mt-3 flex items-stretch overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
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
        {slugError && (
          <p className="mt-2 text-[12px] text-red-500">{slugError}</p>
        )}
      </section>

      {/* ── Section 3 · Generate + gallery ── */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              3 · Your Style Reel
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
              Build my Style Reel
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

      {/* ── Section 4 · Publish + share ── */}
      <section className="mb-10 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/[0.06] via-transparent to-transparent p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
              4 · Go live
            </h2>
            <p className="mt-1 max-w-md text-[13px] text-[var(--color-muted-foreground)]">
              Publishing exposes <code className="font-mono text-[12px]">faiceoff.com/creators/{liveSlug ?? "your-handle"}</code> to anyone with the link.
              {status?.creator?.published && (
                <>
                  {" "}You can unpublish anytime — link returns 404 until you flip it back on.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.creator?.published ? (
              <Button
                type="button"
                onClick={() => handlePublish(false)}
                disabled={publishing}
                className="h-9 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 text-[13px] font-700 text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Unpublish
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handlePublish(true)}
                disabled={publishing || !canPublish}
                className="h-9 gap-2 rounded-lg bg-emerald-500 px-4 text-[13px] font-700 text-white hover:opacity-90 disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                Publish profile
              </Button>
            )}
          </div>
        </div>

        {status?.creator?.published && liveUrl && (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
            <span className="flex h-7 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 text-[11px] font-700 uppercase tracking-wider text-emerald-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
            <code className="flex-1 truncate font-mono text-[12.5px] text-[var(--color-foreground)]">
              {liveUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-secondary)] px-2.5 text-[11px] font-700 text-[var(--color-foreground)] hover:bg-[var(--color-card)]"
            >
              <Copy className="h-3 w-3" />
              {copyState === "copied" ? "Copied!" : "Copy"}
            </button>
            <Link
              href={`/creators/${liveSlug}`}
              target="_blank"
              className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-2.5 text-[11px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              <Share2 className="h-3 w-3" />
              View
            </Link>
          </div>
        )}
        {!status?.creator?.published && !canPublish && (
          <p className="mt-3 text-[12px] text-[var(--color-muted-foreground)]">
            <ArrowRight className="mr-1 inline h-3 w-3" />
            Build at least 1 Style Reel frame first to unlock Publish.
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
        <img
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
