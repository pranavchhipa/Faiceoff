// ─────────────────────────────────────────────────────────────────────────────
// /verify/[license_id] — Public license verification (E36)
//
// Server component. No auth required — public endpoint.
// Renders a zero-PII certificate-style page for QR code / link verification.
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
  Monitor,
  Printer,
  Package,
  BadgeCheck,
} from "lucide-react";
import type { PublicLicenseStatus, LicenseScope } from "@/lib/licenses/types";

/* ── Types ── */

type VerifyResult =
  | { found: true; data: PublicLicenseStatus }
  | { found: false };

/* ── Helpers ── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function scopeChips(scope: LicenseScope): React.ReactNode {
  const scopeMap: Record<LicenseScope, { label: string; icon: React.ReactNode }[]> = {
    digital: [{ label: "Digital", icon: <Monitor className="size-3" /> }],
    digital_print: [
      { label: "Digital", icon: <Monitor className="size-3" /> },
      { label: "Print", icon: <Printer className="size-3" /> },
    ],
    digital_print_packaging: [
      { label: "Digital", icon: <Monitor className="size-3" /> },
      { label: "Print", icon: <Printer className="size-3" /> },
      { label: "Packaging", icon: <Package className="size-3" /> },
    ],
  };
  const items = scopeMap[scope] ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ label, icon }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-ocean)] text-[var(--color-ink)] text-xs font-600"
        >
          {icon}
          {label}
        </span>
      ))}
    </div>
  );
}

/* ── Status badge ── */

function StatusBadge({ status }: { status: PublicLicenseStatus["status"] | "not_found" }) {
  if (status === "active") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-mint)]">
          <ShieldCheck className="size-8 text-green-600" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-700">
          <CheckCircle2 className="size-4" />
          This license is active
        </span>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
          <Clock className="size-8 text-[var(--color-outline-variant)]" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--color-surface-container-low)] text-[var(--color-outline)] text-sm font-700">
          <XCircle className="size-4" />
          This license has expired
        </span>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-blush)]">
          <ShieldAlert className="size-8 text-red-500" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-100 text-red-600 text-sm font-700">
          <XCircle className="size-4" />
          This license has been revoked
        </span>
      </div>
    );
  }

  // not_found
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
        <ShieldAlert className="size-8 text-[var(--color-outline-variant)]" />
      </div>
      <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--color-surface-container-low)] text-[var(--color-outline)] text-sm font-700">
        <XCircle className="size-4" />
        License not found
      </span>
    </div>
  );
}

/* ── Data fetch ── */

async function fetchLicenseStatus(licenseId: string): Promise<VerifyResult> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/verify/${encodeURIComponent(licenseId)}`, {
      cache: "no-store",
    });

    if (res.status === 404) {
      return { found: false };
    }

    if (!res.ok) {
      return { found: false };
    }

    const data = (await res.json()) as PublicLicenseStatus;
    return { found: true, data };
  } catch {
    return { found: false };
  }
}

/* ── Page ── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ license_id: string }>;
}) {
  const { license_id } = await params;
  return {
    title: `License ${license_id.slice(0, 8).toUpperCase()} — Faiceoff`,
    description: "Verify AI likeness license authenticity on Faiceoff.",
    robots: "noindex",
  };
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ license_id: string }>;
}) {
  const { license_id } = await params;
  const result = await fetchLicenseStatus(license_id);
  const found = result.found ? result.data : null;
  const status = found ? found.status : "not_found";

  return (
    <div className="min-h-screen bg-[var(--color-surface)] flex flex-col items-center justify-center px-4 py-12">
      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-elevated)] overflow-hidden">
        {/* Top: Logo */}
        <div className="flex items-center justify-center pt-8 pb-4 border-b border-[var(--color-outline-variant)]/10">
          <Link href="/" className="no-underline">
            <Image
              src="/images/logo-dark.png"
              alt="Faiceoff"
              width={120}
              height={40}
              className="h-7 w-auto"
            />
          </Link>
        </div>

        {/* Body */}
        <div className="px-6 py-8 flex flex-col items-center gap-6 text-center">
          {/* Status badge */}
          <StatusBadge status={status} />

          {found && (
            <>
              {/* Parties */}
              <div className="w-full rounded-xl bg-[var(--color-surface-container-low)] divide-y divide-[var(--color-outline-variant)]/10">
                <div className="flex items-start justify-between gap-3 px-4 py-3 text-left">
                  <span className="text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)] shrink-0 mt-0.5">
                    Licensed to
                  </span>
                  <span className="text-sm font-600 text-[var(--color-on-surface)] text-right">
                    {found.brand_company_name}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 px-4 py-3 text-left">
                  <span className="text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)] shrink-0 mt-0.5">
                    Likeness from
                  </span>
                  <span className="text-sm font-600 text-[var(--color-on-surface)] text-right">
                    {found.creator_display_name}
                  </span>
                </div>
              </div>

              {/* Scope */}
              <div className="w-full text-left">
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-2">
                  Permitted use
                </p>
                {scopeChips(found.scope)}
              </div>

              {/* Dates */}
              <div className="w-full rounded-xl bg-[var(--color-surface-container-low)] divide-y divide-[var(--color-outline-variant)]/10">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs font-600 text-[var(--color-outline-variant)]">
                    <CalendarDays className="size-3.5" />
                    Issued
                  </span>
                  <span className="text-sm font-600 text-[var(--color-on-surface)]">
                    {formatDate(found.issued_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs font-600 text-[var(--color-outline-variant)]">
                    <CalendarDays className="size-3.5" />
                    {status === "expired" || status === "revoked" ? "Expired" : "Expires"}
                  </span>
                  <span className="text-sm font-600 text-[var(--color-on-surface)]">
                    {formatDate(found.expires_at)}
                  </span>
                </div>
              </div>

              {/* License ID */}
              <div className="w-full">
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-1.5">
                  License ID
                </p>
                <div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-container-low)] px-4 py-2.5">
                  <Hash className="size-3.5 text-[var(--color-outline-variant)] shrink-0" />
                  <span className="font-mono text-xs text-[var(--color-on-surface)] break-all">
                    {license_id}
                  </span>
                </div>
              </div>
            </>
          )}

          {!found && (
            <p className="text-sm text-[var(--color-outline-variant)] max-w-xs">
              The license ID you scanned or entered does not match any record in our system.
              If you believe this is an error, contact{" "}
              <a
                href="mailto:marketing@rectangled.io"
                className="text-[var(--color-primary)] hover:underline"
              >
                support
              </a>
              .
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[var(--color-outline-variant)]/10 bg-[var(--color-surface-container-low)]">
          <div className="flex items-center gap-2 justify-center mb-3">
            <BadgeCheck className="size-3.5 text-[var(--color-primary)]" />
            <p className="text-xs font-600 text-[var(--color-outline)] text-center">
              Verified by Faiceoff — India&apos;s AI Likeness Licensing Platform
            </p>
          </div>
          <p className="text-xs text-[var(--color-outline-variant)] text-center">
            Verify another license:{" "}
            <Link
              href="/verify"
              className="text-[var(--color-primary)] hover:underline font-500"
            >
              paste ID or scan QR
            </Link>
          </p>
        </div>
      </div>

      {/* Back to home */}
      <Link
        href="/"
        className="mt-6 text-xs text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)] transition-colors no-underline"
      >
        &larr; Back to Faiceoff
      </Link>
    </div>
  );
}
