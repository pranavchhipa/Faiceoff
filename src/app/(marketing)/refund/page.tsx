import { COMPANY } from "@/lib/constants/company";

export const metadata = { title: "Refund Policy — Faiceoff" };

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-[32px] font-800 tracking-tight text-[var(--color-foreground)]">Refund Policy</h1>
      <p className="mt-4 text-[var(--color-muted-foreground)]">Last updated: coming soon.</p>
      <p className="mt-6 text-[var(--color-muted-foreground)]">
        Full refund policy will be published here before public launch. For
        questions, contact us at{" "}
        <a className="text-[var(--color-foreground)] underline" href={`mailto:${COMPANY.emails.support}`}>
          {COMPANY.emails.support}
        </a>
        .
      </p>
      <div className="mt-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        <p className="font-700 text-[var(--color-foreground)]">{COMPANY.legalName}</p>
        <p className="mt-1">{COMPANY.address.inline}</p>
        <p className="mt-1">
          <a className="hover:text-[var(--color-foreground)]" href={`mailto:${COMPANY.emails.hello}`}>
            {COMPANY.emails.hello}
          </a>
        </p>
        <p className="mt-2 text-[12px]">Faiceoff is operated by {COMPANY.legalName}.</p>
      </div>
    </div>
  );
}
