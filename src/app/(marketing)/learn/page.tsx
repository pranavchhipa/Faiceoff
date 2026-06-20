import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Learn — AI Face Licensing, Explained | Faiceoff",
  description:
    "Guides on AI face licensing, AI vs traditional photoshoots, and the legality of AI influencer marketing in India. Everything brands and creators need to know.",
  alternates: { canonical: `${APP_URL}/learn` },
};

const ARTICLES = [
  {
    href: "/learn/what-is-ai-face-licensing",
    tag: "Guide",
    title: "What is AI face licensing?",
    blurb:
      "The new model where creators license their real face for consented AI content — and brands skip the photoshoot entirely.",
  },
  {
    href: "/learn/ai-photoshoot-vs-traditional",
    tag: "Comparison",
    title: "AI photoshoot vs traditional photoshoot",
    blurb:
      "Cost, time, and flexibility compared. Why a ₹6,000 AI campaign ships in 48 hours where a studio shoot takes weeks.",
  },
  {
    href: "/learn/is-ai-influencer-legal-india",
    tag: "Legal",
    title: "Is AI influencer marketing legal in India?",
    blurb:
      "Consent, the DPDP Act, and likeness rights — how licensed AI content stays on the right side of Indian law.",
  },
];

export default function LearnHub() {
  return (
    <div
      className="min-h-screen text-[#f5ebd6]"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <header className="mx-auto flex max-w-[900px] items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="Faiceoff home">
          <Logo variant="full" tone="light" className="h-14 w-auto sm:h-16" />
        </Link>
        <Link
          href="/creators"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-4 font-mono text-[11px] font-700 uppercase tracking-wider text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white"
        >
          Browse creators <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <section className="mx-auto max-w-[900px] px-4 pt-12 pb-8 sm:px-6 lg:pt-16">
        <div className="font-mono text-[11px] font-700 uppercase tracking-[0.24em] text-[#a89570]">
          Learn
        </div>
        <h1
          className="mt-3 font-800 leading-[1.0] tracking-[-0.02em]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(34px, 6vw, 64px)" }}
        >
          AI face licensing,<br /><span className="text-[#e8825d]">explained.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[#a89570]">
          A new category needs clear answers. These guides cover how AI face licensing works,
          how it compares to a traditional shoot, and how it stays legal under India&apos;s DPDP Act.
        </p>
      </section>

      <section className="mx-auto max-w-[900px] px-4 pb-24 sm:px-6">
        <div className="divide-y divide-[#2a2520] border-y border-[#2a2520]">
          {ARTICLES.map((a) => (
            <Link key={a.href} href={a.href} className="group flex items-start gap-5 py-7 transition">
              <div className="flex-1">
                <span className="font-mono text-[10px] font-700 uppercase tracking-[0.2em] text-[#e8825d]">
                  {a.tag}
                </span>
                <h2
                  className="mt-1.5 font-800 tracking-tight text-[#f5ebd6] transition group-hover:text-[#e8825d]"
                  style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(20px, 3vw, 28px)" }}
                >
                  {a.title}
                </h2>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[#a89570]">{a.blurb}</p>
              </div>
              <ArrowUpRight className="mt-2 h-5 w-5 shrink-0 text-[#6e6457] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#f5ebd6]" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
