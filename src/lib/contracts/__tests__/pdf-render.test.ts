import { describe, expect, it } from "vitest";
import { generateContract, type GenerateContractInput } from "../template";
import { renderContractPdf } from "../pdf-render";

const SAMPLE_INPUT: GenerateContractInput = {
  licenseRequest: {
    id: "lr_pdf_test_01",
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

describe("renderContractPdf", () => {
  it("returns a non-empty Buffer starting with %PDF- signature", async () => {
    const { markdown } = generateContract(SAMPLE_INPUT);
    const pdf = await renderContractPdf(markdown);

    expect(Buffer.isBuffer(pdf) || pdf instanceof Uint8Array).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(1024); // at least 1KB

    // PDF magic bytes — first 5 bytes must be `%PDF-`
    const head = Buffer.from(pdf.slice(0, 5)).toString("utf8");
    expect(head).toBe("%PDF-");

    // Tail must contain %%EOF marker
    const tail = Buffer.from(
      pdf.slice(Math.max(0, pdf.byteLength - 64)),
    ).toString("utf8");
    expect(tail).toMatch(/%%EOF/);
  }, 30_000);

  it("handles a minimal markdown document", async () => {
    const pdf = await renderContractPdf(
      "# Title\n\nA single paragraph.\n\n- Item 1\n- Item 2\n",
    );
    expect(pdf.byteLength).toBeGreaterThan(512);
    expect(Buffer.from(pdf.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  }, 30_000);

  it("renders markdown containing a table without crashing", async () => {
    const md = `# Receipt

| Line | Amount |
|------|--------|
| Base | ₹6,000.00 |
| Commission | ₹1,080.00 |
| **Total** | **₹7,080.00** |
`;
    const pdf = await renderContractPdf(md);
    expect(pdf.byteLength).toBeGreaterThan(1024);
  }, 30_000);

  it("supports headings, blockquote, hr, and emphasis tokens", async () => {
    const md = `# Heading

## Subheading

### Sub-sub

Paragraph with **bold** and *italic* text.

- first
- second

1. step one
2. step two

> A blockquote line.

---

Final paragraph.
`;
    const pdf = await renderContractPdf(md);
    expect(Buffer.from(pdf.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  }, 30_000);
});
