/**
 * Contract markdown template + shared constants.
 *
 * `generateContract(input)` returns a pure markdown string and a frozen terms
 * snapshot (`ContractTerms`) suitable for persistence to `license_contracts.
 * terms_json`. No I/O, no side effects — caller handles PDF render + R2 upload.
 *
 * The markdown conforms to the 12-section structure required by the Chunk C
 * spec (Parties, Scope, License Grant, Validity, Consideration + Taxes, Creator
 * Obligations, Brand Obligations, IP Ownership, DPDP, Termination, Liability,
 * Governing Law).
 */

export const CONTRACT_CONSTANTS = {
  TEMPLATE_VERSION: "v1.2026-04",
  GOVERNING_LAW: "Laws of India",
  JURISDICTION: "Mumbai, Maharashtra, India",
  PLATFORM_ENTITY_NAME: "Faiceoff Platform Pvt. Ltd.",
} as const;

export type LicenseTemplate = "creation" | "creation_promotion";

export interface GenerateContractInput {
  licenseRequest: {
    id: string;
    template: LicenseTemplate;
    base_paise: number;
    commission_paise: number;
    gst_on_commission_paise: number;
    total_paise: number;
    image_quota: number;
    validity_days: number;
    requested_at: string;
    accepted_at: string;
    expires_at: string;
    brand_notes?: string;
  };
  creator: {
    display_name: string;
    email: string;
    legal_name?: string;
    kyc_verified: boolean;
  };
  brand: {
    company_name: string;
    gstin?: string;
    address?: string;
    contact_email: string;
  };
}

export interface ContractTerms {
  template_version: string;
  license_request_id: string;
  template: LicenseTemplate;
  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
  image_quota: number;
  validity_days: number;
  accepted_at: string;
  expires_at: string;
  jurisdiction: string;
  governing_law: string;
}

export interface GenerateContractResult {
  markdown: string;
  terms: ContractTerms;
}

const TEMPLATE_DESCRIPTIONS: Record<LicenseTemplate, string> = {
  creation:
    "Creation License — AI-generated images for digital use within scope.",
  creation_promotion:
    "Creation + Promotion License — AI-generated images plus a creator-posted Instagram feature.",
};

/**
 * Format a paise amount as Indian Rupees with two decimals and comma
 * separators, e.g. `600000` → `"₹6,000.00"`.
 *
 * Uses Intl with `en-IN` locale which already applies Indian digit grouping
 * (lakhs/crores conventions) where appropriate. For legal docs, we keep the
 * standard "₹1,234,567.89" shape; the Intl locale handles the grouping
 * consistently regardless of magnitude.
 */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `₹${formatted}`;
}

/**
 * Format an ISO timestamp as human-readable IST.
 *
 * Example: `2026-04-22T10:00:00.000Z` → `"22 April 2026, 3:30 PM IST"`.
 *
 * We deliberately append `IST` literally because Intl sometimes returns it as
 * `GMT+5:30` or `Asia/Kolkata` depending on Node version; `IST` is what lawyers
 * expect on an Indian contract.
 */
export function formatIstDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  })
    .format(date)
    .replace(/\s*am/i, " AM")
    .replace(/\s*pm/i, " PM");
  return `${datePart}, ${timePart} IST`;
}

export function generateContract(
  input: GenerateContractInput,
): GenerateContractResult {
  const { licenseRequest: req, creator, brand } = input;

  const terms: ContractTerms = {
    template_version: CONTRACT_CONSTANTS.TEMPLATE_VERSION,
    license_request_id: req.id,
    template: req.template,
    base_paise: req.base_paise,
    commission_paise: req.commission_paise,
    gst_on_commission_paise: req.gst_on_commission_paise,
    total_paise: req.total_paise,
    image_quota: req.image_quota,
    validity_days: req.validity_days,
    accepted_at: req.accepted_at,
    expires_at: req.expires_at,
    jurisdiction: CONTRACT_CONSTANTS.JURISDICTION,
    governing_law: CONTRACT_CONSTANTS.GOVERNING_LAW,
  };

  const effectiveDate = formatIstDateTime(req.accepted_at);
  const endDate = formatIstDateTime(req.expires_at);

  const creatorLegalLine = creator.legal_name
    ? `  - Legal name: ${creator.legal_name}`
    : creator.kyc_verified
      ? `  - Legal name: ${creator.display_name}`
      : `  - Legal name: as per KYC verification pending`;

  const brandGstinLine = brand.gstin
    ? `  - GSTIN: ${brand.gstin}`
    : `  - GSTIN: not applicable (unregistered)`;
  const brandAddressLine = brand.address
    ? `  - Address: ${brand.address}`
    : `  - Address: as on file with platform`;

  const templateDescription = TEMPLATE_DESCRIPTIONS[req.template];

  const promotionBlock =
    req.template === "creation_promotion"
      ? `

### 3.1 Promotion Scope

Licensee may post a **minimum of one Instagram post** within the Validity Period (§4) featuring an approved image.
Licensee retains sole responsibility for ad spend, platform compliance, and campaign performance.`
      : "";

  // §5 scope reference — in a creation-only contract we skip 3.1 and only
  // reference §3 for permitted uses. creation_promotion references §3.1.
  const scopeCrossRef =
    req.template === "creation_promotion"
      ? "§3 and §3.1"
      : "§3";

  // We pre-compute rupee strings so the markdown is easy to diff-review.
  const baseRupees = formatRupees(req.base_paise);
  const commissionRupees = formatRupees(req.commission_paise);
  const gstRupees = formatRupees(req.gst_on_commission_paise);
  const totalRupees = formatRupees(req.total_paise);

  const markdown = `# License Agreement

**Agreement ID:** ${req.id}
**Effective Date:** ${effectiveDate}
**Template Version:** ${CONTRACT_CONSTANTS.TEMPLATE_VERSION}

## 1. Parties

- **Creator ("Licensor"):** ${creator.display_name}
  - Email: ${creator.email}
${creatorLegalLine}
- **Brand ("Licensee"):** ${brand.company_name}
${brandGstinLine}
${brandAddressLine}
  - Contact: ${brand.contact_email}

## 2. Scope

This Agreement governs the Licensee's use of the Licensor's biometric likeness ("Likeness"), including facial features and expressions, as captured in reference photos provided by the Licensor, for the purpose of AI-generated image creation on the Faiceoff platform.

Template: **${req.template}** — ${templateDescription}

## 3. License Grant

The Licensor hereby grants the Licensee a **non-exclusive, non-transferable, limited-term** license to:

- Generate up to **${req.image_quota} images** bearing the Licensor's Likeness using Faiceoff's AI pipeline.
- Use approved images for the purposes described in ${scopeCrossRef} below.${promotionBlock}

## 4. Validity Period

- Start: ${effectiveDate}
- End: ${endDate} (${req.validity_days} days)

Unused image quota at the end of this period will be refunded pro-rata to the Licensee's credit balance.

## 5. Consideration + Taxes

| Line item | Amount |
|-----------|--------|
| Base license fee | ${baseRupees} |
| Platform commission (18%) | ${commissionRupees} |
| GST on commission (18%) | ${gstRupees} |
| **Total charged to Brand** | **${totalRupees}** |

Licensor receives the base license fee **minus** applicable statutory deductions (TCS u/s 52 CGST 1%, TDS u/s 194-O 1%, and GST 18% if Licensor is GST-registered) at the time of withdrawal. Platform remits TCS/TDS/GST to the respective authorities on the Licensor's behalf.

## 6. Creator Obligations

- Provide accurate reference photos uploaded during onboarding (DPDP Consent captured per §9).
- Review each generated image within 48 hours of notification.
- Flag any generation that violates blocked-concept rules pre-declared in Creator's profile.
- Maintain KYC verification for payout eligibility.

## 7. Brand Obligations

- Use generated images only for the purposes stated in §2 and §3.
- Attribute the Licensor where required by law or platform policy.
- Report any unauthorised reuse or leak immediately.
- Comply with all applicable advertising standards and consumer protection laws.

## 8. Intellectual Property Ownership

- **Likeness IP:** The Licensor retains all rights to their Likeness. This Agreement grants a limited-use license only.
- **Generated Image Copyright:** Copyright in the specific generated image files vests in **${CONTRACT_CONSTANTS.PLATFORM_ENTITY_NAME}** as the assembler. Licensee receives usage rights per §3. Licensor retains attribution rights.
- No rights are transferred beyond those explicitly stated in this Agreement.

## 9. Data Protection (DPDP Act, 2023)

- Likeness data is processed per the Creator's DPDP consent captured at onboarding.
- Creator may request erasure of uploaded reference photos at any time via the platform (existing contracts remain valid for the validity period).
- Faiceoff acts as Data Fiduciary for the Likeness; Brand acts as a Recipient for approved outputs.

## 10. Termination

- Either party may terminate for material breach with 7 days written notice.
- On termination, unused quota refunds per §4.
- Approved images already delivered remain usable by Licensee for the original purposes.

## 11. Liability & Indemnity

- Platform liability is capped at the total amount charged for this License (§5).
- Licensor warrants their Likeness is their own and not subject to exclusive third-party claims.
- Licensee indemnifies Platform and Licensor against misuse outside the license grant.

## 12. Governing Law & Disputes

- **Governing law:** ${CONTRACT_CONSTANTS.GOVERNING_LAW}.
- **Jurisdiction:** Exclusive jurisdiction of courts at ${CONTRACT_CONSTANTS.JURISDICTION.replace(", India", "")}.
- Disputes over ₹2 lakh will first be attempted through arbitration under the Arbitration and Conciliation Act, 1996.

---

## Click-to-Accept Electronic Acceptance

By clicking "Accept and Sign", the Licensor confirms:

- They have read and understood this Agreement in full.
- They agree to be bound by its terms.
- They understand this is legally binding under the IT Act, 2000 (India).

IP address, user agent, timestamp, and scroll depth of acceptance are recorded and form part of this Agreement.
`;

  return { markdown, terms };
}
