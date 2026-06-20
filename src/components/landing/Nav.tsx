"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";

/**
 * Marketing nav — light editorial header.
 *
 * - Brand cluster (logo + wordmark) → /
 * - Center links (For Creators / For Brands / Pricing)
 * - Right cluster: Log in (text) + "Start Earning" (creator) / "Start a
 *   Campaign" (brand) — primary CTA flips by current page so the right
 *   action is one click away.
 * - Mobile: hamburger → full overlay sheet.
 * - Subtle blur + hairline appears once the user scrolls past 8px.
 */

const NAV_LINKS = [
  { href: "/for-creators", label: "For Creators" },
  { href: "/for-brands", label: "For Brands" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pick the right "primary" CTA based on which surface they're on.
  const primaryHref = pathname?.startsWith("/for-brands")
    ? "/auth/signup/brand"
    : "/auth/signup/creator";
  const primaryLabel = pathname?.startsWith("/for-brands")
    ? "Start a Campaign"
    : "Start Earning";

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all"
      style={{
        backgroundColor: scrolled ? "rgba(251,247,238,0.86)" : "transparent",
        backdropFilter: scrolled ? "blur(12px) saturate(140%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(12px) saturate(140%)" : "none",
        borderBottom: scrolled ? "1px solid var(--lp-border)" : "1px solid transparent",
      }}
    >
      <div className="lp-container flex h-16 items-center justify-between md:h-[72px]">
        {/* Brand */}
        <Link href="/" aria-label="Faiceoff home" className="flex items-center shrink-0">
          <Logo variant="full" tone="dark" className="h-12 w-auto" />
        </Link>

        {/* Center links — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-4 py-2 rounded-full text-[14px] font-500 transition-colors"
                style={{
                  color: active ? "var(--lp-ink)" : "var(--lp-muted)",
                  backgroundColor: active ? "var(--lp-paper-2)" : "transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster — desktop */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login"
            className="text-[14px] font-500 px-3 py-2 transition-colors"
            style={{ color: "var(--lp-muted)" }}
          >
            Log in
          </Link>
          <Link href={primaryHref} className="lp-btn-primary">
            {primaryLabel}
          </Link>
        </div>

        {/* Hamburger — mobile */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--lp-border)", color: "var(--lp-ink)" }}
          aria-label="Open menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div
          className="md:hidden border-t"
          style={{ background: "var(--lp-paper)", borderColor: "var(--lp-border)" }}
        >
          <div className="lp-container py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-3 py-3 rounded-lg text-[15px] font-500"
                style={{
                  color: pathname === l.href ? "var(--lp-ink)" : "var(--lp-ink-soft)",
                  backgroundColor: pathname === l.href ? "var(--lp-paper-2)" : "transparent",
                }}
              >
                {l.label}
              </Link>
            ))}
            <div className="lp-divider my-2" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="px-3 py-3 rounded-lg text-[15px] font-500"
              style={{ color: "var(--lp-ink-soft)" }}
            >
              Log in
            </Link>
            <Link
              href={primaryHref}
              onClick={() => setOpen(false)}
              className="lp-btn-primary justify-center mt-1"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
