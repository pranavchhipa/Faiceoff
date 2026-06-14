// ─────────────────────────────────────────────────────────────────────────────
// Company info — single source of truth
//
// Faiceoff is operated by Isometrica Experiences Pvt. Ltd. All legal text,
// invoices, license PDFs, footer copy, and email templates pull from here so
// the operating entity / contact info stays consistent across the platform.
//
// Update this file (NOT individual templates / pages) when company info changes.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY = {
  /** Operating legal entity that runs Faiceoff */
  legalName: "Isometrica Experiences Pvt. Ltd.",
  /** Short trade name shown in marketing copy */
  tradeName: "Faiceoff",
  /** Brand tagline */
  tagline: "India's AI face licensing marketplace",

  /** Registered office (single-line + multi-line forms) */
  address: {
    line1: "B-23, Sector 63",
    line2: "Noida — 201301",
    state: "Uttar Pradesh",
    country: "India",
    /** Single-line variant for inline use (e.g. footer, PDF) */
    inline: "B-23, Sector 63, Noida — 201301, India",
  },

  /** Business hours, IST */
  hours: "10:00 — 20:00 IST · Mon to Sat",

  /** Phone — single business number */
  phone: {
    /** Display form */
    display: "+91 99857 57091",
    /** E.164 form for tel: links and SMS */
    e164: "+919985757091",
    /** tel: href */
    tel: "tel:+919985757091",
  },

  /** Email addresses — purpose-specific */
  emails: {
    /** Primary front-door for general inquiries */
    hello: "hello@faiceoff.com",
    /** Customer support — billing, refunds, account help */
    support: "support@faiceoff.com",
    /** Transactional sender (used by Resend) */
    notifications: "notifications@faiceoff.com",
    /** Legal / DPDP / contract queries */
    legal: "legal@faiceoff.com",
  },

  /** Founders — surfaced on the /contact page */
  founders: [
    { name: "Dheeraj", email: "dheeraj@faiceoff.com", role: "Co-founder" },
    { name: "Pranav", email: "Pranav@faiceoff.com", role: "Co-founder" },
  ] as const,

  /** Compliance badges shown in footer + license PDF */
  compliance: ["DPDP Act", "GST", "IT Act"] as const,

  /**
   * Social profile URLs. Leave a value empty ("") to HIDE that icon — the
   * footer only renders socials with a real URL, so we never ship dead links.
   * Fill these in when the handles are live.
   */
  socials: {
    instagram: "https://instagram.com/faiceoff.official",
    twitter: "",   // e.g. "https://x.com/faiceoff"
    linkedin: "",  // e.g. "https://linkedin.com/company/faiceoff"
  },
} as const;
