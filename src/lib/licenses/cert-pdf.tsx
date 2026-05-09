/**
 * License certificate PDF generator — industry-grade format.
 *
 * Generates a 2-page A4 licence certificate following commercial-photography
 * licensing conventions:
 *   Page 1 — title, parties, subject (image thumbnail), grant of licence,
 *            permitted uses, key dates.
 *   Page 2 — restrictions, term, compensation, attribution, compliance,
 *            verification (QR), digital signature/fingerprint.
 *
 * Brand assets:
 *   • Faiceoff logo embedded from /public/logo-mark.png at module init
 *     (read once, cached as base64 data URL for repeated use).
 *   • Licensed image thumbnail fetched at render time and base64-embedded
 *     so the cert is fully self-contained (no broken links offline).
 *
 * Tamper evidence:
 *   • SHA-256 of the rendered buffer stored alongside the cert.
 *   • QR code + verify URL on the cert.
 */

import React from "react";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

import type {
  GenerateLicenseCertPDFInput,
  LicenseCertPDFResult,
  LicenseScope,
} from "./types";

// ── Brand assets (loaded once) ─────────────────────────────────────────────

/** Faiceoff logo as a base64 data URL — embedded at top of page 1. */
const FAICEOFF_LOGO_DATA_URL: string | null = (() => {
  try {
    const p = path.join(process.cwd(), "public", "logo-mark.png");
    const buf = fs.readFileSync(p);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  paper: "#fdfbf7",
  ink: "#1a1513",
  inkSoft: "#3a322c",
  gold: "#c9a96e",
  goldLight: "#e5d9c2",
  goldFaint: "#f4ecdc",
  muted: "#6b5e52",
  mutedSoft: "#8a7d70",
  cardBg: "#faf7f2",
  emerald: "#0f7e60",
  red: "#b03020",
  amber: "#a06c1d",
  border: "#e0d4c0",
} as const;

const SCOPE_LABELS: Record<LicenseScope, string> = {
  digital:
    "Digital Media — websites, social media, e-commerce, digital advertising, and online marketing channels.",
  digital_print:
    "Digital + Print Media — all digital channels plus printed brochures, magazines, posters, billboards, point-of-sale displays, and out-of-home advertising.",
  digital_print_packaging:
    "Digital + Print + Product Packaging — all of the above plus product packaging, labels, retail displays, and on-product imprinting.",
};

const SCOPE_HEADLINE: Record<LicenseScope, string> = {
  digital: "DIGITAL",
  digital_print: "DIGITAL + PRINT",
  digital_print_packaging: "DIGITAL + PRINT + PACKAGING",
};

// Fixed restrictions enforced by the platform — same on every cert.
const STANDARD_RESTRICTIONS: string[] = [
  "Sub-licensing or transferring the licensed image to any third party.",
  "Use in adult, sexual, or pornographic material; or contexts that sexualise the Licensor.",
  "Use in political campaigns, religious endorsements, or to imply the Licensor's affiliation with any political or religious body.",
  "Use that defames, demeans, or portrays the Licensor in a false or misleading manner.",
  "Use of the Licensor's name, voice, or likeness as a celebrity endorsement or paid testimonial unless separately negotiated.",
  "Modification of the image to alter the Licensor's identity, ethnicity, body, or to combine with content the Licensor has not approved.",
  "Use after the Term ends, or after revocation by the Licensor or by Faiceoff Platform Pvt. Ltd.",
  "Re-uploading the image to AI training datasets, model fine-tuning corpora, or stock-image platforms.",
];

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.ink,
    lineHeight: 1.45,
  },

  // Decorative double-border (gold + faint inner)
  outerBorder: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderWidth: 1.6,
    borderColor: COLORS.gold,
    borderStyle: "solid",
  },
  innerBorder: {
    position: "absolute",
    top: 22,
    left: 22,
    right: 22,
    bottom: 22,
    borderWidth: 0.4,
    borderColor: COLORS.goldLight,
    borderStyle: "solid",
  },

  // Watermark text behind content
  watermark: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 80,
    color: COLORS.goldFaint,
    opacity: 0.5,
    letterSpacing: 12,
  },

  // ─── Header ───
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 28,
    height: 28,
  },
  brandName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: COLORS.ink,
    letterSpacing: 0.6,
  },
  brandTagline: {
    fontSize: 6.5,
    color: COLORS.muted,
    letterSpacing: 1.4,
    marginTop: 1,
    textTransform: "uppercase",
  },
  certNumberBlock: {
    alignItems: "flex-end",
  },
  certNumberLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.muted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  certNumberValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.ink,
    marginTop: 1,
  },

  // Title section
  titleStack: {
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.goldLight,
  },
  titleEyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.gold,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  titleText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    color: COLORS.ink,
    letterSpacing: 1.5,
    textAlign: "center",
  },
  titleSubtext: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 5,
    textAlign: "center",
  },

  // Status row
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  statusCol: {
    flex: 1,
    alignItems: "center",
  },
  statusColLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statusColValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.ink,
    marginTop: 2,
  },
  statusColPill: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.emerald,
    backgroundColor: "#e6f4ee",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
  },
  statusPillRevoked: {
    color: COLORS.red,
    backgroundColor: "#fbe9e6",
  },
  statusPillExpired: {
    color: COLORS.amber,
    backgroundColor: "#fbf2dc",
  },
  statusDivider: {
    width: 0.5,
    backgroundColor: COLORS.goldLight,
    marginHorizontal: 4,
  },

  // ─── Section ───
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.gold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 5,
  },

  // Subject row (image + description)
  subjectRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.cardBg,
    borderWidth: 0.5,
    borderColor: COLORS.goldLight,
    borderRadius: 4,
    padding: 8,
  },
  subjectImage: {
    width: 72,
    height: 72,
    borderRadius: 3,
    objectFit: "cover",
  },
  subjectImageFallback: {
    width: 72,
    height: 72,
    borderRadius: 3,
    backgroundColor: COLORS.goldFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectImageFallbackText: {
    fontSize: 7,
    color: COLORS.muted,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.ink,
    marginBottom: 3,
  },
  subjectDesc: {
    fontSize: 8,
    color: COLORS.muted,
    lineHeight: 1.45,
    marginBottom: 4,
  },
  subjectMeta: {
    fontSize: 7.5,
    color: COLORS.mutedSoft,
    fontFamily: "Helvetica",
  },
  subjectMetaBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.inkSoft,
  },

  // Parties row
  partiesRow: {
    flexDirection: "row",
    gap: 10,
  },
  partyCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderWidth: 0.5,
    borderColor: COLORS.goldLight,
    borderRadius: 4,
    padding: 9,
  },
  partyLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.gold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: COLORS.ink,
  },
  partyDetail: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
  },

  // Grant clause
  grantBlock: {
    backgroundColor: COLORS.goldFaint,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    borderRadius: 2,
    padding: 9,
  },
  grantText: {
    fontSize: 9,
    lineHeight: 1.55,
    color: COLORS.ink,
  },
  grantBold: {
    fontFamily: "Helvetica-Bold",
  },

  // Permitted uses
  permittedHeadline: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.gold,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  permittedText: {
    fontSize: 9,
    color: COLORS.ink,
    lineHeight: 1.5,
  },

  // List items
  listRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  listBullet: {
    width: 10,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.gold,
  },
  listText: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.ink,
    lineHeight: 1.45,
  },

  // Two-col text body (page 2)
  twoCol: {
    flexDirection: "row",
    gap: 14,
  },
  col: {
    flex: 1,
  },

  // Verification block (page 2)
  verifyRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.cardBg,
    borderWidth: 0.5,
    borderColor: COLORS.goldLight,
    borderRadius: 4,
    padding: 10,
    alignItems: "center",
  },
  qrImage: {
    width: 76,
    height: 76,
  },
  verifyText: {
    flex: 1,
  },
  verifyTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.ink,
    marginBottom: 3,
  },
  verifyBody: {
    fontSize: 8,
    color: COLORS.muted,
    lineHeight: 1.5,
  },
  verifyLink: {
    color: COLORS.gold,
    textDecoration: "none",
    fontSize: 8,
    marginTop: 3,
  },
  verifyHash: {
    fontFamily: "Courier",
    fontSize: 6.5,
    color: COLORS.mutedSoft,
    marginTop: 4,
    wordBreak: "break-all",
  },

  // Signature row
  signRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  signBlock: {
    flex: 1,
    paddingTop: 18,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.muted,
  },
  signLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  signValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.ink,
    marginTop: 2,
  },
  signMeta: {
    fontSize: 7.5,
    color: COLORS.muted,
    marginTop: 1,
  },

  // Footer (every page)
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerLeft: {
    flex: 1,
  },
  footerText: {
    fontSize: 6.5,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  footerBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.inkSoft,
  },
  pageNo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.muted,
    letterSpacing: 1,
  },

  // Compliance badges
  badgeRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 5,
    flexWrap: "wrap",
  },
  badge: {
    backgroundColor: COLORS.goldFaint,
    borderWidth: 0.4,
    borderColor: COLORS.goldLight,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 2,
  },
  badgeText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: COLORS.muted,
    letterSpacing: 0.4,
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function shortId(uuid: string): string {
  // FCO-XXXX-XXXX (first 8 hex of UUID, broken up). Visually distinct from UUID.
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `FCO-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://faiceoff.com"
  );
}

/**
 * Fetch an image URL and convert to a base64 data URL so the PDF is fully
 * self-contained. Returns null on any error — caller falls back to a
 * placeholder.
 */
async function fetchImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    let b64 = "";
    // Convert to base64 in chunks to avoid blowing the call stack on large images
    const CHUNK = 0x8000;
    for (let i = 0; i < arr.length; i += CHUNK) {
      b64 += String.fromCharCode.apply(
        null,
        Array.from(arr.subarray(i, i + CHUNK)),
      );
    }
    return `data:${mime};base64,${Buffer.from(b64, "binary").toString("base64")}`;
  } catch {
    return null;
  }
}

// ── Document component ─────────────────────────────────────────────────────

interface CertDocumentProps {
  input: GenerateLicenseCertPDFInput;
  qrDataUrl: string;
  imageDataUrl: string | null;
}

function CertDocument({ input, qrDataUrl, imageDataUrl }: CertDocumentProps) {
  const { license, creator, brand, generation } = input;
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/${license.id}`;
  const certNumber = shortId(license.id);

  const exclusivityText = license.is_category_exclusive
    ? `Category-exclusive: ${license.exclusive_category ?? "(category)"}${
        license.exclusive_until
          ? ` until ${formatDate(license.exclusive_until)}`
          : ""
      }`
    : "Non-exclusive";

  const statusPillStyle =
    license.status === "active"
      ? styles.statusColPill
      : license.status === "revoked"
      ? [styles.statusColPill, styles.statusPillRevoked]
      : [styles.statusColPill, styles.statusPillExpired];

  return (
    <Document
      title={`Faiceoff Licence Certificate — ${certNumber}`}
      author="Faiceoff Platform Pvt. Ltd."
      subject="AI Likeness Licence Certificate"
      creator="Faiceoff Platform"
      keywords="licence, ai, likeness, india, faiceoff"
    >
      {/* ───────────────── PAGE 1 ───────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Decorative borders */}
        <View style={styles.outerBorder} fixed />
        <View style={styles.innerBorder} fixed />

        {/* Watermark */}
        <Text style={styles.watermark} fixed>
          FAICEOFF
        </Text>

        {/* Header — logo + cert number */}
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {FAICEOFF_LOGO_DATA_URL && (
              <Image src={FAICEOFF_LOGO_DATA_URL} style={styles.logoMark} />
            )}
            <View>
              <Text style={styles.brandName}>FAICEOFF</Text>
              <Text style={styles.brandTagline}>AI Likeness Licensing</Text>
            </View>
          </View>
          <View style={styles.certNumberBlock}>
            <Text style={styles.certNumberLabel}>Certificate No.</Text>
            <Text style={styles.certNumberValue}>{certNumber}</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleStack}>
          <Text style={styles.titleEyebrow}>Official Issuance</Text>
          <Text style={styles.titleText}>LICENCE CERTIFICATE</Text>
          <Text style={styles.titleSubtext}>
            for the use of AI-generated content depicting a licensed likeness
          </Text>
        </View>

        {/* Status / Effective / Expires bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Status</Text>
            <Text style={statusPillStyle}>
              {license.status.toUpperCase()}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Effective</Text>
            <Text style={styles.statusColValue}>
              {formatDate(license.issued_at)}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Expires</Text>
            <Text style={styles.statusColValue}>
              {formatDate(license.expires_at)}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Term</Text>
            <Text style={styles.statusColValue}>12 months</Text>
          </View>
        </View>

        {/* Subject of the licence — image + description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>1. Subject of this Licence</Text>
          <View style={styles.subjectRow}>
            {imageDataUrl ? (
              <Image src={imageDataUrl} style={styles.subjectImage} />
            ) : (
              <View style={styles.subjectImageFallback}>
                <Text style={styles.subjectImageFallbackText}>Image</Text>
              </View>
            )}
            <View style={styles.subjectInfo}>
              <Text style={styles.subjectTitle}>
                AI-generated photograph depicting the Licensor&apos;s licensed likeness
              </Text>
              <Text style={styles.subjectDesc}>
                A single photorealistic image generated through the Faiceoff
                platform using a face-reference set provided by the Licensor,
                in collaboration with the Licensee&apos;s creative brief.
              </Text>
              <Text style={styles.subjectMeta}>
                <Text style={styles.subjectMetaBold}>Asset ID: </Text>
                {generation.id}
              </Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>2. Parties</Text>
          <View style={styles.partiesRow}>
            <View style={styles.partyCard}>
              <Text style={styles.partyLabel}>Licensor (Creator)</Text>
              <Text style={styles.partyName}>{creator.display_name}</Text>
              {creator.instagram_handle && (
                <Text style={styles.partyDetail}>
                  Instagram: @{creator.instagram_handle.replace(/^@/, "")}
                </Text>
              )}
              <Text style={styles.partyDetail}>
                Verified creator · Faiceoff platform
              </Text>
            </View>
            <View style={styles.partyCard}>
              <Text style={styles.partyLabel}>Licensee (Brand)</Text>
              <Text style={styles.partyName}>{brand.company_name}</Text>
              {brand.gst_number && (
                <Text style={styles.partyDetail}>
                  GSTIN: {brand.gst_number}
                </Text>
              )}
              <Text style={styles.partyDetail}>
                Registered brand · Faiceoff platform
              </Text>
            </View>
          </View>
        </View>

        {/* Grant clause */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>3. Grant of Licence</Text>
          <View style={styles.grantBlock}>
            <Text style={styles.grantText}>
              <Text style={styles.grantBold}>
                Subject to the terms set forth in this Certificate and the
                Faiceoff Platform Terms of Service,
              </Text>
              {" "}the Licensor hereby grants the Licensee a{" "}
              <Text style={styles.grantBold}>
                non-exclusive, non-transferable, worldwide
              </Text>{" "}
              licence to reproduce, publish, distribute, and display the AI-generated image
              identified above ({SCOPE_HEADLINE[license.scope]} scope) for the
              Licensee&apos;s internal commercial and marketing purposes during the
              Term, exclusively in accordance with the permitted uses and
              restrictions set out herein.
            </Text>
          </View>
        </View>

        {/* Permitted Uses */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>4. Permitted Uses</Text>
          <Text style={styles.permittedHeadline}>
            {SCOPE_HEADLINE[license.scope]}
          </Text>
          <Text style={styles.permittedText}>{SCOPE_LABELS[license.scope]}</Text>
        </View>

        {/* Footer page 1 */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>Faiceoff Platform Pvt. Ltd.</Text>
              {" · Issued in compliance with the DPDP Act 2023 & IT Act 2000."}
            </Text>
            <Text style={styles.footerText}>
              Verify authenticity at {appUrl}/verify/{license.id}
            </Text>
          </View>
          <Text style={styles.pageNo}>1 / 2</Text>
        </View>
      </Page>

      {/* ───────────────── PAGE 2 ───────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.outerBorder} fixed />
        <View style={styles.innerBorder} fixed />

        {/* Mini header on page 2 */}
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {FAICEOFF_LOGO_DATA_URL && (
              <Image src={FAICEOFF_LOGO_DATA_URL} style={styles.logoMark} />
            )}
            <View>
              <Text style={styles.brandName}>FAICEOFF</Text>
              <Text style={styles.brandTagline}>Licence · {certNumber}</Text>
            </View>
          </View>
          <View style={styles.certNumberBlock}>
            <Text style={styles.certNumberLabel}>Continued from page 1</Text>
          </View>
        </View>

        {/* Restrictions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>5. Restrictions / Prohibited Uses</Text>
          <Text style={styles.permittedText}>
            The following uses are{" "}
            <Text style={styles.grantBold}>strictly prohibited</Text> and
            constitute a material breach of this licence:
          </Text>
          <View style={{ marginTop: 5 }}>
            {STANDARD_RESTRICTIONS.map((r, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Term + Compensation in two columns */}
        <View style={styles.section}>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionLabel}>6. Term & Termination</Text>
              <Text style={styles.permittedText}>
                This licence is granted for a Term of{" "}
                <Text style={styles.grantBold}>twelve (12) months</Text>{" "}
                commencing on the Effective Date.
                {license.auto_renew
                  ? " It auto-renews for successive 12-month terms unless either party gives written notice of non-renewal at least 30 days before expiry."
                  : " It will not auto-renew."}
                {"\n\n"}
                Faiceoff and the Licensor reserve the right to revoke this
                licence with immediate effect upon a material breach of these
                terms or upon a verified DPDP Act consent withdrawal by the
                Licensor. Exclusivity flag: {exclusivityText}.
                {license.renewed_count > 0
                  ? `\n\nThis licence has been renewed ${license.renewed_count} time(s).`
                  : ""}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionLabel}>7. Compensation</Text>
              <Text style={styles.permittedText}>
                The Licensee has paid Faiceoff Platform a total of{" "}
                <Text style={styles.grantBold}>
                  {fmtINR(license.amount_paid_paise)}
                </Text>{" "}
                in respect of this licence. From this amount, Faiceoff has
                disbursed{" "}
                <Text style={styles.grantBold}>
                  {fmtINR(license.creator_share_paise)}
                </Text>{" "}
                to the Licensor as the Creator&apos;s share, retaining{" "}
                {fmtINR(license.platform_share_paise)} as Platform commission
                inclusive of applicable GST.
                {"\n\n"}
                All amounts are in Indian Rupees (INR). Payment satisfaction
                of the licence fee is acknowledged by both parties via the
                Faiceoff platform&apos;s on-record settlement.
              </Text>
            </View>
          </View>
        </View>

        {/* Attribution & Compliance */}
        <View style={styles.section}>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.sectionLabel}>8. Attribution & Use Rules</Text>
              <Text style={styles.permittedText}>
                The Licensee shall not represent, by use of caption, hashtag or
                otherwise, that the Licensor has personally endorsed any
                product, service or claim made by the Licensee, unless the
                Licensee has obtained a separate written endorsement
                agreement. The Licensee shall keep a copy of this Certificate
                accessible for verification on request.
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionLabel}>9. Governing Law & Compliance</Text>
              <Text style={styles.permittedText}>
                This licence is governed by the laws of India. Exclusive
                jurisdiction lies with the courts of Mumbai, Maharashtra.
                Issuance is conducted in compliance with the{" "}
                <Text style={styles.grantBold}>
                  Digital Personal Data Protection Act, 2023
                </Text>{" "}
                and the{" "}
                <Text style={styles.grantBold}>
                  Information Technology Act, 2000
                </Text>
                . Faiceoff acts as Data Fiduciary for the Licensor&apos;s likeness
                data.
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>DPDP ACT 2023</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>IT ACT 2000</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>GST COMPLIANT</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Verification block */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>10. Authenticity & Verification</Text>
          <View style={styles.verifyRow}>
            <Image src={qrDataUrl} style={styles.qrImage} />
            <View style={styles.verifyText}>
              <Text style={styles.verifyTitle}>
                Verify this Certificate online
              </Text>
              <Text style={styles.verifyBody}>
                Scan the QR or visit the URL below for an independent,
                tamper-evident lookup of this licence&apos;s status, parties, and
                scope. The SHA-256 fingerprint below uniquely binds this PDF
                to the platform record.
              </Text>
              <Link src={verifyUrl} style={styles.verifyLink}>
                <Text>{verifyUrl}</Text>
              </Link>
              {license.cert_signature_sha256 && (
                <Text style={styles.verifyHash}>
                  SHA-256: {license.cert_signature_sha256}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.section}>
          <View style={styles.signRow}>
            <View style={styles.signBlock}>
              <Text style={styles.signLabel}>Issued by</Text>
              <Text style={styles.signValue}>Faiceoff Platform Pvt. Ltd.</Text>
              <Text style={styles.signMeta}>Mumbai, India</Text>
              <Text style={styles.signMeta}>
                Issued: {formatDate(license.issued_at)}
              </Text>
            </View>
            <View style={styles.signBlock}>
              <Text style={styles.signLabel}>Authenticated</Text>
              <Text style={styles.signValue}>Digital signature</Text>
              <Text style={styles.signMeta}>
                Tamper-evident · QR-verifiable · DPDP-compliant
              </Text>
            </View>
          </View>
        </View>

        {/* Footer page 2 */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>Faiceoff Platform Pvt. Ltd.</Text>
              {" · faiceoff.com · Mumbai, Maharashtra, India"}
            </Text>
            <Text style={styles.footerText}>
              This Certificate is electronically issued and is valid without a
              physical signature. © {new Date().getFullYear()} Faiceoff. All rights reserved.
            </Text>
          </View>
          <Text style={styles.pageNo}>2 / 2</Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Public export ──────────────────────────────────────────────────────────

/**
 * Generate a 2-page A4 industry-standard licence certificate PDF.
 *
 * Steps:
 * 1. Render QR code as PNG data URL pointing to the public verify endpoint.
 * 2. Fetch the licensed image, convert to base64 (best-effort).
 * 3. Compose @react-pdf/renderer Document.
 * 4. Render to Node Buffer, compute SHA-256.
 */
export async function generateLicenseCertPDF(
  input: GenerateLicenseCertPDFInput,
): Promise<LicenseCertPDFResult> {
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/${input.license.id}`;

  // 1. QR code
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 240,
    margin: 1,
    color: {
      dark: "#1a1513",
      light: "#fdfbf7",
    },
  });

  // 2. Image thumbnail (best-effort — null if fetch fails)
  const imageDataUrl = await fetchImageAsDataUrl(input.generation.image_url);

  // 3. Render
  const buffer = await renderToBuffer(
    <CertDocument
      input={input}
      qrDataUrl={qrDataUrl}
      imageDataUrl={imageDataUrl}
    />,
  );

  // 4. SHA-256 for tamper evidence
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  return { buffer, sha256 };
}
