import { LegalDoc, Section, LegalList } from "@/components/legal/legal-doc";
import { COMPANY } from "@/lib/constants/company";

export const metadata = {
  title: "Creator Agreement — Faiceoff",
  description:
    "The Creator Likeness Licensing Agreement — consent, control, usage scope, and payouts.",
};

export default function CreatorAgreementPage() {
  return (
    <LegalDoc
      title="Creator Agreement"
      updated="30 May 2026 (v1.0)"
      intro={
        <>
          This Creator Likeness Licensing Agreement supplements our{" "}
          <a className="text-[var(--color-foreground)] underline" href="/terms">
            Terms &amp; Conditions
          </a>{" "}
          and governs how your facial likeness is licensed through Faiceoff. By
          completing creator onboarding you accept this Agreement.
        </>
      }
    >
      <Section n={1} title="Your grant of licence">
        <p>
          You grant Faiceoff a non-exclusive, revocable licence to process your
          uploaded reference photos to generate AI imagery <em>only</em> for
          collaborations you approve. Faiceoff sub-licenses each approved image to the
          relevant brand for the scope and term shown at purchase — nothing more.
        </p>
      </Section>

      <Section n={2} title="You stay in control">
        <LegalList
          items={[
            "Every image requires your explicit approval before it is delivered to a brand.",
            "You set your prices and choose the packages brands can book.",
            "You select content categories you will never appear in — these are enforced on every generation.",
            "You can pause your profile or withdraw consent at any time. New licences stop immediately; previously approved licences run out their term.",
          ]}
        />
      </Section>

      <Section n={3} title="Your representations">
        <LegalList
          items={[
            "The reference photos are of you and you have the right to upload them.",
            "You are 18+ and the details you provide (including KYC) are true.",
            "You are not impersonating another person or infringing anyone's rights.",
          ]}
        />
      </Section>

      <Section n={4} title="Payment to you">
        <p>
          When a collaboration completes, your share (after the platform commission
          and applicable taxes shown at the time) is released from escrow to your
          Faiceoff balance, and paid by direct transfer to your verified bank account.
          Payouts require completed KYC verification.
        </p>
      </Section>

      <Section n={5} title="Data & consent (DPDP)">
        <p>
          Your reference photos and biometric data are processed under your consent
          and the DPDP Act, 2023, as described in our{" "}
          <a className="text-[var(--color-foreground)] underline" href="/privacy">
            Privacy Policy
          </a>
          . They are stored privately and never shared with brands.
        </p>
      </Section>

      <Section n={6} title="Questions">
        <p>
          Reach us at{" "}
          <a className="text-[var(--color-foreground)] underline" href={`mailto:${COMPANY.emails.legal}`}>
            {COMPANY.emails.legal}
          </a>
          .
        </p>
      </Section>
    </LegalDoc>
  );
}
