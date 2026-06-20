import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 86400;

const TITLE = "Earn by Licensing Your Face for AI — Creator Income | Faiceoff";
const DESC =
  "Turn your face into income. License your likeness for consented AI brand content, approve every image, and earn in INR — without shooting new content. Join Faiceoff.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${APP_URL}/earn` },
  openGraph: { title: TITLE, description: DESC, url: `${APP_URL}/earn`, type: "website" },
};

const FAQ = [
  { q: "How do creators earn on Faiceoff?", a: "You set a package price. When a brand briefs you and you approve the generated images, you earn — paid in INR via an escrow-backed payout after a short holding period. Each approval is income from your existing likeness." },
  { q: "Do I have to keep making content?", a: "No. That's the point. You license your face once; brands generate new campaigns from it. You approve each image — no new shoots required." },
  { q: "Do I control how my face is used?", a: "Completely. You block any categories you won't appear in, you approve every single image before it's licensed, and you can withdraw consent." },
  { q: "What do I need to start?", a: "An Instagram (Business/Creator) account, basic KYC, and a few reference photos. Setup takes minutes." },
];

export default function EarnPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div
      className="min-h-screen text-[#f5ebd6]"
      style={{
        background: "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <header className="mx-auto flex max-w-[1000px] items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="Faiceoff home">
          <Logo variant="full" tone="light" className="h-20 w-auto sm:h-24" />
        </Link>
        <Link
          href="/signup?role=creator"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-5 text-[13px] font-700 text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white"
          style={{ fontFamily: "Outfit, system-ui" }}
        >
          Start earning <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1000px] px-4 pt-14 pb-10 sm:px-6 lg:pt-20">
        <div className="font-mono text-[11px] font-700 uppercase tracking-[0.24em] text-[#a89570]">
          For Creators
        </div>
        <h1
          className="mt-4 max-w-3xl font-800 leading-[0.96] tracking-[-0.02em]"
          style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(36px, 6.5vw, 76px)" }}
        >
          Your face works<br /><span className="text-[#e8825d]">while you sleep.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[#a89570]">
          License your likeness for consented AI content. Brands generate campaigns with your
          verified face, you approve every image, and you earn in INR — without shooting anything
          new. Set your price, block what you don&apos;t want, get paid on approval.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signup?role=creator"
            className="inline-flex h-13 items-center gap-2 rounded-full bg-[#e8825d] px-7 py-3.5 text-[15px] font-800 text-white transition hover:bg-[#e96d3f]"
            style={{ fontFamily: "Outfit, system-ui" }}
          >
            Create your profile <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link href="/creators" className="font-mono text-[12px] font-700 uppercase tracking-wider text-[#a89570] hover:text-[#f5ebd6]">
            See live creator profiles →
          </Link>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-[1000px] px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { t: "Earn on repeat", d: "License once. Every brand campaign from your likeness is income — no new shoots." },
            { t: "Full control", d: "Approve every image. Block any category. Withdraw anytime. Your face, your rules." },
            { t: "Paid in INR", d: "Transparent package pricing, escrow-backed payouts to your bank, GST-ready." },
          ].map((b) => (
            <div key={b.t} className="rounded-sm border border-[#2a2520] bg-[#0d0c0a] p-6">
              <CheckCircle2 className="h-5 w-5 text-[#e8825d]" />
              <div className="mt-3 font-display text-[17px] font-700 text-[#f5ebd6]">{b.t}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-[#a89570]">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section className="border-t border-[#2a2520] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="font-800 tracking-tight" style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(24px, 3.5vw, 38px)" }}>
            How you earn — step by step
          </h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "Verify + set up", d: "Connect Instagram, complete KYC, upload reference photos." },
              { n: "02", t: "Price + protect", d: "Set package pricing. Block categories you won't appear in." },
              { n: "03", t: "Brands brief you", d: "Brands discover your profile and send paid campaign requests." },
              { n: "04", t: "Approve + get paid", d: "Approve the images you like. Earn in INR on every approval." },
            ].map((s) => (
              <div key={s.n} className="rounded-sm border border-[#2a2520] bg-[#0d0c0a] p-5">
                <div className="font-mono text-[12px] font-700 text-[#e8825d]">{s.n}</div>
                <div className="mt-2 font-display text-[15px] font-700 text-[#f5ebd6]">{s.t}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#a89570]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-[760px]">
          <h2 className="font-800 tracking-tight" style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(24px, 3.5vw, 38px)" }}>
            Creator FAQ
          </h2>
          <div className="mt-6 divide-y divide-[#2a2520]">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="font-display text-[16px] font-700 text-[#f5ebd6]">{f.q}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#a89570]">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-4 mb-10 overflow-hidden rounded-sm border border-[#2a2520] sm:mx-auto sm:max-w-[1000px]">
        <div className="relative px-6 py-14 text-center sm:px-12" style={{ background: "linear-gradient(135deg, #1a1612 0%, #2a1f15 50%, #1a1612 100%)" }}>
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, rgba(232,130,93,0.5), transparent 60%)" }} />
          <h2 className="relative font-800 tracking-tight" style={{ fontFamily: "Outfit, system-ui", fontSize: "clamp(26px, 4.5vw, 44px)" }}>
            Turn your face into income.
          </h2>
          <Link
            href="/signup?role=creator"
            className="relative mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#e8825d] px-7 text-[15px] font-800 text-white transition hover:bg-[#e96d3f]"
            style={{ fontFamily: "Outfit, system-ui" }}
          >
            Create your profile <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#2a2520] px-4 py-7 sm:px-6">
        <div className="mx-auto flex max-w-[1000px] flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <Link href="/" className="inline-flex items-center gap-2 opacity-80 hover:opacity-100">
            <Logo variant="mark" className="h-16 w-16" />
            <span className="font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#a89570]">Powered by Faiceoff</span>
          </Link>
          <div className="flex items-center gap-4 font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#6e6457]">
            <Link href="/for-creators" className="hover:text-[#f5ebd6]">For Creators</Link>
            <Link href="/creators" className="hover:text-[#f5ebd6]">Creators</Link>
            <Link href="/learn" className="hover:text-[#f5ebd6]">Learn</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
