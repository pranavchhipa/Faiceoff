import type { Metadata } from "next";
import Link from "next/link";
import { ArticleShell } from "@/components/marketing/article-shell";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

export const revalidate = 86400;

const TITLE = "Is AI Influencer Marketing Legal in India? DPDP & Likeness Rights | Faiceoff";
const DESC =
  "Is AI influencer / AI-generated content legal in India? How consent, the DPDP Act 2023, and likeness rights apply — and how licensed AI content stays compliant.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${APP_URL}/learn/is-ai-influencer-legal-india` },
  openGraph: { title: TITLE, description: DESC, url: `${APP_URL}/learn/is-ai-influencer-legal-india`, type: "article" },
};

const FAQ = [
  { q: "Is it legal to use someone's face in AI content in India?", a: "Only with their consent. Using a person's likeness without permission can violate personality/publicity rights and, where personal data is processed, the DPDP Act 2023. Licensed AI content — where the person consents, approves, and is paid — is designed to be compliant." },
  { q: "Does the DPDP Act apply to a face?", a: "A person's image is personal data. Processing it (including for AI generation) generally requires informed, specific consent — which is exactly what a likeness license records." },
  { q: "Do AI-generated brand images need disclosure?", a: "Following ASCI guidance, AI-generated or digitally-altered promotional content should be disclosed to consumers. Licensed images carry a verifiable certificate to support transparency." },
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
        eyebrow="Legal · 6 min read"
        title="Is AI influencer marketing legal in India?"
        subtitle="Short answer: yes — if it's consented and licensed. Here's how consent, the DPDP Act, and likeness rights actually apply."
        cta={{ href: "/for-brands", label: "See the compliant way to brief" }}
      >
        <p className="lead">
          AI-generated brand content featuring a real person is legal in India <strong>when that
          person consents</strong>. The risk isn&apos;t the AI — it&apos;s using someone&apos;s
          face without permission. Licensed AI content is built around consent, approval, and a
          paper trail, which is what keeps it on the right side of the law.
        </p>
        <p>
          <em>This is general information, not legal advice — consult a lawyer for your specific
          case.</em>
        </p>

        <h2>1. Likeness / personality rights</h2>
        <p>
          Indian courts have recognised that individuals have rights over the commercial use of
          their name, image, and likeness (personality and publicity rights). Using a
          person&apos;s face in advertising without authorisation can expose a brand to claims.
          A <strong>likeness license</strong> — where the creator explicitly authorises the use,
          scope, and duration — addresses this directly.
        </p>

        <h2>2. The DPDP Act, 2023</h2>
        <p>
          A person&apos;s photograph is <strong>personal data</strong>. The Digital Personal Data
          Protection Act, 2023 generally requires <strong>free, informed, specific consent</strong>
          before processing personal data — which includes generating AI imagery from someone&apos;s
          reference photos. On a licensed platform, that consent is captured up front, the creator
          can withdraw or block categories, and the purpose is clearly scoped.
        </p>

        <h2>3. Advertising disclosure (ASCI)</h2>
        <p>
          The Advertising Standards Council of India expects promotional content that is
          AI-generated or digitally altered in a material way to be disclosed to consumers.
          Licensed images carry a <Link href="/verify">verifiable certificate</Link>, which makes
          honest disclosure straightforward.
        </p>

        <h2>How licensed AI content stays compliant</h2>
        <ul>
          <li><strong>Explicit consent</strong> — the creator opts in and licenses their likeness with a recorded scope.</li>
          <li><strong>Creator approval</strong> — nothing is published until the creator approves the specific image.</li>
          <li><strong>Category blocks</strong> — creators refuse categories they don&apos;t want to appear in; the platform enforces it.</li>
          <li><strong>Traceability</strong> — each approved image has a license certificate you can verify.</li>
          <li><strong>Data rights</strong> — creators can withdraw and request deletion, consistent with DPDP principles.</li>
        </ul>

        <h2>What to avoid</h2>
        <p>
          Scraping a celebrity&apos;s photos and generating ads, using a creator&apos;s face after
          they&apos;ve declined a category, or passing AI content off as a real endorsement without
          disclosure — these are where brands get into trouble. The licensed route exists precisely
          to avoid them.
        </p>

        <h2>FAQ</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <p>
          Next: <Link href="/learn/what-is-ai-face-licensing">what AI face licensing is</Link> and
          how the <Link href="/learn/ai-photoshoot-vs-traditional">cost compares to a traditional shoot</Link>.
        </p>
      </ArticleShell>
    </>
  );
}
