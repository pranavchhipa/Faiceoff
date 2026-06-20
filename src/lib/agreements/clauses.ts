/**
 * Versioned legal clause text for the Collaboration Agreement.
 *
 * Keep ALL legal prose here so a version bump is a single-file change. The PDF
 * renderer composes these constants with the dynamic, per-collab values
 * (parties, fees, term) computed in `terms.ts`.
 *
 * When you materially change any clause, bump AGREEMENT_VERSION (and the
 * default in migration 00071 / service.ts) so older signed PDFs stay pinned to
 * the wording the parties actually agreed to.
 */

import { COMPANY } from "@/lib/constants/company";

export const AGREEMENT_VERSION = "1.0";

/** Operating entity (single source of truth: src/lib/constants/company.ts). */
export const PLATFORM_ENTITY = COMPANY.legalName;

/** Governing-law seat — shared with the per-image Licence Certificate. */
export const GOVERNING_JURISDICTION = COMPANY.governingJurisdiction;

// ── 3. Grant of likeness rights ──────────────────────────────────────────────

export const GRANT_BODY =
  "The Creator (Licensor) grants the Brand (Licensee), through the Faiceoff platform, a non-exclusive, non-transferable, worldwide licence to use AI-generated imagery depicting the Creator's licensed likeness, solely for the deliverables, usage scope, and term set out in this Agreement. The grant takes effect only for images the Creator has expressly approved. Each approved image is issued its own verifiable Licence Certificate, which forms part of and is governed by this Agreement. Nothing in this Agreement transfers ownership of the Creator's likeness, identity, or personality rights, all of which remain with the Creator.";

// ── 4. Creator approval control ──────────────────────────────────────────────

export const APPROVAL_BODY =
  "No image is delivered to the Brand or licensed for use until the Creator has expressly approved it. The Creator may approve or reject each generated image at their sole discretion. Rejected images confer no rights on the Brand and must not be used. The Brand acknowledges that generation credits permit iteration only and do not, by themselves, grant any usage right absent the Creator's approval and an issued Licence Certificate.";

// ── 7. Exclusivity ───────────────────────────────────────────────────────────

export const EXCLUSIVITY_BODY =
  "Unless a separate written exclusivity arrangement is recorded on the platform, this licence is non-exclusive. The Creator remains free to collaborate with other brands, including competitors, and to license their likeness for other campaigns during and after the Term.";

// ── 8. Restrictions / prohibited uses ────────────────────────────────────────

export const RESTRICTIONS: readonly string[] = [
  "Sub-licensing, assigning, or transferring any rights under this Agreement to a third party.",
  "Use in adult, sexual, or pornographic material, or any context that sexualises the Creator.",
  "Use in political campaigns, religious endorsements, or to imply the Creator's affiliation with any political or religious body.",
  "Use that defames, demeans, harasses, or portrays the Creator in a false, misleading, or disparaging manner.",
  "Representing the Creator as a personal endorser, spokesperson, or paid testimonial-giver for any product or claim, unless separately negotiated in writing.",
  "Altering the image to change the Creator's identity, ethnicity, body, age, or to combine it with content the Creator has not approved.",
  "Any use after the Term ends, or after the licence is revoked by the Creator or by the platform.",
  "Re-uploading approved imagery to AI training datasets, model fine-tuning corpora, face-recognition systems, or stock-image platforms.",
] as const;

// ── 9. Representations & warranties ──────────────────────────────────────────

export const CREATOR_REPS: readonly string[] = [
  "The reference photographs are genuinely of the Creator, who is 18 years of age or older.",
  "The Creator has the full right and authority to license their likeness as set out here.",
  "The Creator is not impersonating any other person and is not infringing any third party's rights.",
  "Information provided by the Creator, including KYC details, is true and accurate.",
] as const;

export const BRAND_REPS: readonly string[] = [
  "The Brand will use approved imagery only within the licensed scope, term, and these restrictions.",
  "The products, services, and claims associated with the imagery are lawful and not misleading.",
  "The Brand has the authority to enter into this Agreement and to make the payment recorded here.",
  "The Brand will not use the imagery in any manner prohibited by this Agreement or applicable law.",
] as const;

// ── 10. Intellectual property & ownership ────────────────────────────────────

export const IP_BODY =
  "The Creator retains all personality, publicity, and likeness rights in and to their identity. The Brand owns the creative brief and any product imagery it supplies. The AI-generated composite image is licensed — not sold — to the Brand for the scope and term stated, and remains subject to the Creator's underlying likeness rights and to this Agreement. Faiceoff retains ownership of the platform, its models, and the verification certificate format.";

// ── 11. Confidentiality ──────────────────────────────────────────────────────

export const CONFIDENTIALITY_BODY =
  "Each party shall keep confidential any non-public information disclosed in connection with this collaboration, including unreleased products, briefs, pricing, and pre-approval imagery, and shall use it solely to perform this Agreement. This obligation survives termination. Approved imagery published by the Brand within the licensed scope is not confidential.";

// ── 12. Indemnity & limitation of liability ──────────────────────────────────

export const INDEMNITY_BODY =
  "The Brand shall indemnify and hold harmless the Creator and Faiceoff against claims, losses, and liabilities arising from the Brand's use of the imagery outside the licensed scope or in breach of this Agreement. The Creator shall indemnify the Brand and Faiceoff against claims arising from a breach of the Creator's representations. To the maximum extent permitted by law, Faiceoff's aggregate liability under this Agreement is limited to the platform commission it actually retained for this collaboration. Faiceoff acts as an intermediary facilitating the licence and is not a party to the underlying creative use.";

// ── 13. Data protection & consent (DPDP) ─────────────────────────────────────

export const DPDP_BODY =
  "The Creator's reference photographs and derived facial data are processed under the Creator's explicit consent and the Digital Personal Data Protection Act, 2023 (DPDP Act). Faiceoff acts as Data Fiduciary for this likeness data, stores it securely, and never shares the underlying reference photographs with the Brand. The Creator may withdraw consent at any time; withdrawal stops new licences immediately, while licences already issued run out their stated term unless separately revoked. Processing is also conducted in compliance with the Information Technology Act, 2000.";

// ── 14. Termination & revocation ─────────────────────────────────────────────

export const TERMINATION_BODY =
  "This Agreement and the licences under it terminate automatically at the end of the Term. The Creator or Faiceoff may revoke a licence with immediate effect on a material breach of this Agreement, on a verified DPDP consent withdrawal, or on a credible report of misuse. On termination or revocation, the Brand must cease all use of the affected imagery and remove it from active channels within a reasonable period. Sums already released from escrow for completed, approved deliverables are non-refundable, save where required by the platform's refund policy.";

// ── 15. Governing law & jurisdiction ─────────────────────────────────────────

export const GOVERNING_LAW_BODY =
  `This Agreement is governed by and construed in accordance with the laws of India. The parties submit to the exclusive jurisdiction of ${GOVERNING_JURISDICTION}. This Agreement is concluded and executed electronically and is valid and enforceable under Section 10A of the Information Technology Act, 2000, without a physical signature.`;

// ── Closing / execution note ─────────────────────────────────────────────────

export const EXECUTION_NOTE =
  "By signing electronically below, each party confirms that it has read, understood, and agreed to be bound by this Agreement. Signatures are captured with the signing party's name, an electronic timestamp, and the originating network address, and are recorded on the Faiceoff platform as a tamper-evident audit trail.";
