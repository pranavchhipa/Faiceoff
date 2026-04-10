import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-2xl font-700 tracking-tight text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)]"
          >
            faiceoff
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-8 shadow-[var(--shadow-card)]">
          {children}
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-[var(--color-neutral-500)]">
          <Link
            href="/"
            className="text-[var(--color-neutral-500)] hover:text-[var(--color-ink)]"
          >
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
