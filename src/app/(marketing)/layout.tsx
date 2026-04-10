import Link from "next/link";
import type { ReactNode } from "react";

const navLinks = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "For Creators", href: "/#creators" },
  { label: "For Brands", href: "/#brands" },
  { label: "Pricing", href: "/pricing" },
];

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-neutral-200)] bg-[var(--color-background)]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Logo */}
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl font-700 tracking-tight text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)]"
          >
            faiceoff
          </Link>

          {/* Nav links — hidden on mobile */}
          <ul className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-500 text-[var(--color-neutral-600)] transition-colors hover:text-[var(--color-ink)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Auth actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-500 text-[var(--color-neutral-600)] transition-colors hover:text-[var(--color-ink)]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--radius-button)] bg-[var(--color-ink)] px-4 py-2 text-sm font-600 text-[var(--color-background)] transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-neutral-200)] bg-[var(--color-background)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <p className="font-[family-name:var(--font-display)] text-sm font-500 text-[var(--color-neutral-500)]">
            Faiceoff {new Date().getFullYear()}. Fair face, fair deal.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)]"
            >
              Terms
            </Link>
            <Link
              href="/contact"
              className="text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)]"
            >
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
