import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";

/**
 * ArticleShell — dark editorial wrapper for SEO content pages (/learn, /earn).
 * Matches the /creators aesthetic so the whole SEO cluster feels like one
 * product. Provides nav + film grain + a primary CTA footer.
 */
export function ArticleShell({
  eyebrow,
  title,
  subtitle,
  children,
  cta = { href: "/creators", label: "Browse verified creators" },
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      className="min-h-screen overflow-x-hidden text-[#f5ebd6] selection:bg-[#e8825d]/30"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* Nav */}
      <header className="mx-auto flex max-w-[900px] items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="Faiceoff home">
          <Logo variant="full" tone="light" className="h-20 w-auto sm:h-24" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] font-700 uppercase tracking-wider text-[#a89570]">
          <Link href="/creators" className="hidden hover:text-[#f5ebd6] sm:inline">Creators</Link>
          <Link href="/learn" className="hidden hover:text-[#f5ebd6] sm:inline">Learn</Link>
          <Link
            href="/signup?role=brand"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-4 text-[12px] text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white"
          >
            Launch <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      {/* Header */}
      <article className="mx-auto max-w-[760px] px-4 pt-12 pb-8 sm:px-6 lg:pt-16">
        <div className="font-mono text-[11px] font-700 uppercase tracking-[0.24em] text-[#a89570]">
          {eyebrow}
        </div>
        <h1
          className="mt-4 font-800 leading-[1.02] tracking-[-0.02em] text-[#f5ebd6]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(32px, 5.5vw, 60px)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-5 text-[17px] leading-relaxed text-[#a89570]">{subtitle}</p>
        )}

        {/* Prose */}
        <div className="article-prose mt-10">{children}</div>
      </article>

      {/* CTA */}
      <section className="mx-4 mb-10 mt-6 overflow-hidden rounded-sm border border-[#2a2520] sm:mx-auto sm:max-w-[760px]">
        <div
          className="relative px-6 py-12 text-center sm:px-12"
          style={{ background: "linear-gradient(135deg, #1a1612 0%, #2a1f15 50%, #1a1612 100%)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(232,130,93,0.5), transparent 60%)" }}
          />
          <h2
            className="relative font-800 tracking-tight text-[#f5ebd6]"
            style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(24px, 4vw, 38px)" }}
          >
            Real verified faces. Licensed for AI.
          </h2>
          <Link
            href={cta.href}
            className="relative mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#e8825d] px-7 text-[15px] font-800 text-white transition hover:bg-[#e96d3f]"
            style={{ fontFamily: "Outfit, system-ui" }}
          >
            {cta.label} <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2a2520] px-4 py-7 sm:px-6">
        <div className="mx-auto flex max-w-[760px] flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <Link href="/" className="inline-flex items-center gap-2 opacity-80 hover:opacity-100">
            <Logo variant="mark" className="h-16 w-16" />
            <span className="font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#a89570]">
              Powered by Faiceoff
            </span>
          </Link>
          <div className="flex items-center gap-4 font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#6e6457]">
            <Link href="/creators" className="hover:text-[#f5ebd6]">Creators</Link>
            <Link href="/for-brands" className="hover:text-[#f5ebd6]">For Brands</Link>
            <Link href="/for-creators" className="hover:text-[#f5ebd6]">For Creators</Link>
            <Link href="/learn" className="hover:text-[#f5ebd6]">Learn</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* Prose styles — applied via the article-prose class (see usage in pages).
   Tailwind utility classes inline on elements would bloat each page; instead
   pages use semantic <h2>/<p>/<ul> and we style via a small scoped block. */
