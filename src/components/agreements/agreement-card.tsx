"use client";

/**
 * AgreementCard — surfaces the Collaboration Agreement on the collab detail
 * pages (brand + creator). Reads the `agreement` object returned by
 * /api/collabs/[id]. Shows status, both signatures, a PDF download, and a
 * public verify link. Renders nothing for legacy collabs without an agreement.
 */

import {
  FileSignature,
  Download,
  ShieldCheck,
  Clock,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { CollabAgreement } from "@/lib/agreements/types";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AgreementCard({ agreement }: { agreement: CollabAgreement | null }) {
  if (!agreement) return null;

  const isActive = agreement.status === "active";
  const isCancelled = agreement.status === "cancelled";

  const statusMeta = isActive
    ? { label: "Active · signed by both", cls: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20", Icon: CheckCircle2 }
    : isCancelled
      ? { label: "Cancelled", cls: "bg-red-500/10 text-red-400 ring-red-500/20", Icon: Clock }
      : { label: "Awaiting brand signature", cls: "bg-amber-500/10 text-amber-500 ring-amber-500/20", Icon: Clock };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <FileSignature className="h-4 w-4" />
          </div>
          <div>
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              Collaboration Agreement
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Master agreement · version {agreement.agreement_version}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-700 uppercase tracking-[0.08em] ring-1 ${statusMeta.cls}`}>
          <statusMeta.Icon className="h-3 w-3" />
          {statusMeta.label}
        </span>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <SignTile
          label="Creator"
          name={agreement.creator_signed_name}
          date={agreement.creator_signed_at}
        />
        <SignTile
          label="Brand"
          name={agreement.brand_signed_name}
          date={agreement.brand_signed_at}
        />
      </div>

      {/* Actions */}
      {isActive && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={`/api/agreements/${agreement.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-700 text-[var(--color-primary-foreground)] transition hover:-translate-y-0.5"
          >
            <Download className="h-3 w-3" />
            Download PDF
          </a>
          <a
            href={`/verify/agreement/${agreement.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[11px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
          >
            <ExternalLink className="h-3 w-3" />
            Verify
          </a>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Tamper-evident · QR-verifiable
          </span>
        </div>
      )}

      {!isActive && !isCancelled && (
        <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">
          The signed PDF unlocks once the brand signs and pays.
        </p>
      )}
    </div>
  );
}

function SignTile({
  label,
  name,
  date,
}: {
  label: string;
  name: string | null;
  date: string | null;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5">
      <p className="font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        Signed — {label}
      </p>
      {name ? (
        <>
          <p className="mt-1 truncate text-[13px] font-700 text-[var(--color-foreground)]">{name}</p>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">{fmtDate(date)}</p>
        </>
      ) : (
        <p className="mt-1 text-[12px] font-600 text-amber-500">Awaiting signature</p>
      )}
    </div>
  );
}
