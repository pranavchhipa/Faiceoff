"use client";

/**
 * /brand/verify — Get the brand verified badge.
 *
 * Brands type business details (GST, PAN, company + legal name, registered
 * address) and submit for a Control Centre operator to review. No document
 * upload (unlike creators). States: not_started (form) → pending (review) →
 * verified / rejected.
 *
 * Dark-only, canonical dashboard tokens. Gold is reserved for the seal.
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Building2,
  Clock,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Check,
} from "lucide-react";
import { useCachedFetch, invalidateCache } from "@/lib/hooks/use-cached-fetch";
import { VerifiedSeal } from "@/components/ui/verified-seal";

interface VerificationState {
  is_verified: boolean;
  status: "not_started" | "pending" | "verified" | "rejected";
  gst_number: string | null;
  pan_number: string | null;
  company_name: string | null;
  legal_name: string | null;
  registered_address: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
}

export default function BrandVerifyPage() {
  const { data, loading: rawLoading, refresh } =
    useCachedFetch<VerificationState>("/api/brand/verification");
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
          prefill={data ?? null}
          onSubmitted={() => {
            invalidateCache("/api/brand/verification");
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
        Brand verification
      </p>
      <h1 className="mt-1 flex items-center gap-2 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)] sm:text-[34px]">
        Get verified
        <VerifiedSeal size={26} />
      </h1>
      <p className="mt-2 max-w-lg text-[13px] text-[var(--color-muted-foreground)] sm:text-[14px]">
        Verified brands earn creator trust and unlock collaborations. Share your
        business details — our team reviews them manually, usually within 1–2
        business days.
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
        Your brand is verified
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
        Creators can now see you&apos;re a real, vetted business. You&apos;re
        cleared to start collaborating.
      </p>
      <Link
        href="/brand/dashboard"
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
        Your business details are with our team. Most reviews finish within 1–2
        business days — we&apos;ll notify you the moment it&apos;s done.
      </p>
      {submittedAt && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Submitted{" "}
          {new Date(submittedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}
    </motion.div>
  );
}

/* ───────── The form ───────── */

function VerifyForm({
  rejected,
  rejectionReason,
  prefill,
  onSubmitted,
}: {
  rejected: boolean;
  rejectionReason: string | null;
  prefill: VerificationState | null;
  onSubmitted: () => void;
}) {
  const [companyName, setCompanyName] = useState(prefill?.company_name ?? "");
  const [gstNumber, setGstNumber] = useState(prefill?.gst_number ?? "");
  const [panNumber, setPanNumber] = useState(prefill?.pan_number ?? "");
  const [legalName, setLegalName] = useState(prefill?.legal_name ?? "");
  const [registeredAddress, setRegisteredAddress] = useState(
    prefill?.registered_address ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !!companyName.trim() &&
    !!gstNumber.trim() &&
    !!panNumber.trim() &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/brand/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          gst_number: gstNumber.trim(),
          pan_number: panNumber.trim(),
          legal_name: legalName.trim() || null,
          registered_address: registeredAddress.trim() || null,
        }),
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
      {rejected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/8 p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div>
            <p className="text-[13px] font-700 text-rose-600 dark:text-rose-400">
              Previous submission needs another look
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
              {rejectionReason ||
                "Please re-check your business details and resubmit."}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
              Business details
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
              These are verified against your registration. Make sure they match
              your official records.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field
            label="GST number"
            required
            value={gstNumber}
            onChange={(v) => setGstNumber(v.toUpperCase())}
            placeholder="22AAAAA0000A1Z5"
          />
          <Field
            label="PAN number"
            required
            value={panNumber}
            onChange={(v) => setPanNumber(v.toUpperCase())}
            placeholder="ABCDE1234F"
          />
          <Field
            label="Company name"
            required
            value={companyName}
            onChange={setCompanyName}
            placeholder="Acme Inc."
          />
          <Field
            label="Legal / registered name"
            value={legalName}
            onChange={setLegalName}
            placeholder="Acme Private Limited"
            hint="Optional — the legal entity name on your registration."
          />
          <div>
            <label className="mb-1.5 block text-[12.5px] font-700 text-[var(--color-foreground)]">
              Registered address
              <span className="ml-1.5 font-400 text-[var(--color-muted-foreground)]">
                (optional)
              </span>
            </label>
            <textarea
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              placeholder="Registered business address as on GST certificate"
              rows={3}
              className="w-full resize-none rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus:border-[var(--color-primary)]/50"
            />
          </div>
        </div>
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

      <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-[var(--color-muted-foreground)]">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
        Your details are stored securely and only seen by our verification team.
      </p>
    </motion.div>
  );
}

/* ───────── Field primitive ───────── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-700 text-[var(--color-foreground)]">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--color-primary)]">*</span>
        ) : (
          <span className="ml-1.5 font-400 text-[var(--color-muted-foreground)]">
            (optional)
          </span>
        )}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus:border-[var(--color-primary)]/50"
      />
      {hint && (
        <p className="mt-1 text-[11.5px] text-[var(--color-muted-foreground)]">
          {hint}
        </p>
      )}
    </div>
  );
}
