import type { Metadata } from "next";
import Link from "next/link";
import { ArticleShell } from "@/components/marketing/article-shell";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 86400;

const TITLE = "AI Photoshoot vs Traditional Photoshoot — Cost & Time (2026) | Faiceoff";
const DESC =
  "AI photoshoot vs a traditional studio shoot: real cost, turnaround, and flexibility compared. Why brands ship licensed campaign images in 48 hours for a fraction of the cost.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${APP_URL}/learn/ai-photoshoot-vs-traditional` },
  openGraph: { title: TITLE, description: DESC, url: `${APP_URL}/learn/ai-photoshoot-vs-traditional`, type: "article" },
};

const FAQ = [
  { q: "Is an AI photoshoot cheaper than a traditional one?", a: "Significantly. A traditional product shoot with a model, photographer, studio, and editing runs from ₹40,000 to several lakhs per day. A licensed AI campaign on Faiceoff starts in the low thousands and you pay only on approval." },
  { q: "How long does an AI photoshoot take?", a: "Most campaigns ship within 48 hours of the creator accepting the brief — versus 1–3 weeks for booking, shooting, and editing a traditional shoot." },
  { q: "Do I still own / can I use the images commercially?", a: "Yes. Every approved image comes with a license certificate covering your agreed usage scope and duration." },
];

export default function Page() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <ArticleShell
        eyebrow="Comparison · 4 min read"
        title="AI photoshoot vs traditional photoshoot"
        subtitle="Same goal — campaign-ready images with a real face. Wildly different cost, speed, and flexibility."
        cta={{ href: "/creators", label: "Skip the shoot — browse creators" }}
      >
        <p className="lead">
          A traditional product shoot is a logistics project: book a model, a photographer, a
          studio, hair + makeup, then wait on edits. An <strong>AI photoshoot</strong> with a
          licensed creator collapses all of that into a brief and an approval.
        </p>

        <h2>Side by side</h2>
        <ul>
          <li><strong>Cost</strong> — Traditional: ₹40,000–₹3,00,000+ per shoot day. AI licensed: from the low thousands, pay only on approval.</li>
          <li><strong>Turnaround</strong> — Traditional: 1–3 weeks (booking → shoot → edit). AI: ~48 hours from brief acceptance.</li>
          <li><strong>Re-shoots</strong> — Traditional: re-book everyone, pay again. AI: regenerate or brief a new look without a new shoot.</li>
          <li><strong>Seasonality</strong> — Traditional: a shoot per season/campaign. AI: any outfit, season, or setting on demand from the same licensed face.</li>
          <li><strong>Licensing</strong> — Traditional: negotiate model usage rights separately. AI: a license certificate is issued on every approved image.</li>
          <li><strong>Authenticity</strong> — Both use real, verified faces — the AI route just removes the production overhead.</li>
        </ul>

        <h2>When a traditional shoot still wins</h2>
        <p>
          AI face licensing isn&apos;t for everything. If you need a specific physical
          interaction with a product that&apos;s hard to describe, an elaborate set, or a
          motion/video-heavy production, a traditional shoot may still be the right call. For the
          steady stream of <strong>on-model stills</strong> most brands burn through — product
          pages, ads, social — AI licensing wins on cost and speed by a wide margin.
        </p>

        <h2>The math for a D2C brand</h2>
        <p>
          Say you launch 8 products a quarter and want 5 on-model images each. That&apos;s 40
          images. Traditional: multiple shoot days, easily ₹2–5 lakh + weeks of coordination. AI
          licensed: brief a few <Link href="/creators">verified creators</Link>, ship in days, a
          fraction of the cost, and you only pay for images the creator approves.
        </p>

        <h2>FAQ</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <p>
          New to the model? Start with{" "}
          <Link href="/learn/what-is-ai-face-licensing">what AI face licensing is</Link>, or check
          whether it&apos;s{" "}
          <Link href="/learn/is-ai-influencer-legal-india">legal in India</Link>.
        </p>
      </ArticleShell>
    </>
  );
}
