import type { ReactNode } from "react";
import Link from "next/link";
import { COMPANY } from "@/lib/constants/company";

/**
 * Shared shell for legal documents (Terms, Privacy, Creator Agreement, Refund).
 * Renders a readable, scannable document with a sticky-ish header and the
 * operating-entity footer block.
 */

export function LegalDoc({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
        Legal
      </p>
      <h1 className="mt-2 font-display text-[30px] font-800 leading-tight tracking-tight text-[var(--color-foreground)] sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-2 text-[13px] text-[var(--color-muted-foreground)]">
        Last updated: {updated} · Operated by {COMPANY.legalName}
      </p>
      {intro && (
        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
          {intro}
        </div>
      )}

      <div className="mt-8 space-y-7">{children}</div>

      {/* Cross-links */}
      <div className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-6 text-[13px]">
        {[
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
          { href: "/creator-agreement", label: "Creator Agreement" },
          { href: "/refund", label: "Refund" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[var(--color-muted-foreground)] underline-offset-2 hover:text-[var(--color-foreground)] hover:underline"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Entity block */}
      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        <p className="font-700 text-[var(--color-foreground)]">{COMPANY.legalName}</p>
        <p className="mt-1">{COMPANY.address.inline}</p>
        <p className="mt-1">
          <a className="hover:text-[var(--color-foreground)]" href={COMPANY.phone.tel}>
            {COMPANY.phone.display}
          </a>{" "}
          ·{" "}
          <a className="hover:text-[var(--color-foreground)]" href={`mailto:${COMPANY.emails.legal}`}>
            {COMPANY.emails.legal}
          </a>
        </p>
      </div>
    </div>
  );
}

export function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
        <span className="mr-2 text-[var(--color-primary)]">{n}.</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-1 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--color-primary)]" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
