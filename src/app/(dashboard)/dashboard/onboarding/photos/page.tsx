"use client";

/**
 * Onboarding · Reference photos — THE most important step.
 *
 * These photos become the identity anchor for every AI generation in Studio.
 * Garbage in → garbage out, so this step gates hard on quality:
 *   - resolution (≥ 768px shortest side; warn 768–1024)
 *   - real image types only, de-duplicated
 *   - 5–15 photos, with a creator-chosen PRIMARY (the main face anchor +
 *     the one we compute the face embedding from)
 *   - clear do / don't guidance so creators self-select good shots
 *
 * Upload contract is unchanged: POST /api/onboarding/upload-photo per file →
 * POST /api/onboarding/save-photos { storage_paths } (primary first) →
 * POST /api/onboarding/update-step { step: "complete" }.
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Upload,
  X,
  ImagePlus,
  ArrowRight,
  ArrowLeft,
  Check,
  Star,
  Sparkles,
  AlertTriangle,
  Sun,
  ScanFace,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { compressImageForUpload } from "@/lib/utils/image-compression";

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 15;
const MIN_SHORT_SIDE = 768; // hard reject below this
const GOOD_SHORT_SIDE = 1024; // warn between MIN and GOOD

interface PhotoPreview {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  lowRes: boolean; // passed min but below "good"
}

/** Read intrinsic dimensions of an image File. */
function readDims(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const DOS = [
  { icon: ScanFace, t: "Face front & centre", d: "Face fills 40%+ of the frame, eyes open, looking at camera." },
  { icon: Sun, t: "Even, natural light", d: "Soft daylight. No harsh shadows across the face." },
  { icon: Camera, t: "Varied angles", d: "A few straight-on, a few 3/4 turns. Different days/outfits." },
];
const DONTS = [
  "Sunglasses, masks, heavy filters",
  "Group photos or other people in frame",
  "Blurry, dark, or low-resolution shots",
  "Hats covering the face, extreme angles",
];

export default function PhotosPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rejects, setRejects] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const incoming = Array.from(files);
      const accepted: PhotoPreview[] = [];
      const newRejects: string[] = [];

      for (const file of incoming) {
        if (photos.length + accepted.length >= MAX_PHOTOS) {
          newRejects.push(`Max ${MAX_PHOTOS} photos — skipped extras.`);
          break;
        }
        if (!file.type.startsWith("image/")) {
          newRejects.push(`${file.name}: not an image.`);
          continue;
        }
        // De-dupe by name + size.
        const dup = photos.some((p) => p.file.name === file.name && p.file.size === file.size);
        if (dup) {
          newRejects.push(`${file.name}: already added.`);
          continue;
        }
        const dims = await readDims(file);
        if (!dims) {
          newRejects.push(`${file.name}: couldn't read image.`);
          continue;
        }
        const shortSide = Math.min(dims.w, dims.h);
        if (shortSide < MIN_SHORT_SIDE) {
          newRejects.push(`${file.name}: too small (${shortSide}px). Needs ≥ ${MIN_SHORT_SIDE}px.`);
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
          width: dims.w,
          height: dims.h,
          lowRes: shortSide < GOOD_SHORT_SIDE,
        });
      }

      if (accepted.length) {
        setPhotos((prev) => {
          const next = [...prev, ...accepted];
          // Auto-pick first ever photo as primary.
          if (!primaryId && next.length) setPrimaryId(next[0].id);
          return next;
        });
      }
      setRejects(newRejects);
    },
    [photos, primaryId],
  );

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      const next = prev.filter((p) => p.id !== id);
      if (primaryId === id) setPrimaryId(next[0]?.id ?? null);
      return next;
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || photos.length < MIN_PHOTOS) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Order so the chosen PRIMARY is first — save-photos marks index 0 as
      // is_primary and computes the face embedding from it.
      const ordered = [...photos].sort((a, b) =>
        a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0,
      );

      // Compress all in parallel (canvas work is fast + CPU-bound).
      const files = await Promise.all(
        ordered.map(async (p) => {
          try {
            return await compressImageForUpload(p.file);
          } catch {
            return p.file; // upload original on compression failure
          }
        }),
      );

      // Upload all concurrently. The browser caps connections-per-host (~6),
      // so this self-throttles into a few fast waves instead of one long
      // serial chain. Promise.all preserves order → primary stays at index 0.
      let done = 0;
      const uploadOne = async (file: File, idx: number): Promise<string> => {
        const form = new FormData();
        form.append("photo", file);
        const res = await fetch("/api/onboarding/upload-photo", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          if (res.status === 413)
            throw new Error(`Photo ${idx + 1} is too large even after compression (under 10 MB please).`);
          let msg = "Upload failed";
          try {
            msg = (await res.json()).error || msg;
          } catch {
            msg = `Server error (${res.status})`;
          }
          throw new Error(msg);
        }
        setUploadProgress(++done);
        return ((await res.json()) as { path: string }).path;
      };

      const uploadedPaths = await Promise.all(
        files.map((f, i) => uploadOne(f, i)),
      );

      const saveRes = await fetch("/api/onboarding/save-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_paths: uploadedPaths }),
      });
      if (!saveRes.ok) {
        let msg = "Failed to save photos";
        try {
          msg = (await saveRes.json()).error || msg;
        } catch {
          msg = `Server error (${saveRes.status})`;
        }
        throw new Error(msg);
      }

      const stepRes = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "complete" }),
      });
      if (!stepRes.ok) throw new Error("Failed to complete onboarding");

      router.push("/dashboard/onboarding/complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const enough = photos.length >= MIN_PHOTOS;
  const pct = Math.min(100, Math.round((photos.length / MIN_PHOTOS) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <button
        type="button"
        onClick={() => router.push("/dashboard/onboarding/consent")}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="size-3.5" /> Back
      </button>

      {/* Header */}
      <div className="mb-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-primary)]/10 px-2.5 py-1 text-[11px] font-700 uppercase tracking-wider text-[var(--color-primary)]">
          <Camera className="size-3" />
          Reference photos
        </div>
        <h2 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
          The photos that become your AI face
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
          Every Studio generation is anchored on these. Better photos in → sharper,
          more like-you results out. Upload {MIN_PHOTOS}–{MAX_PHOTOS} clear, solo shots.
        </p>
      </div>

      {/* Do / Don't guide */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <p className="mb-2.5 flex items-center gap-1.5 font-display text-[13px] font-800 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" strokeWidth={3} /> Do this
          </p>
          <ul className="space-y-2.5">
            {DOS.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                  <Icon className="size-3.5" />
                </span>
                <span className="text-[12.5px] leading-snug">
                  <span className="font-700 text-[var(--color-foreground)]">{t}.</span>{" "}
                  <span className="text-[var(--color-muted-foreground)]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
          <p className="mb-2.5 flex items-center gap-1.5 font-display text-[13px] font-800 text-rose-600 dark:text-rose-400">
            <X className="size-3.5" strokeWidth={3} /> Avoid
          </p>
          <ul className="space-y-2">
            {DONTS.map((d) => (
              <li key={d} className="flex items-start gap-2 text-[12.5px] text-[var(--color-muted-foreground)]">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-rose-400" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          className={`relative mb-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 transition-all ${
            isDragOver
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
              : "border-[var(--color-border)] bg-[var(--color-card)]"
          } ${photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-40" : ""}`}
        >
          <Upload
            className={`mb-3 size-7 ${isDragOver ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"}`}
          />
          <p className="text-sm font-700 text-[var(--color-foreground)]">
            Drag photos here, or
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-2 text-[12.5px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <ImagePlus className="size-3.5" /> Choose from gallery
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-2 text-[12.5px] font-700 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 sm:hidden"
            >
              <Camera className="size-3.5" /> Take photo
            </button>
          </div>
          <p className="mt-2.5 text-[11px] text-[var(--color-muted-foreground)]">
            JPG, PNG, WebP · at least {MIN_SHORT_SIDE}px · up to 10 MB each
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Rejected files notice */}
        <AnimatePresence>
          {rejects.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-700 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" /> Some photos were skipped
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {rejects.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-[11.5px] text-[var(--color-muted-foreground)]">
                      · {r}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress strip */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-secondary)]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${enough ? "bg-emerald-500" : "bg-[var(--color-primary)]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`shrink-0 text-[12px] font-700 ${enough ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--color-muted-foreground)]"}`}>
            {photos.length}/{MAX_PHOTOS}
            {!enough && <span className="font-500"> · {MIN_PHOTOS - photos.length} more</span>}
          </span>
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            <AnimatePresence>
              {photos.map((photo) => {
                const isPrimary = photo.id === primaryId;
                return (
                  <motion.div
                    key={photo.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className={`group relative aspect-square overflow-hidden rounded-xl border ${
                      isPrimary
                        ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40"
                        : "border-[var(--color-border)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />

                    {/* Primary badge */}
                    {isPrimary && (
                      <span className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[9px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)]">
                        <Star className="size-2.5 fill-current" /> Main
                      </span>
                    )}
                    {/* Low-res warning */}
                    {photo.lowRes && (
                      <span className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-700 text-white">
                        <AlertTriangle className="size-2.5" /> low-res
                      </span>
                    )}

                    {/* Hover actions */}
                    <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-black/40 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          className="flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-rose-500"
                          aria-label="Remove"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => setPrimaryId(photo.id)}
                          className="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--color-primary)]/95 py-1 text-[9px] font-800 uppercase tracking-wider text-[var(--color-primary-foreground)] backdrop-blur-md"
                        >
                          <Star className="size-2.5" /> Set main
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/40 text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
              >
                <ImagePlus className="size-5" />
                <span className="text-[10px] font-600">Add</span>
              </button>
            )}
          </div>
        )}

        {/* Primary hint */}
        {photos.length > 0 && (
          <p className="mb-4 flex items-center gap-1.5 text-[11.5px] text-[var(--color-muted-foreground)]">
            <Star className="size-3 text-[var(--color-primary)]" />
            Your <span className="font-700 text-[var(--color-foreground)]">Main</span> photo is the
            strongest anchor — pick your clearest, front-facing shot.
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-4">
            <div className="mb-2 flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-muted-foreground)]">
                Uploading {uploadProgress} of {photos.length}…
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                style={{ width: `${(uploadProgress / photos.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !enough}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-8 font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0 sm:w-auto"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="size-4" />
              {enough ? "Finish & build my face" : `Add ${MIN_PHOTOS - photos.length} more to continue`}
              {enough && <ArrowRight className="size-4" />}
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
