import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image src="/images/logo-dark.png" alt="Faiceoff" width={160} height={53} priority className="h-9 w-auto" />
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
