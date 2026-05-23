import type { Metadata } from "next";
import Link from "next/link";
import { ArticleShell } from "@/components/marketing/article-shell";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 86400;

const TITLE = "What is AI Face Licensing? A 2026 Guide | Faiceoff";
const DESC =
  "AI face licensing lets creators license their real, verified face for consented AI content — so brands generate campaign images without a photoshoot. Here's how it works.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${APP_URL}/learn/what-is-ai-face-licensing` },
  openGraph: { title: TITLE, description: DESC, url: `${APP_URL}/learn/what-is-ai-face-licensing`, type: "article" },
};

const FAQ = [
  { q: "Is AI face licensing the same as deepfakes?", a: "No. A deepfake uses someone's face without consent. AI face licensing is the opposite — the creator explicitly licenses their likeness, approves every image, and is paid for it. Every output carries a traceable license." },
  { q: "Do creators get paid?", a: "Yes. Creators set their own package price, approve each generated image, and earn in INR with an escrow-backed payout after a short holding period." },
  { q: "Can a brand make a creator say or do anything?", a: "No. Creators block categories they won't appear in, approve every final image before it's licensed, and the platform runs compliance + safety checks on each generation." },
];

export default function Page() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "What is AI Face Licensing?",
    description: DESC,
    author: { "@type": "Organization", name: "Faiceoff" },
    publisher: { "@type": "Organization", name: "Faiceoff" },
    mainEntityOfPage: `${APP_URL}/learn/what-is-ai-face-licensing`,
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <ArticleShell
        eyebrow="Guide · 5 min read"
        title="What is AI face licensing?"
        subtitle="A new category sits between influencer marketing and AI image generation. Here's the plain-English version."
      >
        <p className="lead">
          <strong>AI face licensing</strong> is a model where a creator licenses their real,
          verified face so a brand can generate AI content featuring that likeness — with full
          consent, creator approval on every image, and a traceable license. No photoshoot, no
          studio, no location scout. Just a brief, a few hours, and campaign-ready images.
        </p>

        <h2>The problem it solves</h2>
        <p>
          Brands need a constant stream of on-model content — for every product, season, and
          channel. The old way means booking a model, a photographer, a studio, and waiting
          weeks. Influencer marketing is faster but inconsistent and hard to license. AI image
          generators can make faces, but those faces aren&apos;t real people, can&apos;t be
          licensed cleanly, and raise obvious trust + legal issues.
        </p>
        <p>
          AI face licensing fixes the gap: <strong>real, verified humans</strong> who have
          opted in, set their price, and approve the output. The brand gets authentic faces with
          a clean license; the creator earns from their likeness on repeat without shooting
          anything new.
        </p>

        <h2>How it works on Faiceoff</h2>
        <ul>
          <li><strong>Creators verify + license.</strong> A creator connects Instagram, completes KYC, uploads reference photos, blocks any categories they won&apos;t appear in, and sets package pricing.</li>
          <li><strong>Brands brief.</strong> A brand picks a creator, uploads their product, and writes a short brief. Payment is held in escrow only after the creator accepts.</li>
          <li><strong>AI generates.</strong> The platform generates images using the creator&apos;s licensed likeness + the brand&apos;s product, with compliance and safety checks on every output.</li>
          <li><strong>Creator approves.</strong> Nothing ships until the creator approves the final image. On approval, a license certificate is issued and the creator is paid.</li>
        </ul>

        <h2>Why it&apos;s not a deepfake</h2>
        <p>
          The difference is <strong>consent + control</strong>. A deepfake uses a face without
          permission. Here, the creator licenses their likeness on their terms, approves every
          image, blocks categories they reject, and earns from each use. Every licensed image is
          traceable to a certificate you can verify.
        </p>

        <h2>Who it&apos;s for</h2>
        <p>
          <strong>Brands</strong> — D2C, fashion, beauty, tech, and more — who need fast,
          affordable, on-brand content with real faces. And <strong>creators</strong> who want to
          monetise their likeness without producing new content every week. Browse{" "}
          <Link href="/creators">verified creators</Link> or read how the{" "}
          <Link href="/learn/ai-photoshoot-vs-traditional">cost compares to a traditional shoot</Link>.
        </p>

        <h2>FAQ</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </ArticleShell>
    </>
  );
}
