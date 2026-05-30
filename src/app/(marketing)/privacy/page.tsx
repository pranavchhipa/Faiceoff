import { LegalDoc, Section, LegalList } from "@/components/legal/legal-doc";
import { COMPANY } from "@/lib/constants/company";

export const metadata = {
  title: "Privacy Policy — Faiceoff",
  description:
    "How Faiceoff collects, uses, and protects your personal and biometric data under India's DPDP Act, 2023.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="30 May 2026 (v1.0)"
      intro={
        <>
          This policy explains how {COMPANY.legalName} (&ldquo;Faiceoff&rdquo;)
          collects, uses, and protects your data, in line with the Digital Personal
          Data Protection Act, 2023 (DPDP). Your face is sensitive data, and we treat
          it that way.
        </>
      }
    >
      <Section n={1} title="What we collect">
        <LegalList
          items={[
            "Account data — name, email, phone, role, password (hashed).",
            "Creator data — reference photos, gender, city, bio, social handles, and (on verification) Aadhaar + PAN documents.",
            "Biometric/likeness data — facial reference images used to generate approved AI imagery.",
            "Payment data — wallet balances, transactions, bank details for payouts (handled with our payment partner).",
            "Usage data — device, log, and analytics data to keep the service secure and working.",
          ]}
        />
      </Section>

      <Section n={2} title="How we use it">
        <LegalList
          items={[
            "To generate AI imagery only for campaigns a creator explicitly approves.",
            "To verify identity (KYC) and process payouts to verified bank accounts.",
            "To run safety and compliance checks on every generation.",
            "To operate, secure, and improve the platform, and to contact you about your account.",
          ]}
        />
        <p>
          We do <strong>not</strong> sell your personal data. We never share KYC
          documents or raw reference photos with brands.
        </p>
      </Section>

      <Section n={3} title="Consent & your rights">
        <p>
          Processing of your likeness is based on your consent, which you give at
          onboarding and can withdraw at any time from your settings. Under the DPDP
          Act you may request access to, correction of, or deletion of your personal
          data, subject to lawful retention (e.g. tax, fraud, and dispute records).
        </p>
      </Section>

      <Section n={4} title="Storage & security">
        <p>
          Reference photos and KYC documents are stored in private, access-controlled
          storage and encrypted. Sensitive tokens are encrypted at rest. Access is
          limited to authorised systems and personnel operating the service.
        </p>
      </Section>

      <Section n={5} title="Retention">
        <p>
          We keep your data while your account is active and for as long as needed to
          meet legal, tax, and dispute-resolution obligations. When you delete your
          account, we remove or anonymise personal data except where retention is
          legally required.
        </p>
      </Section>

      <Section n={6} title="Contact / Grievance">
        <p>
          For privacy requests or to reach our Grievance Officer, write to{" "}
          <a className="text-[var(--color-foreground)] underline" href={`mailto:${COMPANY.emails.legal}`}>
            {COMPANY.emails.legal}
          </a>
          . We respond within the timelines required by the DPDP Act.
        </p>
      </Section>
    </LegalDoc>
  );
}
