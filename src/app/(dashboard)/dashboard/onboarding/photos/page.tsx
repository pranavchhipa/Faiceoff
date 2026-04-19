"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Upload,
  X,
  ImagePlus,
  ArrowRight,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { compressImageForUpload } from "@/lib/utils/image-compression";

const PHOTO_DOS = [
  "Clear face visibility — no sunglasses, masks, or heavy makeup",
  "Varied angles: front-facing, 3/4 profile, slight head tilt",
  "Mix of lighting: natural sunlight, indoor, golden hour",
  "Different expressions: neutral, smiling, serious, laughing",
  "Solo photos only — no group shots or other faces",
  "High resolution (min 512×512px), sharp & not blurry",
  "Recent photos taken within the last 6 months",
] as const;

const PHOTO_DONTS = [
  "No heavy filters, Snapchat lenses, or AI face-tuning",
  "No photos where face is less than 30% of the frame",
  "No blurry, pixelated, or low-light dark photos",
  "No duplicate or near-identical photos",
] as const;

interface PhotoPreview {
  id: string;
  file: File;
  url: string;
}

export default function PhotosPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newPhotos: PhotoPreview[] = [];
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        if (photos.length + newPhotos.length >= 15) break;
        if (!file.type.startsWith("image/")) continue;

        newPhotos.push({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
        });
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
    },
    [photos.length],
  );

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || photos.length < 5) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Upload each photo one-by-one through our API (admin client, no RLS).
      // We compress client-side first because Vercel's serverless body
      // limit (4.5 MB) is smaller than a typical phone photo (6-12 MB) —
      // uncompressed uploads get a 413 before the function even runs.
      const uploadedPaths: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        setUploadProgress(i + 1);

        let uploadFile: File = photo.file;
        try {
          uploadFile = await compressImageForUpload(photo.file);
        } catch (compressErr) {
          // Compression failed (e.g. HEIC on a browser that can't decode).
          // Fall back to the original — if it's too big the server will
          // return a specific 413 message below.
          console.warn(
            "[photos] client-side compression failed, uploading original:",
            compressErr,
          );
        }

        const form = new FormData();
        form.append("photo", uploadFile);

        const res = await fetch("/api/onboarding/upload-photo", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          if (res.status === 413) {
            throw new Error(
              `Photo ${i + 1} is too large even after compression. Please pick a smaller image (under 10 MB).`,
            );
          }
          let msg = "Upload failed";
          try {
            const body = await res.json();
            msg = body.error || msg;
          } catch {
            msg = `Server error (${res.status})`;
          }
          throw new Error(msg);
        }

        const { path } = (await res.json()) as { path: string };
        uploadedPaths.push(path);
      }

      // Save all paths to DB + advance step
      const saveRes = await fetch("/api/onboarding/save-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_paths: uploadedPaths }),
      });

      if (!saveRes.ok) {
        let msg = "Failed to save photos";
        try {
          const body = await saveRes.json();
          msg = body.error || msg;
        } catch {
          msg = `Server error (${saveRes.status})`;
        }
        throw new Error(msg);
      }

      router.push("/dashboard/onboarding/lora-review");
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
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-blush)] px-3 py-1 text-xs font-600 text-[var(--color-ink)] mb-3">
          <Camera className="size-3.5" />
          Reference Photos
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Upload your reference photos
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Upload 5-15 high-quality photos for AI model training. Use varied angles, lighting, and expressions for best results.
        </p>
      </div>

      {/* Photo Guidelines */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-mint)] bg-[var(--color-mint)]/10 p-4">
          <p className="text-sm font-700 text-[var(--color-ink)] mb-2 flex items-center gap-1.5">
            <Check className="size-4 text-green-600" />
            Best for LoRA training
          </p>
          <ul className="space-y-1.5">
            {PHOTO_DOS.map((item, i) => (
              <li key={i} className="text-xs text-[var(--color-neutral-600)] leading-relaxed flex gap-1.5">
                <span className="text-green-500 shrink-0 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50/50 p-4">
          <p className="text-sm font-700 text-[var(--color-ink)] mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-red-500" />
            Avoid these
          </p>
          <ul className="space-y-1.5">
            {PHOTO_DONTS.map((item, i) => (
              <li key={i} className="text-xs text-[var(--color-neutral-600)] leading-relaxed flex gap-1.5">
                <span className="text-red-400 shrink-0 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed p-8 cursor-pointer transition-all mb-6
            ${
              isDragOver
                ? "border-[var(--color-gold)] bg-[var(--color-gold)]/5"
                : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-50)]"
            }
            ${photos.length >= 15 ? "opacity-40 pointer-events-none" : ""}
          `}
        >
          <Upload
            className={`size-8 mb-3 ${
              isDragOver ? "text-[var(--color-gold)]" : "text-[var(--color-neutral-400)]"
            }`}
          />
          <p className="text-sm font-600 text-[var(--color-ink)] mb-1">
            Drag & drop photos here
          </p>
          <p className="text-xs text-[var(--color-neutral-400)]">
            or click to browse. JPG, PNG, WebP accepted.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Photo count */}
        <p
          className={`text-xs font-500 mb-4 ${
            photos.length < 5
              ? "text-[var(--color-neutral-400)]"
              : "text-[var(--color-gold)]"
          }`}
        >
          {photos.length}/15 photos selected
          {photos.length < 5 && ` (minimum 5 required)`}
        </p>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
            <AnimatePresence>
              {photos.map((photo) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-square rounded-[var(--radius-input)] overflow-hidden border border-[var(--color-neutral-200)] group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt="Reference photo"
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add more button */}
            {photos.length < 15 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center aspect-square rounded-[var(--radius-input)] border border-dashed border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] hover:border-[var(--color-neutral-400)] transition-colors"
              >
                <ImagePlus className="size-5 text-[var(--color-neutral-400)]" />
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-5 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
              <span className="text-sm text-[var(--color-neutral-500)]">
                Uploading photo {uploadProgress} of {photos.length}...
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-neutral-200)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-gold)] transition-all duration-300"
                style={{ width: `${(uploadProgress / photos.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={uploading || photos.length < 5}
            className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600 disabled:opacity-40"
          >
            {uploading ? (
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Upload & Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
