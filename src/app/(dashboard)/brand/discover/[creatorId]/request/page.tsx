"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Zap,
  Globe,
  Upload,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { compressImageForUpload } from "@/lib/utils/image-compression";

const TIER_META = {
  frame:   { label: "Frame",   badge: "Social Organic", duration: "90 days",  icon: ImageIcon, color: "text-sky-500" },
  feature: { label: "Feature", badge: "Social Paid",    duration: "6 months", icon: Zap,       color: "text-[var(--color-primary)]" },
  cover:   { label: "Cover",   badge: "Digital Full",   duration: "12 months", icon: Globe,    color: "text-violet-500" },
} as const;

interface PackageInfo {
  id: string;
  tier: "frame" | "feature" | "cover";
  price_paise: number;
  final_images: number;
}

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default function SendRequestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const creatorId = params.creatorId as string;
  const packageId = searchParams.get("package") ?? "";

  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [productName, setProductName] = useState("");
  const [briefOneLiner, setBriefOneLiner] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packageId) return;
    fetch(`/api/creator/packages/${packageId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.package) setPkg(d.package); })
      .catch(() => null);
  }, [packageId]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Aggressive compression — Vercel body limit is 4.5 MB. Start at 1600px /
      // q=0.82, retry tighter if still over 3.8 MB.
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

      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/campaigns/upload-product-image", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setProductImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = ""; // allow re-selecting the same file
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productImageUrl) { setError("Upload a product image first"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/collab-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: packageId,
          product_name: productName,
          product_image_url: productImageUrl,
          brief_one_liner: briefOneLiner,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ? `${d.error}: ${d.detail}` : (d.error ?? "Failed to send request"));
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-500" />
        <h2 className="font-display text-[26px] font-800 tracking-tight text-[var(--color-foreground)]">
          Request sent!
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          The creator has 72 hours to accept or decline. We&apos;ll email you the moment they respond — no charge until they accept.
        </p>
        <button
          onClick={() => router.push("/brand/collabs")}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)]"
        >
          View my collabs <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const tierKey = (pkg?.tier ?? "frame") as keyof typeof TIER_META;
  const meta = TIER_META[tierKey];

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/brand/discover/${creatorId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to profile
      </Link>

      <h1 className="font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
        Send collab request
      </h1>

      {/* Package summary */}
      {pkg && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <meta.icon className={`h-5 w-5 shrink-0 ${meta.color}`} />
          <div className="flex-1">
            <p className="font-display text-[15px] font-800 text-[var(--color-foreground)]">
              {meta.label} package
            </p>
            <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {meta.badge} · {meta.duration} · {pkg.final_images} images
            </p>
          </div>
          <p className="font-display text-[18px] font-800 text-[var(--color-foreground)]">
            {fmt(pkg.price_paise)}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* Product name */}
        <div>
          <label className="mb-1.5 block font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Product name *
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. AuraGlow Serum"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-2.5 text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30"
          />
        </div>

        {/* Product image */}
        <div>
          <label className="mb-1.5 block font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Main product image *
          </label>

          {productImageUrl ? (
            // Preview state
            <div className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-3">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[var(--color-card)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productImageUrl}
                  alt="Product preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between min-w-0">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[12px] font-700 text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                  </p>
                  <p className="mt-1 truncate text-[11px] text-[var(--color-muted-foreground)]">
                    Looks good? This is what the creator will see.
                  </p>
                </div>
                <label className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1 text-[11px] font-600 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40">
                  <Upload className="h-3 w-3" />
                  {uploading ? "Replacing…" : "Replace"}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            </div>
          ) : (
            // Empty state
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-5 transition hover:border-[var(--color-primary)]/50">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
              ) : (
                <Upload className="h-5 w-5 text-[var(--color-muted-foreground)]" />
              )}
              <span className="text-[13px] text-[var(--color-muted-foreground)]">
                {uploading ? "Uploading…" : "Click to upload product photo"}
              </span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
            </label>
          )}

          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
            <span className="font-700 text-[var(--color-foreground)]">One main product image to evaluate the brief.</span>{" "}
            After the creator accepts + payment, you can swap in variants of the same product (e.g. different colors of the same shoe) for each generation in Studio — within the agreed product family. JPG / PNG / WebP, any size — we compress automatically.
          </p>
        </div>

        {/* Brief one-liner */}
        <div>
          <label className="mb-1.5 block font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Brief one-liner *
          </label>
          <textarea
            value={briefOneLiner}
            onChange={(e) => setBriefOneLiner(e.target.value)}
            required
            maxLength={500}
            rows={3}
            placeholder="e.g. Outdoor lifestyle shots showcasing the serum's glow effect for Instagram Reels"
            className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-2.5 text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30"
          />
          <p className="mt-1 text-right font-mono text-[10px] text-[var(--color-muted-foreground)]">
            {briefOneLiner.length}/500
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-[13px] text-red-500">
            {error}
          </p>
        )}

        {/* What happens next */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-4 py-3">
          <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            What happens after you click Send
          </p>
          <ol className="space-y-1.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            <li className="flex gap-2">
              <span className="font-700 text-[var(--color-primary)]">1.</span>
              <span>Creator gets your brief + product image. They have <span className="font-700 text-[var(--color-foreground)]">72 hours to accept or decline</span> — if no reply, request auto-expires and nothing is charged.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-700 text-[var(--color-primary)]">2.</span>
              <span>When they accept, you&apos;ll see a <span className="font-700 text-[var(--color-foreground)]">Pay button</span> on the collab page. Click it to pay <span className="font-700 text-[var(--color-foreground)]">{pkg ? fmt(pkg.price_paise) : "the package price"}</span> via Razorpay — nothing is auto-deducted, you pay only when ready.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-700 text-[var(--color-primary)]">3.</span>
              <span>Funds sit in Faiceoff escrow. You generate {pkg?.final_images ?? "your"} final images in Studio — each one goes to the creator for approval before delivery. Escrow releases to creator after collab completes.</span>
            </li>
          </ol>
        </div>

        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          By sending you agree to Faiceoff&apos;s Terms of Service. No charge happens automatically — payment only when you click Pay after acceptance.
        </p>

        <button
          type="submit"
          disabled={submitting || uploading || !productName || !productImageUrl || !briefOneLiner}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>Send request <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>
    </div>
  );
}
