"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /verify — public verification landing page.
//
// The footer's "Verify Licence" link points here. Both licence certs and
// Collaboration Agreement PDFs embed a QR code that deep-links straight to
// /verify/<id> or /verify/agreement/<id> — this page exists for the case
// someone lands here without an id (footer click, or typing a code they read
// off a printed document) and needs to paste/enter it manually.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCheck2, FileSignature, ShieldCheck, ArrowRight } from "lucide-react";

function VerifyCard({
  icon: Icon,
  title,
  description,
  placeholder,
  buildHref,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  placeholder: string;
  buildHref: (id: string) => string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = value.trim();
    if (!id) {
      setError("Enter an ID first.");
      return;
    }
    setError(null);
    router.push(buildHref(id));
  }

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-[16px] font-800 text-[var(--color-foreground)]">{title}</h2>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {description}
      </p>
      <form onSubmit={handleSubmit} className="mt-auto space-y-2">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-[14px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          autoComplete="off"
          spellCheck={false}
        />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] text-[14px] font-700 text-[var(--color-primary-foreground)] transition active:scale-[0.98]"
        >
          Verify <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

export default function VerifyLandingPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-2xl flex-col items-center px-4 py-14 sm:py-20">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <h1 className="text-center font-display text-[28px] font-800 leading-tight tracking-tight text-[var(--color-foreground)] sm:text-[34px]">
        Verify a Faiceoff document
      </h1>
      <p className="mt-2.5 max-w-md text-center text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
        Paste the ID printed on a Licence Certificate or Collaboration Agreement, or scan the QR
        code on the document itself to jump straight here.
      </p>

      <div className="mt-9 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <VerifyCard
          icon={FileCheck2}
          title="Licence Certificate"
          description="Verify a single-image likeness licence issued when a creator approves a generation."
          placeholder="Licence ID"
          buildHref={(id) => `/verify/${encodeURIComponent(id)}`}
        />
        <VerifyCard
          icon={FileSignature}
          title="Collaboration Agreement"
          description="Verify the master agreement signed by a brand and creator for a collaboration."
          placeholder="Agreement ID"
          buildHref={(id) => `/verify/agreement/${encodeURIComponent(id)}`}
        />
      </div>

      <p className="mt-8 text-center text-[12px] text-[var(--color-muted-foreground)]">
        Questions about a document?{" "}
        <Link href="/contact" className="font-600 text-[var(--color-primary)] hover:underline">
          Contact us
        </Link>
      </p>
    </div>
  );
}
