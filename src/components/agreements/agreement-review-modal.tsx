"use client";

/**
 * AgreementReviewModal — the pre-signing review + e-signature gate.
 *
 * Shared by:
 *   • Creator accept (role="creator")  → "Accept & Sign"
 *   • Brand payment (role="brand")     → "Agree & Continue to payment"
 *
 * Fetches the deterministic terms from /api/collab-requests/[id]/agreement-preview
 * so both sides review identical numbers, then captures a typed-name electronic
 * signature. The parent performs the actual accept / pay with the signed name.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  ShieldCheck,
  FileSignature,
  ScrollText,
  CheckCircle2,
} from "lucide-react";
import { AGREEMENT_VERSION } from "@/lib/agreements/clauses";
import type { AgreementTerms } from "@/lib/agreements/types";

interface PreviewResponse {
  terms: AgreementTerms;
  parties: { brand_company_name: string; creator_display_name: string };
  role: "brand" | "creator";
  signatures: {
    creator_signed: boolean;
    creator_signed_at: string | null;
    brand_signed: boolean;
    brand_signed_at: string | null;
    status: string | null;
    agreement_id: string | null;
  };
}

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

// Concise "what you're agreeing to" — full legal text lives in the signed PDF.
const CLAUSE_SUMMARY: { title: string; body: string }[] = [
  { title: "Grant of likeness rights", body: "Non-exclusive, non-transferable licence to use only the images the creator approves, within the agreed scope and term." },
  { title: "Creator approval control", body: "No image is delivered or usable until the creator expressly approves it. Rejected images grant no rights." },
  { title: "Fees & escrow", body: "The brand pays into escrow; the creator's share is released on completion, paid out after KYC." },
  { title: "Restrictions", body: "No adult, political, defamatory, endorsement, or AI-dataset use; no sub-licensing or identity alteration." },
  { title: "Representations", body: "Creator: photos are of them, 18+, rightfully theirs. Brand: lawful use, within scope, authorised to contract." },
  { title: "Data protection (DPDP 2023)", body: "Likeness data is processed under consent; Faiceoff is Data Fiduciary; reference photos are never shared with the brand." },
  { title: "Termination & governing law", body: "Licences end with the term or on breach/consent-withdrawal. Governed by Indian law, courts at Noida (UP)." },
];

export function AgreementReviewModal({
  requestId,
  role,
  open,
  onClose,
  onSigned,
  submitting = false,
  submitError = null,
}: {
  requestId: string;
  role: "creator" | "brand";
  open: boolean;
  onClose: () => void;
  /** Parent performs the accept/pay with the captured signature name. */
  onSigned: (signedName: string) => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setLoadError(null);
    setName("");
    setAgreed(false);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/collab-requests/${requestId}/agreement-preview`);
        if (!res.ok) throw new Error("Could not load the agreement.");
        const json = (await res.json()) as PreviewResponse;
        if (!cancelled) setPreview(json);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, requestId]);

  const nameValid = name.trim().replace(/\s+/g, " ").length >= 2;
  const canSubmit = nameValid && agreed && !submitting && !!preview;

  const ctaLabel = role === "creator" ? "Accept & Sign" : "Agree & continue to payment";
  const t = preview?.terms;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-card)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <FileSignature className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-display text-[16px] font-800 leading-tight text-[var(--color-foreground)]">
                    Collaboration Agreement
                  </p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Version {AGREEMENT_VERSION} · review &amp; sign to continue
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body (scroll) */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
                </div>
              )}

              {loadError && !loading && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-[12px] text-red-500">
                  {loadError}
                </p>
              )}

              {t && preview && (
                <>
                  {/* Parties */}
                  <div className="mb-4 grid grid-cols-2 gap-2.5">
                    <PartyTile label="Creator" value={preview.parties.creator_display_name} />
                    <PartyTile label="Brand" value={preview.parties.brand_company_name} />
                  </div>

                  {/* Terms grid */}
                  <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Terms
                  </p>
                  <div className="mb-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
                    <TermRow label="Product / campaign" value={t.product_name} />
                    <TermRow label="Package" value={`${t.tier_label} · ${t.final_images} final image${t.final_images !== 1 ? "s" : ""}`} />
                    <TermRow label="Generation credits" value={`${t.generation_credits}`} />
                    <TermRow label="Usage scope" value={t.usage_label} sub={t.usage_description} />
                    <TermRow label="Licence term" value={t.term_label} />
                    <TermRow label="Creator's share" value={fmt(t.creator_share_paise)} />
                    <TermRow label={`Platform fee (${t.platform_commission_pct}%, incl. GST)`} value={fmt(t.platform_share_paise)} />
                    <TermRow label="Total" value={fmt(t.package_price_paise)} strong last />
                  </div>

                  {/* What you're agreeing to */}
                  <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    <ScrollText className="h-3 w-3" />
                    What you&apos;re agreeing to
                  </p>
                  <ul className="mb-2 space-y-2.5">
                    {CLAUSE_SUMMARY.map((c) => (
                      <li key={c.title} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                        <span className="text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                          <span className="font-700 text-[var(--color-foreground)]">{c.title}.</span> {c.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    The full, signed PDF — with both signatures, a verification QR, and a tamper-evident
                    fingerprint — is available from the collab page once the agreement is active.
                  </p>
                </>
              )}
            </div>

            {/* Footer — signature + CTA */}
            {t && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-5 py-4">
                <label className="mb-1.5 block font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Type your full name to sign
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full legal name"
                  maxLength={120}
                  className="mb-3 w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-[14px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30"
                />

                <label className="mb-3 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                    I have read and agree to be bound by this Collaboration Agreement, and I am signing it
                    electronically. My name, the time, and my network address will be recorded.
                  </span>
                </label>

                {submitError && (
                  <p className="mb-2.5 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-[12px] text-red-500">
                    {submitError}
                  </p>
                )}

                <button
                  onClick={() => canSubmit && onSigned(name.trim().replace(/\s+/g, " "))}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      {ctaLabel}
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PartyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5">
      <p className="font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-700 text-[var(--color-foreground)]">{value}</p>
    </div>
  );
}

function TermRow({
  label,
  value,
  sub,
  strong,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
        last ? "" : "border-b border-[var(--color-border)]"
      } ${strong ? "bg-[var(--color-primary)]/5" : ""}`}
    >
      <div className="min-w-0">
        <span className="text-[12px] text-[var(--color-muted-foreground)]">{label}</span>
        {sub && <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]/80">{sub}</p>}
      </div>
      <span
        className={`shrink-0 text-right text-[13px] ${
          strong ? "font-800 text-[var(--color-foreground)]" : "font-700 text-[var(--color-foreground)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
