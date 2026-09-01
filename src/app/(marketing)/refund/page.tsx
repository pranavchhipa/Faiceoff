import { LegalDoc, Section, LegalList } from "@/components/legal/legal-doc";
import { COMPANY } from "@/lib/constants/company";

export const metadata = {
  title: "Refund Policy — Faiceoff",
  description:
    "How refunds work on Faiceoff — credit packs, collaboration packages, failed generations, and disputes.",
};

// NOTE: drafted to match the platform's actual behaviour (auto credit-refund
// on failed generations, admin-mediated dispute refunds, pay-on-approval
// collab model). Have this reviewed by counsel before treating it as final.
export default function RefundPage() {
  return (
    <LegalDoc
      title="Refund Policy"
      updated="26 August 2026 (v1.0)"
      intro={
        <>
          This policy explains when payments made on <strong>Faiceoff</strong>{" "}
          (operated by {COMPANY.legalName}) are refunded. It should be read
          together with our Terms &amp; Conditions. Nothing here limits rights
          you cannot waive under applicable Indian consumer law.
        </>
      }
    >
      <Section n={1} title="Failed generations — automatic credit refund">
        <p>
          Every AI generation consumes one credit. If a generation{" "}
          <strong>fails technically</strong> (the pipeline errors, times out, or
          produces no image), the consumed credit is{" "}
          <strong>returned to your balance automatically</strong> — usually
          within a minute, and at most within a day via our recovery sweep. You
          do not need to contact support for this.
        </p>
      </Section>

      <Section n={2} title="Credit packs">
        <LegalList
          items={[
            "Credit packs are prepaid usage credits, priced in INR and charged via Razorpay at purchase.",
            "Once credits are spent on generations, that spend is final — creators are paid from approved work, so consumed credits cannot be reversed.",
            "If you were charged but your credits did not appear within a few minutes, contact support with your payment reference — the payment is verified against Razorpay and the credits are granted or the charge reversed.",
            "Unused credits do not expire while your account is in good standing. If you close your account with a substantial unused, unspent balance, contact support and we will review a pro-rata refund of the purchase price of unused credits on a case-by-case basis.",
          ]}
        />
      </Section>

      <Section n={3} title="Collaboration packages">
        <LegalList
          items={[
            "A collaboration package is paid upfront when a creator accepts your request. The payment funds the package's generation credits and the creator's earnings on approved images.",
            "Images you approve are licensed and paid to the creator — approved work is not refundable.",
            "If a collaboration cannot proceed (for example the creator becomes unavailable before any work is delivered), contact support — undelivered portions are refunded to your original payment method or as platform credits, at your choice.",
            "If your payment was captured but the collaboration did not unlock, the webhook usually reconciles it within a minute. If it does not, contact support with the request ID shown on the payment screen.",
          ]}
        />
      </Section>

      <Section n={4} title="Disputes">
        <LegalList
          items={[
            "If a delivered image materially fails the agreed brief or our content rules, raise a dispute from the generation page or write to support within 7 days of delivery.",
            "Disputes are reviewed by a human. Where the dispute is upheld, we refund credits (or the payment, where credits are not appropriate) and claw back unreleased creator earnings for that image.",
            "Dispute decisions are made in good faith based on the brief, the delivered work, and platform rules, and are final at the platform level.",
          ]}
        />
      </Section>

      <Section n={5} title="How refunds are paid">
        <LegalList
          items={[
            "Credit refunds appear on your Faiceoff balance immediately once processed.",
            "Money refunds go to the original Razorpay payment method. Razorpay typically settles refunds in 5–7 business days depending on your bank.",
            "GST-invoiced amounts are refunded with a corresponding credit note.",
          ]}
        />
      </Section>

      <Section n={6} title="Cancellations">
        <LegalList
          items={[
            "You can cancel a collaboration request any time before the creator accepts it — no charge is made until acceptance.",
            "Credit-pack purchases are for prepaid usage and cannot be cancelled once the payment succeeds; unspent credits remain on your account per section 2.",
            "A creator declining or an expired request is auto-cancelled and never charges you.",
          ]}
        />
      </Section>

      <Section n={7} title="Contact & grievance redressal">
        <p>
          For any payment or refund question, write to{" "}
          <a
            className="text-[var(--color-foreground)] underline"
            href={`mailto:${COMPANY.emails.support}`}
          >
            {COMPANY.emails.support}
          </a>{" "}
          with your account email and the payment or request ID. We acknowledge
          refund and cancellation queries within{" "}
          <strong>48 hours</strong> and aim to resolve them within{" "}
          <strong>7 business days</strong>.
        </p>
        <p className="mt-3">
          If your issue is not resolved to your satisfaction, you may escalate
          to our Grievance Officer under the Consumer Protection (E-Commerce)
          Rules, 2020 at{" "}
          <a
            className="text-[var(--color-foreground)] underline"
            href={`mailto:${COMPANY.emails.legal}`}
          >
            {COMPANY.emails.legal}
          </a>
          . The Grievance Officer acknowledges every complaint within 48 hours
          and redresses it within one month of receipt.
        </p>
        <p className="mt-4 text-[13px] text-[var(--color-muted-foreground)]">
          {COMPANY.legalName}, {COMPANY.address.inline}. Business hours{" "}
          {COMPANY.hours}.
        </p>
      </Section>
    </LegalDoc>
  );
}
