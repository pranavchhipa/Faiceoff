// ─────────────────────────────────────────────────────────────────────────────
// /verify/agreement/[id] — Public Collaboration Agreement verification.
//
// Server component, no auth. Zero-PII tamper-evident lookup for the QR code
// embedded in agreement PDFs + the "Verify" link on the collab pages.
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Hash,
  CalendarDays,
  FileSignature,
  BadgeCheck,
  PenLine,
} from "lucide-react";
import type { PublicAgreementStatus } from "@/lib/agreements/types";

type VerifyResult =
  | { found: true; data: PublicAgreementStatus }
  | { found: false };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: PublicAgreementStatus["status"] | "not_found" }) {
  if (status === "active") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
          <ShieldCheck className="size-8 text-emerald-500" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-700 text-emerald-500">
          <CheckCircle2 className="size-4" />
          This agreement is active
        </span>
      </div>
    );
  }
  if (status === "pending_brand") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="size-8 text-amber-500" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-700 text-amber-500">
          <PenLine className="size-4" />
          Awaiting brand signature
        </span>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-red-500/10">
          <ShieldAlert className="size-8 text-red-500" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-4 py-1.5 text-sm font-700 text-red-500">
          <XCircle className="size-4" />
          This agreement was cancelled
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-secondary)]">
        <ShieldAlert className="size-8 text-[var(--color-muted-foreground)]" />
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-secondary)] px-4 py-1.5 text-sm font-700 text-[var(--color-muted-foreground)]">
        <XCircle className="size-4" />
        Agreement not found
      </span>
    </div>
  );
}

async function fetchAgreementStatus(id: string): Promise<VerifyResult> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${baseUrl}/api/verify/agreement/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { found: false };
    const data = (await res.json()) as PublicAgreementStatus;
    return { found: true, data };
  } catch {
    return { found: false };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `Agreement ${id.slice(0, 8).toUpperCase()} — Faiceoff`,
    description: "Verify a Faiceoff Collaboration Agreement.",
    robots: "noindex",
  };
}

export default async function VerifyAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchAgreementStatus(id);
  const found = result.found ? result.data : null;
  const status = found ? found.status : "not_found";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl">
        {/* Logo */}
        <div className="flex items-center justify-center border-b border-[var(--color-border)] pb-4 pt-8">
          <Link href="/" className="no-underline">
            <Image
              src="/images/logo-light.png"
              alt="Faiceoff"
              width={120}
              height={40}
              className="h-7 w-auto"
            />
          </Link>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            <FileSignature className="size-3 text-[var(--color-primary)]" />
            Collaboration Agreement
          </div>

          <StatusBadge status={status} />

          {found && (
            <>
              {/* Parties */}
              <div className="w-full divide-y divide-[var(--color-border)] rounded-xl bg-[var(--color-secondary)]/40">
                <Row label="Brand" value={found.brand_company_name} />
                <Row label="Creator" value={found.creator_display_name} />
                <Row label="Engagement" value={found.product_name} />
                <Row label="Usage scope" value={found.usage_label} />
                <Row label="Licence term" value={found.term_label} />
              </div>

              {/* Signatures */}
              <div className="w-full divide-y divide-[var(--color-border)] rounded-xl bg-[var(--color-secondary)]/40">
                <DateRow
                  label="Creator signed"
                  value={found.creator_signed_at ? formatDate(found.creator_signed_at) : "Not yet"}
                />
                <DateRow
                  label="Brand signed"
                  value={found.brand_signed_at ? formatDate(found.brand_signed_at) : "Not yet"}
                />
                {found.effective_at && (
                  <DateRow label="Effective" value={formatDate(found.effective_at)} />
                )}
              </div>

              {/* Agreement ID */}
              <div className="w-full">
                <p className="mb-1.5 text-[10px] font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
                  Agreement ID · v{found.agreement_version}
                </p>
                <div className="flex items-center gap-2 rounded-xl bg-[var(--color-secondary)]/40 px-4 py-2.5">
                  <Hash className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                  <span className="break-all text-xs tracking-wide text-[var(--color-foreground)]">{id}</span>
                </div>
              </div>
            </>
          )}

          {!found && (
            <p className="max-w-xs text-sm text-[var(--color-muted-foreground)]">
              The agreement ID you scanned or entered does not match any record in our system. If you
              believe this is an error, contact{" "}
              <a href="mailto:support@faiceoff.com" className="text-[var(--color-primary)] hover:underline">
                support
              </a>
              .
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-6 py-5">
          <div className="flex items-center justify-center gap-2">
            <BadgeCheck className="size-3.5 text-[var(--color-primary)]" />
            <p className="text-center text-xs font-600 text-[var(--color-muted-foreground)]">
              Verified by Faiceoff — India&apos;s AI Likeness Licensing Platform
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="mt-6 text-xs text-[var(--color-muted-foreground)] no-underline transition-colors hover:text-[var(--color-foreground)]"
      >
        &larr; Back to Faiceoff
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 text-left">
      <span className="mt-0.5 shrink-0 text-xs font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="text-right text-sm font-600 text-[var(--color-foreground)]">{value}</span>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)]">
        <CalendarDays className="size-3.5" />
        {label}
      </span>
      <span className="text-sm font-600 text-[var(--color-foreground)]">{value}</span>
    </div>
  );
}
