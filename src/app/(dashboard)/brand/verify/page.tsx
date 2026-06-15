"use client";

/**
 * /brand/verify — GST-backed brand verification.
 *
 * Brands verify their business by entering their GSTIN, solving the GST-portal
 * captcha, and pulling their official record (legal name, trade name, PAN,
 * address, constitution) straight from the GST API. PAN is derived from the
 * GSTIN — no separate PAN entry. They then upload their GST certificate and
 * submit for a Control Centre operator to review.
 *
 * States (fetched on mount):
 *   not_started / rejected → 3-step flow (GST → certificate → submit)
 *   pending                → "Under review" + pulled GST info read-only
 *   verified               → "Brand verified" + locked GST info read-only
 *
 * Dark-only, canonical dashboard tokens. Gold is reserved for accents.
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
  Lock,
  Upload,
  FileText,
  RefreshCw,
  Landmark,
} from "lucide-react";
import { useCachedFetch, invalidateCache } from "@/lib/hooks/use-cached-fetch";
import { compressImageForUpload } from "@/lib/utils/image-compression";

interface VerificationState {
  status: "not_started" | "pending" | "verified" | "rejected";
  is_verified: boolean;
  gst_legal_name: string | null;
  gst_trade_name: string | null;
  gst_status: string | null;
  gst_address: string | null;
  gst_constitution: string | null;
  pan_number: string | null;
  gst_number: string | null;
  has_certificate: boolean;
  rejection_reason: string | null;
}

/** The shape returned by POST /verify-gst, also reused to seed read-only views. */
interface GstDetails {
  gstin: string;
  pan: string;
  legalName: string;
  tradeName: string | null;
  status: string;
  address: string;
  constitution: string | null;
  registrationDate?: string | null;
  taxpayerType?: string | null;
  isActive?: boolean;
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
        <VerifiedState data={data!} />
      ) : pending ? (
        <PendingState data={data!} />
      ) : (
        <VerifyFlow
          rejected={data?.status === "rejected"}
          rejectionReason={data?.rejection_reason ?? null}
          hasCertificate={data?.has_certificate ?? false}
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
      <h1 className="mt-1 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)] sm:text-[34px]">
        Verify with GST
      </h1>
      <p className="mt-2 max-w-lg text-[13px] text-[var(--color-muted-foreground)] sm:text-[14px]">
        Verified brands earn creator trust and unlock collaborations. We pull
        your business record straight from the GST portal — enter your GSTIN,
        solve the captcha, and upload your certificate.
      </p>
    </motion.div>
  );
}

/* ───────── Verified state ───────── */

function VerifiedState({ data }: { data: VerificationState }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/12 via-[var(--color-card)] to-[var(--color-card)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h2 className="font-display text-[22px] font-800 tracking-tight text-emerald-500">
          Brand verified
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
          Your GST record is confirmed. Creators can now see you&apos;re a real,
          registered business and you&apos;re cleared to start collaborating.
        </p>
        <Link
          href="/brand/dashboard"
          className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
        >
          Back to dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <GstRecordCard data={data} />
    </motion.div>
  );
}

/* ───────── Pending state ───────── */

function PendingState({ data }: { data: VerificationState }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
          Under review
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
          We&apos;re verifying your GST record and certificate. Most reviews
          finish within 1–2 business days — we&apos;ll notify you the moment
          it&apos;s done.
        </p>
      </div>

      <GstRecordCard data={data} />
    </motion.div>
  );
}

/* ───────── Read-only GST record card (verified + pending) ───────── */

function GstRecordCard({ data }: { data: VerificationState }) {
  // Only render if we actually have a pulled record.
  if (!data.gst_number && !data.gst_legal_name) return null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
          GST record
        </p>
        <span className="ml-auto font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Locked
        </span>
      </div>
      <ReadOnlyRows
        details={{
          gstin: data.gst_number ?? "—",
          pan: data.pan_number ?? "—",
          legalName: data.gst_legal_name ?? "—",
          tradeName: data.gst_trade_name,
          status: data.gst_status ?? "—",
          address: data.gst_address ?? "—",
          constitution: data.gst_constitution,
        }}
      />
    </div>
  );
}

/* ───────── The verification flow ───────── */

function VerifyFlow({
  rejected,
  rejectionReason,
  hasCertificate,
  onSubmitted,
}: {
  rejected: boolean;
  rejectionReason: string | null;
  hasCertificate: boolean;
  onSubmitted: () => void;
}) {
  // GST step
  const [gstin, setGstin] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState("");
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [verifyingGst, setVerifyingGst] = useState(false);
  const [gstError, setGstError] = useState<string | null>(null);
  const [gstDetails, setGstDetails] = useState<GstDetails | null>(null);

  // Certificate step
  const [certUploaded, setCertUploaded] = useState(hasCertificate);

  // Submit step
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /** GET a fresh captcha for the current GST session. */
  async function fetchCaptcha() {
    setLoadingCaptcha(true);
    setGstError(null);
    setCaptcha("");
    try {
      const res = await fetch("/api/brand/verification/captcha");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? d.message ?? "Couldn't load captcha");
      setSessionId(d.sessionId);
      setCaptchaImage(d.image);
    } catch (err) {
      setGstError(err instanceof Error ? err.message : "Couldn't load captcha");
    } finally {
      setLoadingCaptcha(false);
    }
  }

  /** POST the GSTIN + captcha to pull the official record. */
  async function verifyGst() {
    if (!gstin.trim() || !sessionId || !captcha.trim()) return;
    setVerifyingGst(true);
    setGstError(null);
    try {
      const res = await fetch("/api/brand/verification/verify-gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gstin: gstin.trim().toUpperCase(),
          sessionId,
          captcha: captcha.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? d.message ?? "GST verification failed");
      setGstDetails(d as GstDetails);
    } catch (err) {
      setGstError(err instanceof Error ? err.message : "GST verification failed");
      // Captcha is single-use — refetch a new one so they can retry cleanly.
      void fetchCaptcha();
    } finally {
      setVerifyingGst(false);
    }
  }

  /** POST submit once GST is verified + certificate uploaded. */
  async function handleSubmit() {
    if (!gstDetails || !certUploaded || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/brand/verification/submit", {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? d.message ?? "Submission failed");
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const gstVerified = !!gstDetails;
  const canSubmit = gstVerified && certUploaded && !submitting;

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
            <p className="text-[13px] font-700 text-rose-500">
              Previous submission needs another look
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
              {rejectionReason ||
                "Please re-verify your GST and re-upload your certificate."}
            </p>
          </div>
        </div>
      )}

      {/* ───── Step 1 — GST number + captcha ───── */}
      <StepCard
        n={1}
        icon={Landmark}
        title="Verify your GSTIN"
        desc="We pull your business record straight from the GST portal. PAN is taken from your GSTIN automatically — no separate PAN needed."
        done={gstVerified}
      >
        {gstVerified ? (
          <VerifiedGstPanel details={gstDetails!} />
        ) : (
          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-700 text-[var(--color-foreground)]">
                GST number (GSTIN)
                <span className="ml-1 text-[var(--color-primary)]">*</span>
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5 text-[13px] tracking-[0.04em] text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus:border-[var(--color-primary)]/50"
              />
            </div>

            {!captchaImage ? (
              <button
                type="button"
                disabled={!gstin.trim() || loadingCaptcha}
                onClick={fetchCaptcha}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3.5 py-2 text-[12.5px] font-700 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loadingCaptcha ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading captcha…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Get captcha
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-white px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={captchaImage}
                      alt="GST captcha"
                      className="h-10 object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchCaptcha}
                    disabled={loadingCaptcha}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)] disabled:opacity-40"
                    aria-label="Reload captcha"
                    title="New captcha"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${loadingCaptcha ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
                <input
                  type="text"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="Type the captcha above"
                  className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus:border-[var(--color-primary)]/50"
                />
                <button
                  type="button"
                  disabled={!gstin.trim() || !captcha.trim() || verifyingGst}
                  onClick={verifyGst}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  {verifyingGst ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Verifying GST…
                    </>
                  ) : (
                    <>
                      Verify GST
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}

            {gstError && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[12.5px] text-rose-500">
                {gstError}
              </p>
            )}
          </div>
        )}
      </StepCard>

      {/* ───── Step 2 — Certificate upload ───── */}
      <StepCard
        n={2}
        icon={FileText}
        title="Upload your GST certificate"
        desc="The registration certificate from the GST portal. Image or PDF."
        done={certUploaded}
        muted={!gstVerified}
      >
        <CertificateUpload
          uploaded={certUploaded}
          onUploaded={() => setCertUploaded(true)}
          onReset={() => setCertUploaded(false)}
        />
      </StepCard>

      {/* ───── Step 3 — Submit ───── */}
      <StepCard
        n={3}
        icon={ShieldCheck}
        title="Submit for verification"
        desc="Once your GST is verified and certificate uploaded, send it to our team."
        muted={!canSubmit}
      >
        {submitError && (
          <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[12.5px] text-rose-500">
            {submitError}
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
        {!canSubmit && (
          <p className="mt-2 text-center text-[11.5px] text-[var(--color-muted-foreground)]">
            {!gstVerified
              ? "Verify your GSTIN first."
              : "Upload your GST certificate to continue."}
          </p>
        )}
      </StepCard>

      <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-[var(--color-muted-foreground)]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
        Your GST record and certificate are stored securely and only seen by our
        verification team. Never shared with creators.
      </p>
    </motion.div>
  );
}

/* ───────── Verified GST panel (locked, after pull) ───────── */

function VerifiedGstPanel({ details }: { details: GstDetails }) {
  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <p className="text-[12.5px] font-700 text-[var(--color-foreground)]">
          Pulled from GST portal
        </p>
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      </div>
      <ReadOnlyRows details={details} />
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" />
        These fields come straight from the GST portal and can&apos;t be edited.
      </p>
    </div>
  );
}

/* ───────── Read-only rows (shared by locked panel + record cards) ───────── */

function ReadOnlyRows({ details }: { details: GstDetails }) {
  const active =
    typeof details.isActive === "boolean"
      ? details.isActive
      : details.status?.toLowerCase() === "active";

  return (
    <dl className="space-y-2.5">
      <Row label="Legal name" value={details.legalName} />
      {details.tradeName && <Row label="Trade name" value={details.tradeName} />}
      <Row label="GSTIN" value={details.gstin} mono />
      <div className="flex items-start justify-between gap-3">
        <dt className="text-[12px] text-[var(--color-muted-foreground)]">
          GST status
        </dt>
        <dd className="text-right">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-700 ${
              active
                ? "bg-emerald-500/12 text-emerald-500"
                : "bg-rose-500/12 text-rose-500"
            }`}
          >
            {active && <Check className="h-3 w-3" strokeWidth={3} />}
            {details.status || (active ? "Active" : "Inactive")}
          </span>
        </dd>
      </div>
      <Row label="PAN" value={details.pan} mono />
      {details.constitution && (
        <Row label="Constitution" value={details.constitution} />
      )}
      <Row label="Registered address" value={details.address} />
    </dl>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd
        className={`text-right text-[12.5px] font-600 text-[var(--color-foreground)] ${
          mono ? "font-mono tracking-[0.04em]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ───────── Step card shell ───────── */

function StepCard({
  n,
  icon: Icon,
  title,
  desc,
  done,
  muted,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  done?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-[var(--color-card)] p-4 transition-opacity sm:p-5 ${
        done
          ? "border-[var(--color-primary)]/30"
          : "border-[var(--color-border)]"
      } ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-800 ${
            done
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          }`}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
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

/* ───────── Certificate upload tile ───────── */

function CertificateUpload({
  uploaded,
  onUploaded,
  onReset,
}: {
  uploaded: boolean;
  onUploaded: () => void;
  onReset: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(picked: File | null) {
    if (!picked) return;
    if (picked.size > 15 * 1024 * 1024) {
      setError("File too large — max 15 MB.");
      return;
    }
    setError(null);
    setFile(picked);
    setUploading(true);
    try {
      // Compress image docs; PDFs pass straight through.
      const prepared =
        picked.type === "application/pdf"
          ? picked
          : await compressImageForUpload(picked, {
              maxDimension: 2000,
              quality: 0.85,
            }).catch(() => picked);

      const fd = new FormData();
      fd.append("file", prepared);

      const res = await fetch("/api/brand/verification/document", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        throw new Error(d.error ?? d.message ?? "Upload failed");
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setFile(null);
      onReset();
    } finally {
      setUploading(false);
    }
  }

  if (uploaded) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-700 text-[var(--color-foreground)]">
            {file?.name ?? "GST certificate"}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-emerald-500">
            <Check className="h-3 w-3" strokeWidth={3} />
            Uploaded
          </p>
        </div>
        <label className="shrink-0 cursor-pointer rounded-[var(--radius-button)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] font-700 text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]">
          Replace
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-4 py-5 text-center transition-colors hover:border-[var(--color-primary)]/40 ${
          uploading ? "pointer-events-none opacity-60" : "cursor-pointer"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
        ) : (
          <Upload className="h-5 w-5 text-[var(--color-muted-foreground)]" />
        )}
        <span className="text-[12.5px] font-600 text-[var(--color-foreground)]">
          {uploading ? "Uploading…" : "Tap to upload certificate"}
        </span>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">
          JPG, PNG, WebP or PDF · max 15 MB
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          disabled={uploading}
          onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[12.5px] text-rose-500">
          {error}
        </p>
      )}
    </div>
  );
}
