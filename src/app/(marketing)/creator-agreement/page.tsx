import { COMPANY } from "@/lib/constants/company";

export const metadata = { title: "Creator Agreement — Faiceoff" };

export default function CreatorAgreementPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-[32px] font-800 tracking-tight text-[var(--color-foreground)]">Creator Agreement</h1>
      <p className="mt-4 text-[var(--color-muted-foreground)]">Last updated: coming soon.</p>
      <p className="mt-6 text-[var(--color-muted-foreground)]">
        The full Creator Likeness Licensing Agreement — governing consent, usage
        scope, payout terms, and DPDP compliance — will be published here before
        public launch. Contact{" "}
        <a className="text-[var(--color-foreground)] underline" href={`mailto:${COMPANY.emails.legal}`}>
          {COMPANY.emails.legal}
        </a>{" "}
        with any questions.
      </p>
      <div className="mt-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        <p className="font-700 text-[var(--color-foreground)]">{COMPANY.legalName}</p>
        <p className="mt-1">{COMPANY.address.inline}</p>
        <p className="mt-1">
          <a className="hover:text-[var(--color-foreground)]" href={COMPANY.phone.tel}>
            {COMPANY.phone.display}
          </a>{" "}·{" "}
          <a className="hover:text-[var(--color-foreground)]" href={`mailto:${COMPANY.emails.hello}`}>
            {COMPANY.emails.hello}
          </a>
        </p>
        <p className="mt-2 text-[12px]">Faiceoff is operated by {COMPANY.legalName}.</p>
      </div>
    </div>
  );
}
