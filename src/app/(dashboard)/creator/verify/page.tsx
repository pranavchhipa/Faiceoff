"use client";

/**
 * /creator/verify — Get the golden tick.
 *
 * Post-onboarding manual verification. Creator uploads Aadhaar + PAN, confirms
 * they follow @faiceoff.official on Instagram, and submits for a Control Centre operator
 * to review. States: not_started (form) → pending (review) → verified / rejected.
 *
 * Mobile-first, canonical dashboard tokens. Gold is reserved for the seal.
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Upload,
  FileText,
  AtSign,
  Check,
  Clock,
  X,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useCachedFetch, invalidateCache } from "@/lib/hooks/use-cached-fetch";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { compressImageForUpload } from "@/lib/utils/image-compression";

const IG_URL = "https://instagram.com/faiceoff.official";

interface VerificationState {
  is_verified: boolean;
  onboarding_complete: boolean;
  status: "not_started" | "pending" | "verified" | "rejected";
  aadhaar_uploaded: boolean;
  pan_uploaded: boolean;
  instagram_followed: boolean;
  submitted_at: string | null;
  rejection_reason: string | null;
}

export default function CreatorVerifyPage() {
  const { data, loading: rawLoading, refresh } =
    useCachedFetch<VerificationState>("/api/creator/verification");
  const loading = rawLoading && !data;

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const verified = data?.is_verified || data?.status === "verified";
  const pending = data?.status === "pending";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:py-8">
      <Header />
      {verified ? (
        <VerifiedState />
      ) : pending ? (
        <PendingState submittedAt={data?.submitted_at ?? null} />
      ) : (
        <VerifyForm
          rejected={data?.status === "rejected"}
          rejectionReason={data?.rejection_reason ?? null}
          onboardingComplete={data?.onboarding_complete ?? true}
          onSubmitted={() => {
            invalidateCache("/api/creator/verification");
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ───────── Header ───────── */

function Header() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6"
    >
      <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
        <ShieldCheck className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
        Verification
      </p>
      <h1 className="mt-1 flex items-center gap-2 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)] sm:text-[34px]">
        Get the gold tick
        <VerifiedSeal size={26} />
      </h1>
      <p className="mt-2 max-w-lg text-[13px] text-[var(--color-muted-foreground)] sm:text-[14px]">
        Verified creators stand out in discovery, build brand trust, and unlock
        payouts. Quick one-time check — Aadhaar, PAN, and a follow.
      </p>
    </motion.div>
  );
}

/* ───────── Verified state ───────── */

function VerifiedState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 via-[var(--color-card)] to-[var(--color-card)] p-8 text-center"
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
        <VerifiedSeal size={44} />
      </div>
      <h2 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
        You&apos;re verified
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
        The gold tick now appears on your profile and across discovery. Brands
        can see you&apos;re a real, vetted creator.
      </p>
      <Link
        href="/creator/dashboard"
        className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
      >
        Back to dashboard
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </motion.div>
  );
}

/* ───────── Pending state ───────── */

function PendingState({ submittedAt }: { submittedAt: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
        <Clock className="h-6 w-6" />
      </div>
      <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
        Under review
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
        Your documents are with our team. Most reviews finish within 1–2
        business days — we&apos;ll notify you the moment it&apos;s done.
      </p>
      {submittedAt && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Submitted {new Date(submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
    </motion.div>
  );
}

/* ───────── The form ───────── */

function VerifyForm({
  rejected,
  rejectionReason,
  onboardingComplete,
  onSubmitted,
}: {
  rejected: boolean;
  rejectionReason: string | null;
  onboardingComplete: boolean;
  onSubmitted: () => void;
}) {
  const [aadhaar, setAadhaar] = useState<File | null>(null);
  const [pan, setPan] = useState<File | null>(null);
  const [followed, setFollowed] = useState(false);
  const [igClicked, setIgClicked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!aadhaar && !!pan && followed && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !aadhaar || !pan) return;
    setSubmitting(true);
    setError(null);
    try {
      // Compress image docs (PDFs pass straight through) so we stay well
      // under the serverless body limit.
      const prep = async (f: File) =>
        f.type === "application/pdf"
          ? f
          : await compressImageForUpload(f, { maxDimension: 2000, quality: 0.85 }).catch(() => f);

      const [a, p] = await Promise.all([prep(aadhaar), prep(pan)]);
      const fd = new FormData();
      fd.append("aadhaar", a);
      fd.append("pan", p);
      fd.append("instagram_followed", "true");

      const res = await fetch("/api/creator/verification/submit", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? d.error ?? "Submission failed");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {!onboardingComplete && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3.5 text-[12.5px] text-amber-700 dark:text-amber-400">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Finish onboarding first — then come back to get verified.
        </div>
      )}

      {rejected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/8 p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div>
            <p className="text-[13px] font-700 text-rose-600 dark:text-rose-400">
              Previous submission needs another look
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
              {rejectionReason || "Please re-check your documents and resubmit."}
            </p>
          </div>
        </div>
      )}

      {/* Step 1 — follow */}
      <StepCard
        n={1}
        icon={AtSign}
        title="Follow @faiceoff.official on Instagram"
        desc="A quick follow helps us confirm you're an active creator."
      >
        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setIgClicked(true)}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3.5 py-2 text-[12.5px] font-700 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40"
        >
          <AtSign className="h-3.5 w-3.5" />
          Open @faiceoff.official
        </a>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 select-none">
          <input
            type="checkbox"
            checked={followed}
            onChange={(e) => setFollowed(e.target.checked)}
            className="peer sr-only"
          />
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
              followed
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] bg-[var(--color-card)]"
            }`}
          >
            {followed && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className="text-[12.5px] text-[var(--color-foreground)]">
            I&apos;m now following @faiceoff.official
            {!igClicked && (
              <span className="ml-1 text-[var(--color-muted-foreground)]">(open the link first)</span>
            )}
          </span>
        </label>
      </StepCard>

      {/* Step 2 — Aadhaar */}
      <StepCard
        n={2}
        icon={FileText}
        title="Upload Aadhaar"
        desc="Front side, clear and readable. Image or PDF."
      >
        <DocUpload file={aadhaar} onPick={setAadhaar} label="Aadhaar" />
      </StepCard>

      {/* Step 3 — PAN */}
      <StepCard
        n={3}
        icon={FileText}
        title="Upload PAN"
        desc="Your PAN card. Image or PDF."
      >
        <DocUpload file={pan} onPick={setPan} label="PAN" />
      </StepCard>

      {/* Privacy note */}
      <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3 text-[11.5px] text-[var(--color-muted-foreground)]">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" />
        Your documents are encrypted, stored privately, and only seen by our
        verification team. Never shared with brands.
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[12.5px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] py-3.5 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            Submit for verification
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </motion.div>
  );
}

/* ───────── Step card shell ───────── */

function StepCard({
  n,
  icon: Icon,
  title,
  desc,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-display text-[13px] font-800 text-[var(--color-primary)]">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[15px] font-700 text-[var(--color-foreground)]">
            <Icon className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            {title}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
            {desc}
          </p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Document upload tile ───────── */

function DocUpload({
  file,
  onPick,
  label,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  label: string;
}) {
  const isPdf = file?.type === "application/pdf";
  const previewUrl = file && !isPdf ? URL.createObjectURL(file) : null;

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-2.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-secondary)]">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <FileText className="h-5 w-5 text-[var(--color-muted-foreground)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-600 text-[var(--color-foreground)]">
            {file.name}
          </p>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {(file.size / 1024 / 1024).toFixed(1)} MB · ready
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
          aria-label={`Remove ${label}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-4 py-5 text-center transition-colors hover:border-[var(--color-primary)]/40">
      <Upload className="h-5 w-5 text-[var(--color-muted-foreground)]" />
      <span className="text-[12.5px] font-600 text-[var(--color-foreground)]">
        Tap to upload {label}
      </span>
      <span className="text-[11px] text-[var(--color-muted-foreground)]">
        JPG, PNG, WebP or PDF · max 15 MB
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
