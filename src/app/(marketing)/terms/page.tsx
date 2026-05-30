import { LegalDoc, Section, LegalList } from "@/components/legal/legal-doc";
import { COMPANY } from "@/lib/constants/company";

export const metadata = {
  title: "Terms & Conditions — Faiceoff",
  description:
    "The terms governing use of Faiceoff — India's AI face licensing marketplace. Likeness licensing, consent, payments, and compliance.",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms & Conditions"
      updated="30 May 2026 (v1.0)"
      intro={
        <>
          These Terms govern your use of <strong>Faiceoff</strong>, an AI face
          licensing marketplace operated by {COMPANY.legalName} (&ldquo;Faiceoff&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the
          platform you agree to these Terms. If you do not agree, do not use Faiceoff.
        </>
      }
    >
      <Section n={1} title="What Faiceoff is">
        <p>
          Faiceoff is a two-sided marketplace that connects{" "}
          <strong>creators</strong>, who license their facial likeness, with{" "}
          <strong>brands</strong>, who generate AI imagery using that licensed
          likeness. Every generation is consent-based, creator-approved, and tracked.
          We provide the technology and payment rails; we are not a party to the
          underlying creative relationship beyond what these Terms set out.
        </p>
      </Section>

      <Section n={2} title="Eligibility & accounts">
        <LegalList
          items={[
            "You must be at least 18 years old and legally able to enter a contract in India.",
            "You must provide accurate information and keep your login credentials secure. You are responsible for activity on your account.",
            "Brand accounts must be operated by a person authorised to bind their company.",
            "We may suspend or terminate accounts that violate these Terms, applicable law, or our content rules.",
          ]}
        />
      </Section>

      <Section n={3} title="Creators — likeness licensing & consent">
        <p>
          As a creator, you grant Faiceoff a limited licence to use your uploaded
          reference photos solely to generate AI imagery for campaigns you approve.
          Critically:
        </p>
        <LegalList
          items={[
            "No image is ever delivered to a brand until you explicitly approve it.",
            "You set your own pricing and choose the content categories you will and will not appear in. Blocked categories are enforced on every generation.",
            "Your reference photos and biometric data are processed only to power approved generations, in line with the Digital Personal Data Protection Act, 2023 (DPDP).",
            "You may withdraw consent and deactivate your likeness at any time. Withdrawal does not retroactively revoke licences already issued for images you previously approved.",
            "You confirm the uploaded photos are of you, that you own or control the rights to them, and that you are not impersonating anyone else.",
          ]}
        />
      </Section>

      <Section n={4} title="Brands — permitted use & licence scope">
        <p>
          When a creator approves an image, you receive a licence to use that
          specific image for the scope and duration shown at purchase. You agree:
        </p>
        <LegalList
          items={[
            "To use licensed images only within the granted scope (e.g. organic social, paid ads, or full digital), and only for the licence term.",
            "Not to use a creator's likeness in a way that is defamatory, misleading, unlawful, or outside the categories the creator permitted.",
            "Not to imply a creator's personal endorsement beyond the licensed campaign context, or to suggest a real-world event that did not occur.",
            "Not to remove watermarks, provenance metadata, or attempt to re-identify or train other models on the likeness.",
          ]}
        />
      </Section>

      <Section n={5} title="AI-generated content">
        <p>
          Images produced on Faiceoff are AI-generated using the creator&apos;s
          licensed likeness and the brand&apos;s product/brief. They may carry a
          visible or embedded provenance marker. You acknowledge AI output can
          contain imperfections; Faiceoff does not warrant photographic accuracy.
          Generations are screened by an automated safety and compliance check, but
          brands remain responsible for the lawful use of delivered images.
        </p>
      </Section>

      <Section n={6} title="Payments, escrow & payouts">
        <LegalList
          items={[
            "All amounts are in Indian Rupees (INR). Brands fund a wallet or pay per collaboration via our payment processor.",
            "Funds for a collaboration are held in escrow by Faiceoff and released to the creator after the creator approves the agreed images and the holding period elapses.",
            "Faiceoff charges a platform commission. The exact creator share and any applicable taxes (GST, TDS/TCS) are shown at the time of each transaction.",
            "Creator payouts are made by direct bank transfer after identity verification (KYC). We do not process payouts to UPI handles; verified bank account details are required.",
            "GST-compliant invoices are issued for applicable transactions.",
          ]}
        />
      </Section>

      <Section n={7} title="Verification (the gold tick)">
        <p>
          Creators may apply for manual verification by submitting government ID
          (Aadhaar and PAN) and confirming an active social presence. On approval we
          grant a verified badge and unlock payouts. Verification confirms identity
          for trust and payout compliance; it is not an endorsement of any creator or
          their content. We may revoke verification if information is found to be
          false.
        </p>
      </Section>

      <Section n={8} title="Prohibited content & conduct">
        <p>You may not use Faiceoff to create, request, or distribute content that:</p>
        <LegalList
          items={[
            "Is sexual, exploitative, or involves minors in any way;",
            "Promotes illegal goods/services, violence, hate, or harassment;",
            "Infringes a third party's IP, privacy, or publicity rights;",
            "Impersonates a real person without their consent, or creates deceptive 'deepfake' content about real events; or",
            "Violates any applicable Indian law, including the IT Act and DPDP Act.",
          ]}
        />
      </Section>

      <Section n={9} title="Intellectual property">
        <p>
          The Faiceoff platform, brand, and software are owned by {COMPANY.legalName}.
          Creators retain rights in their underlying likeness. Brands receive only the
          licence expressly granted for approved images. No other rights are
          transferred.
        </p>
      </Section>

      <Section n={10} title="Privacy & data protection">
        <p>
          We process personal and biometric data in accordance with our{" "}
          <a className="text-[var(--color-foreground)] underline" href="/privacy">
            Privacy Policy
          </a>{" "}
          and the DPDP Act, 2023. Reference photos and KYC documents are stored
          privately, encrypted, and accessed only to operate the service. You may
          request access to or deletion of your data, subject to legal retention
          requirements.
        </p>
      </Section>

      <Section n={11} title="Termination">
        <p>
          You may close your account at any time. We may suspend or terminate access
          for breach of these Terms, fraud, or legal risk. On termination, licences
          already validly issued for approved images survive for their stated term;
          escrowed funds are settled per the payment terms above.
        </p>
      </Section>

      <Section n={12} title="Disclaimers & limitation of liability">
        <p>
          Faiceoff is provided &ldquo;as is&rdquo;. To the maximum extent permitted by
          law, we are not liable for indirect or consequential losses, and our total
          liability for any claim is limited to the fees you paid to Faiceoff for the
          transaction giving rise to the claim in the preceding three (3) months.
          Brands and creators are each responsible for their own compliance with
          applicable law in how they use the platform and its outputs.
        </p>
      </Section>

      <Section n={13} title="Indemnity">
        <p>
          You agree to indemnify {COMPANY.legalName} against claims arising from your
          misuse of the platform, your breach of these Terms, or your infringement of
          a third party&apos;s rights.
        </p>
      </Section>

      <Section n={14} title="Governing law & disputes">
        <p>
          These Terms are governed by the laws of India. Subject to applicable
          consumer-protection rights, the courts at {COMPANY.address.line2.replace("— ", "")},{" "}
          {COMPANY.address.state} shall have exclusive jurisdiction. We encourage you
          to contact us first to resolve any dispute amicably.
        </p>
      </Section>

      <Section n={15} title="Changes & contact">
        <p>
          We may update these Terms; material changes will be notified in-app or by
          email, and continued use constitutes acceptance. Questions? Write to{" "}
          <a className="text-[var(--color-foreground)] underline" href={`mailto:${COMPANY.emails.legal}`}>
            {COMPANY.emails.legal}
          </a>
          .
        </p>
      </Section>
    </LegalDoc>
  );
}
