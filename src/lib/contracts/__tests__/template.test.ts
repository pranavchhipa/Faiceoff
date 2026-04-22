import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  CONTRACT_CONSTANTS,
  formatRupees,
  formatIstDateTime,
  generateContract,
  type GenerateContractInput,
} from "../template";

const SAMPLE_INPUT: GenerateContractInput = {
  licenseRequest: {
    id: "lr_01hx9z2abcdef",
    template: "creation_promotion",
    base_paise: 600000,
    commission_paise: 108000,
    gst_on_commission_paise: 19440,
    total_paise: 727440,
    image_quota: 25,
    validity_days: 90,
    requested_at: "2026-04-21T10:00:00.000Z",
    accepted_at: "2026-04-22T10:00:00.000Z",
    expires_at: "2026-07-21T10:00:00.000Z",
    brand_notes: "Summer ice-cream campaign",
  },
  creator: {
    display_name: "Priya Sharma",
    email: "priya@example.com",
    legal_name: "Priya Sharma",
    kyc_verified: true,
  },
  brand: {
    company_name: "Amul Industries Pvt. Ltd.",
    gstin: "27AAACG1234A1Z5",
    address: "Anand, Gujarat, India",
    contact_email: "licensing@amul.com",
  },
};

function stripDashesAndDigits(markdown: string): string {
  // For section-presence assertions we want to skip the minus sign within
  // "non-exclusive" when we test a specific header like "## 1. Parties".
  // This helper is intentionally unused; kept as documentation of intent.
  return markdown;
}

describe("CONTRACT_CONSTANTS", () => {
  it("exports template version v1.2026-04", () => {
    expect(CONTRACT_CONSTANTS.TEMPLATE_VERSION).toBe("v1.2026-04");
  });

  it("locks jurisdiction to Mumbai, Maharashtra, India", () => {
    expect(CONTRACT_CONSTANTS.JURISDICTION).toBe(
      "Mumbai, Maharashtra, India",
    );
  });

  it("governing law is Laws of India", () => {
    expect(CONTRACT_CONSTANTS.GOVERNING_LAW).toBe("Laws of India");
  });

  it("platform entity name defined", () => {
    expect(CONTRACT_CONSTANTS.PLATFORM_ENTITY_NAME).toMatch(/Faiceoff/);
  });
});

describe("formatRupees", () => {
  it("formats 600000 paise as ₹6,000.00", () => {
    expect(formatRupees(600000)).toBe("₹6,000.00");
  });

  it("formats 727440 paise as ₹7,274.40", () => {
    expect(formatRupees(727440)).toBe("₹7,274.40");
  });

  it("formats 0 paise as ₹0.00", () => {
    expect(formatRupees(0)).toBe("₹0.00");
  });

  it("pads single-digit paisa values", () => {
    // 1205 paise = ₹12.05 — ensure zero-padding after decimal
    expect(formatRupees(1205)).toBe("₹12.05");
  });
});

describe("formatIstDateTime", () => {
  it("renders a UTC ISO string as IST human-readable", () => {
    // 10:00 UTC on 22 April 2026 → 15:30 IST
    const out = formatIstDateTime("2026-04-22T10:00:00.000Z");
    expect(out).toContain("22");
    expect(out).toContain("2026");
    expect(out).toMatch(/IST$/);
    // 15:30 IST hour
    expect(out).toMatch(/3:30/);
  });
});

describe("generateContract", () => {
  it("returns markdown and terms", () => {
    const result = generateContract(SAMPLE_INPUT);
    expect(typeof result.markdown).toBe("string");
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.terms).toBeDefined();
  });

  it("terms.template_version matches constant", () => {
    const { terms } = generateContract(SAMPLE_INPUT);
    expect(terms.template_version).toBe(CONTRACT_CONSTANTS.TEMPLATE_VERSION);
  });

  it("terms freezes all pricing inputs", () => {
    const { terms } = generateContract(SAMPLE_INPUT);
    expect(terms.license_request_id).toBe(SAMPLE_INPUT.licenseRequest.id);
    expect(terms.template).toBe(SAMPLE_INPUT.licenseRequest.template);
    expect(terms.base_paise).toBe(600000);
    expect(terms.commission_paise).toBe(108000);
    expect(terms.gst_on_commission_paise).toBe(19440);
    expect(terms.total_paise).toBe(727440);
    expect(terms.image_quota).toBe(25);
    expect(terms.validity_days).toBe(90);
    expect(terms.accepted_at).toBe(SAMPLE_INPUT.licenseRequest.accepted_at);
    expect(terms.expires_at).toBe(SAMPLE_INPUT.licenseRequest.expires_at);
    expect(terms.jurisdiction).toBe(CONTRACT_CONSTANTS.JURISDICTION);
    expect(terms.governing_law).toBe(CONTRACT_CONSTANTS.GOVERNING_LAW);
  });

  it("markdown contains all 12 numbered sections", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);

    const expectedHeadings = [
      "## 1. Parties",
      "## 2. Scope",
      "## 3. License Grant",
      "## 4. Validity Period",
      "## 5. Consideration + Taxes",
      "## 6. Creator Obligations",
      "## 7. Brand Obligations",
      "## 8. Intellectual Property Ownership",
      "## 9. Data Protection (DPDP Act, 2023)",
      "## 10. Termination",
      "## 11. Liability & Indemnity",
      "## 12. Governing Law & Disputes",
    ];

    for (const heading of expectedHeadings) {
      expect(
        markdown.includes(heading),
        `Missing section: ${heading}`,
      ).toBe(true);
    }
  });

  it("markdown includes title + agreement id + effective date + template version", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("# License Agreement");
    expect(markdown).toContain("lr_01hx9z2abcdef");
    expect(markdown).toContain(CONTRACT_CONSTANTS.TEMPLATE_VERSION);
    expect(markdown).toMatch(/22.*2026.*IST/);
  });

  it("parties section substitutes creator + brand fields", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("Priya Sharma");
    expect(markdown).toContain("priya@example.com");
    expect(markdown).toContain("Amul Industries Pvt. Ltd.");
    expect(markdown).toContain("27AAACG1234A1Z5");
    expect(markdown).toContain("licensing@amul.com");
    expect(markdown).toContain("Anand, Gujarat, India");
  });

  it("uses KYC-pending phrasing when creator not verified", () => {
    const input = {
      ...SAMPLE_INPUT,
      creator: {
        ...SAMPLE_INPUT.creator,
        legal_name: undefined,
        kyc_verified: false,
      },
    };
    const { markdown } = generateContract(input);
    expect(markdown).toMatch(/KYC verification pending/i);
  });

  it("falls back to display_name when legal name missing but kyc_verified", () => {
    const input = {
      ...SAMPLE_INPUT,
      creator: {
        ...SAMPLE_INPUT.creator,
        legal_name: undefined,
      },
    };
    const { markdown } = generateContract(input);
    // Even without legal name, display name is always present
    expect(markdown).toContain("Priya Sharma");
  });

  it("pricing table renders all 4 line items with rupee formatting", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("Base license fee");
    expect(markdown).toContain("Platform commission (18%)");
    expect(markdown).toContain("GST on commission (18%)");
    expect(markdown).toContain("Total charged to Brand");

    expect(markdown).toContain("₹6,000.00");
    expect(markdown).toContain("₹1,080.00");
    expect(markdown).toContain("₹194.40");
    expect(markdown).toContain("₹7,274.40");
  });

  it("license grant references image_quota and validity_days", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("25 images");
    expect(markdown).toContain("90 days");
  });

  it("includes promotion scope subsection for creation_promotion template", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("### 3.1 Promotion Scope");
    expect(markdown).toMatch(/Instagram post/i);
  });

  it("omits promotion scope subsection for creation-only template", () => {
    const input = {
      ...SAMPLE_INPUT,
      licenseRequest: {
        ...SAMPLE_INPUT.licenseRequest,
        template: "creation" as const,
      },
    };
    const { markdown } = generateContract(input);
    expect(markdown).not.toContain("### 3.1 Promotion Scope");
  });

  it("governing law section names Mumbai jurisdiction + IT Act reference", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toContain("Laws of India");
    expect(markdown).toContain("Mumbai, Maharashtra");
    expect(markdown).toMatch(/Arbitration and Conciliation Act/);
  });

  it("click-to-accept footer references IT Act 2000", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toMatch(/IT Act, 2000/);
    expect(markdown).toMatch(/Click-to-Accept/i);
  });

  it("DPDP section references Data Fiduciary + reference photo erasure", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toMatch(/DPDP/);
    expect(markdown).toMatch(/Data Fiduciary/);
    expect(markdown).toMatch(/erasure/);
  });

  it("termination section includes 7-day notice + approved-image retention", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(markdown).toMatch(/7 days/);
    expect(markdown).toMatch(/Approved images already delivered/i);
  });

  it("produced markdown parses without errors", () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    expect(() => marked.lexer(markdown)).not.toThrow();
    const tokens = marked.lexer(markdown);
    expect(tokens.length).toBeGreaterThan(0);
    // Must contain at least one h1 (title), multiple h2 (sections), at least one table (pricing).
    const h1s = tokens.filter(
      (t) => t.type === "heading" && (t as { depth: number }).depth === 1,
    );
    const h2s = tokens.filter(
      (t) => t.type === "heading" && (t as { depth: number }).depth === 2,
    );
    const tables = tokens.filter((t) => t.type === "table");
    expect(h1s.length).toBeGreaterThanOrEqual(1);
    expect(h2s.length).toBeGreaterThanOrEqual(12);
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

// Touch unused helper so the linter doesn't complain in strict mode.
void stripDashesAndDigits;
