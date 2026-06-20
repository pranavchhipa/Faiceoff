/**
 * Collaboration Agreement PDF generator — industry-grade master agreement.
 *
 * A multi-page A4 legal document, dual e-signed, following commercial
 * licensing conventions. Shares the "Hybrid Soft Luxe" cream/gold styling with
 * the per-image Licence Certificate (`src/lib/licenses/cert-pdf.tsx`) so the
 * two documents read as one family.
 *
 * Content flows across pages automatically (react-pdf auto-pagination); the
 * decorative border, watermark, and footer are `fixed` so they repeat on every
 * page. Legal prose lives in `clauses.ts`; per-collab values come from `terms`.
 *
 * Tamper evidence: SHA-256 of the rendered buffer + a QR code linking to the
 * public verify endpoint.
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

import {
  AGREEMENT_VERSION,
  PLATFORM_ENTITY,
  GRANT_BODY,
  APPROVAL_BODY,
  EXCLUSIVITY_BODY,
  RESTRICTIONS,
  CREATOR_REPS,
  BRAND_REPS,
  IP_BODY,
  CONFIDENTIALITY_BODY,
  INDEMNITY_BODY,
  DPDP_BODY,
  TERMINATION_BODY,
  GOVERNING_LAW_BODY,
  EXECUTION_NOTE,
} from "./clauses";
import type {
  GenerateAgreementPDFInput,
  AgreementPDFResult,
} from "./types";

// ── Brand asset (loaded once) ────────────────────────────────────────────────

const FAICEOFF_LOGO_DATA_URL: string | null = (() => {
  try {
    const p = path.join(process.cwd(), "public", "logo-mark.png");
    const buf = fs.readFileSync(p);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

// ── Constants ────────────────────────────────────────────────────────────────

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

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 46,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.ink,
    lineHeight: 1.5,
  },

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
  watermark: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 64,
    color: COLORS.goldFaint,
    opacity: 0.5,
    letterSpacing: 10,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark: { width: 26, height: 26 },
  brandName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLORS.ink,
    letterSpacing: 0.6,
  },
  brandTagline: {
    fontSize: 6,
    color: COLORS.muted,
    letterSpacing: 1.3,
    marginTop: 1,
    textTransform: "uppercase",
  },
  certNumberBlock: { alignItems: "flex-end" },
  certNumberLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.muted,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  certNumberValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.ink,
    marginTop: 1,
  },

  // Title
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
    fontSize: 21,
    color: COLORS.ink,
    letterSpacing: 1.4,
    textAlign: "center",
  },
  titleSubtext: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 5,
    textAlign: "center",
  },

  // Status / dates bar
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  statusCol: { flex: 1, alignItems: "center" },
  statusColLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.muted,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  statusColValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.ink,
    marginTop: 2,
    textAlign: "center",
  },
  statusColPill: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.emerald,
    backgroundColor: "#e6f4ee",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    marginTop: 2,
  },
  statusPillPending: { color: COLORS.amber, backgroundColor: "#fbf2dc" },
  statusPillCancelled: { color: COLORS.red, backgroundColor: "#fbe9e6" },
  statusDivider: {
    width: 0.5,
    backgroundColor: COLORS.goldLight,
    marginHorizontal: 4,
  },

  // Section
  section: { marginBottom: 13 },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  bodyText: { fontSize: 9, color: COLORS.ink, lineHeight: 1.55 },

  // Parties
  partiesRow: { flexDirection: "row", gap: 10 },
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
    fontSize: 6,
    color: COLORS.gold,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: COLORS.ink,
  },
  partyDetail: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },

  // Engagement summary grid
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: COLORS.cardBg,
    borderWidth: 0.5,
    borderColor: COLORS.goldLight,
    borderRadius: 4,
    padding: 4,
  },
  summaryCell: { width: "50%", padding: 6 },
  summaryCellLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryCellValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.ink,
    marginTop: 2,
  },
  summaryCellSub: { fontSize: 7.5, color: COLORS.muted, marginTop: 1 },

  // Grant / highlighted block
  grantBlock: {
    backgroundColor: COLORS.goldFaint,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    borderRadius: 2,
    padding: 9,
  },

  // Fees table
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.goldLight,
  },
  feeRowLast: { borderBottomWidth: 0 },
  feeLabel: { fontSize: 9, color: COLORS.inkSoft },
  feeValue: { fontFamily: "Helvetica-Bold", fontSize: 9, color: COLORS.ink },
  feeTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.gold,
  },
  feeTotalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.ink,
  },
  feeTotalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLORS.ink,
  },

  // List items
  listRow: { flexDirection: "row", marginBottom: 3.5 },
  listBullet: {
    width: 12,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.gold,
  },
  listText: { flex: 1, fontSize: 8.5, color: COLORS.ink, lineHeight: 1.5 },

  // Two-col
  twoCol: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },

  // Verification
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
  qrImage: { width: 74, height: 74 },
  verifyText: { flex: 1 },
  verifyTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.ink,
    marginBottom: 3,
  },
  verifyBody: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.5 },
  verifyLink: {
    color: COLORS.gold,
    textDecoration: "none",
    fontSize: 7.5,
    marginTop: 3,
  },
  verifyHash: {
    // No monospace anywhere in Faiceoff — Helvetica keeps the hash readable
    // without a typewriter face. (Project HARD RULE.)
    fontFamily: "Helvetica",
    fontSize: 6,
    color: COLORS.mutedSoft,
    marginTop: 4,
  },

  // Signatures
  signRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  signBlock: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderWidth: 0.5,
    borderColor: COLORS.goldLight,
    borderRadius: 4,
    padding: 10,
  },
  signLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.gold,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  signName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLORS.ink,
  },
  signMeta: { fontSize: 7, color: COLORS.muted, marginTop: 2 },
  signPending: { fontSize: 7.5, color: COLORS.amber, marginTop: 2, fontFamily: "Helvetica-Bold" },

  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerLeft: { flex: 1 },
  footerText: { fontSize: 6, color: COLORS.muted, lineHeight: 1.4 },
  footerBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.inkSoft,
  },
  pageNo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.muted,
    letterSpacing: 1,
  },

  badgeRow: { flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" },
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
    fontSize: 6,
    color: COLORS.muted,
    letterSpacing: 0.4,
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso)) + " IST";
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

function agreementNumber(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `FCA-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://faiceoff.com"
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionLabel}>{n}. {title}</Text>
      {children}
    </View>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View style={{ marginTop: 3 }}>
      {items.map((it, i) => (
        <View key={i} style={styles.listRow}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Document ─────────────────────────────────────────────────────────────────

interface DocProps {
  input: GenerateAgreementPDFInput;
  qrDataUrl: string;
}

function AgreementDocument({ input, qrDataUrl }: DocProps) {
  const { agreement, terms, creator, brand } = input;
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/agreement/${agreement.id}`;
  const number = agreementNumber(agreement.id);

  const effectiveDate = agreement.brand_signed_at ?? agreement.creator_signed_at;
  const statusPillStyle =
    agreement.status === "active"
      ? styles.statusColPill
      : agreement.status === "cancelled"
        ? [styles.statusColPill, styles.statusPillCancelled]
        : [styles.statusColPill, styles.statusPillPending];
  const statusLabel =
    agreement.status === "active"
      ? "EXECUTED"
      : agreement.status === "cancelled"
        ? "CANCELLED"
        : "PENDING";

  const summary: { label: string; value: string; sub?: string }[] = [
    { label: "Product / Campaign", value: terms.product_name },
    { label: "Package", value: `${terms.tier_label}`, sub: `${terms.final_images} final image${terms.final_images !== 1 ? "s" : ""} · ${terms.generation_credits} generation credits` },
    { label: "Usage scope", value: terms.usage_label, sub: terms.usage_description },
    { label: "Licence term", value: terms.term_label, sub: "from the effective date of each issued certificate" },
  ];

  return (
    <Document
      title={`Faiceoff Collaboration Agreement — ${number}`}
      author={PLATFORM_ENTITY}
      subject="AI Likeness Collaboration Agreement"
      creator="Faiceoff Platform"
      keywords="collaboration, agreement, ai, likeness, india, faiceoff"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Fixed decoration — repeats on every auto-paginated page */}
        <View style={styles.outerBorder} fixed />
        <View style={styles.innerBorder} fixed />
        <Text style={styles.watermark} fixed>FAICEOFF</Text>

        {/* Header */}
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
            <Text style={styles.certNumberLabel}>Agreement No.</Text>
            <Text style={styles.certNumberValue}>{number}</Text>
            <Text style={[styles.certNumberLabel, { marginTop: 3 }]}>Version {AGREEMENT_VERSION}</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleStack}>
          <Text style={styles.titleEyebrow}>Master Engagement</Text>
          <Text style={styles.titleText}>COLLABORATION AGREEMENT</Text>
          <Text style={styles.titleSubtext}>
            between a Creator (Licensor) and a Brand (Licensee), facilitated by Faiceoff
          </Text>
        </View>

        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Status</Text>
            <Text style={statusPillStyle}>{statusLabel}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Effective</Text>
            <Text style={styles.statusColValue}>{formatDate(effectiveDate)}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>Licence term</Text>
            <Text style={styles.statusColValue}>{terms.term_label}</Text>
          </View>
        </View>

        {/* 1. Parties */}
        <Clause n={1} title="Parties">
          <View style={styles.partiesRow}>
            <View style={styles.partyCard}>
              <Text style={styles.partyLabel}>Creator (Licensor)</Text>
              <Text style={styles.partyName}>{creator.display_name}</Text>
              {creator.instagram_handle && (
                <Text style={styles.partyDetail}>Instagram: @{creator.instagram_handle.replace(/^@/, "")}</Text>
              )}
              <Text style={styles.partyDetail}>Verified creator · Faiceoff platform</Text>
            </View>
            <View style={styles.partyCard}>
              <Text style={styles.partyLabel}>Brand (Licensee)</Text>
              <Text style={styles.partyName}>{brand.company_name}</Text>
              {brand.gst_number && (
                <Text style={styles.partyDetail}>GSTIN: {brand.gst_number}</Text>
              )}
              <Text style={styles.partyDetail}>Registered brand · Faiceoff platform</Text>
            </View>
          </View>
          <Text style={[styles.partyDetail, { marginTop: 6, textAlign: "center" }]}>
            Facilitated by {PLATFORM_ENTITY} (&ldquo;Faiceoff&rdquo;), operating the Faiceoff platform.
          </Text>
        </Clause>

        {/* 2. Engagement summary */}
        <Clause n={2} title="Engagement Summary">
          <View style={styles.summaryGrid}>
            {summary.map((s) => (
              <View key={s.label} style={styles.summaryCell}>
                <Text style={styles.summaryCellLabel}>{s.label}</Text>
                <Text style={styles.summaryCellValue}>{s.value}</Text>
                {s.sub && <Text style={styles.summaryCellSub}>{s.sub}</Text>}
              </View>
            ))}
          </View>
        </Clause>

        {/* 3. Grant */}
        <Clause n={3} title="Grant of Likeness Rights">
          <View style={styles.grantBlock}>
            <Text style={styles.bodyText}>{GRANT_BODY}</Text>
          </View>
        </Clause>

        {/* 4. Approval control */}
        <Clause n={4} title="Creator Approval Control">
          <Text style={styles.bodyText}>{APPROVAL_BODY}</Text>
        </Clause>

        {/* 5. Fees, escrow & payout */}
        <Clause n={5} title="Fees, Escrow & Payout">
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Creator&apos;s share (released from escrow on completion)</Text>
            <Text style={styles.feeValue}>{fmtINR(terms.creator_share_paise)}</Text>
          </View>
          <View style={[styles.feeRow, styles.feeRowLast]}>
            <Text style={styles.feeLabel}>Platform commission ({terms.platform_commission_pct}%, incl. applicable GST)</Text>
            <Text style={styles.feeValue}>{fmtINR(terms.platform_share_paise)}</Text>
          </View>
          <View style={styles.feeTotalRow}>
            <Text style={styles.feeTotalLabel}>Total paid by the Brand</Text>
            <Text style={styles.feeTotalValue}>{fmtINR(terms.package_price_paise)}</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 6 }]}>
            The Brand pays the total above to Faiceoff, which holds the funds in escrow. The Creator&apos;s
            share is released from escrow only after the corresponding deliverables are approved and the
            collaboration completes, and is paid out to the Creator&apos;s verified bank account subject to
            completed KYC. All amounts are in Indian Rupees (INR) and recorded on the Faiceoff platform.
          </Text>
        </Clause>

        {/* 6. Term & renewal */}
        <Clause n={6} title="Term & Renewal">
          <Text style={styles.bodyText}>
            Each approved image is licensed for a term of {terms.term_label} from the effective date stated
            on its Licence Certificate. This Agreement governs all such licences issued under this
            collaboration. Licences do not renew automatically unless the parties expressly agree to a
            renewal on the platform.
          </Text>
        </Clause>

        {/* 7. Exclusivity */}
        <Clause n={7} title="Exclusivity">
          <Text style={styles.bodyText}>{EXCLUSIVITY_BODY}</Text>
        </Clause>

        {/* 8. Restrictions */}
        <Clause n={8} title="Restrictions / Prohibited Uses">
          <Text style={styles.bodyText}>
            The following uses are strictly prohibited and constitute a material breach of this Agreement:
          </Text>
          <BulletList items={RESTRICTIONS} />
        </Clause>

        {/* 9. Representations & warranties */}
        <Clause n={9} title="Representations & Warranties">
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={[styles.partyLabel, { marginBottom: 3 }]}>The Creator warrants</Text>
              <BulletList items={CREATOR_REPS} />
            </View>
            <View style={styles.col}>
              <Text style={[styles.partyLabel, { marginBottom: 3 }]}>The Brand warrants</Text>
              <BulletList items={BRAND_REPS} />
            </View>
          </View>
        </Clause>

        {/* 10. IP */}
        <Clause n={10} title="Intellectual Property & Ownership">
          <Text style={styles.bodyText}>{IP_BODY}</Text>
        </Clause>

        {/* 11. Confidentiality */}
        <Clause n={11} title="Confidentiality">
          <Text style={styles.bodyText}>{CONFIDENTIALITY_BODY}</Text>
        </Clause>

        {/* 12. Indemnity */}
        <Clause n={12} title="Indemnity & Limitation of Liability">
          <Text style={styles.bodyText}>{INDEMNITY_BODY}</Text>
        </Clause>

        {/* 13. DPDP */}
        <Clause n={13} title="Data Protection & Consent (DPDP Act 2023)">
          <Text style={styles.bodyText}>{DPDP_BODY}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}><Text style={styles.badgeText}>DPDP ACT 2023</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>IT ACT 2000</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>GST COMPLIANT</Text></View>
          </View>
        </Clause>

        {/* 14. Termination */}
        <Clause n={14} title="Termination & Revocation">
          <Text style={styles.bodyText}>{TERMINATION_BODY}</Text>
        </Clause>

        {/* 15. Governing law */}
        <Clause n={15} title="Governing Law & Jurisdiction">
          <Text style={styles.bodyText}>{GOVERNING_LAW_BODY}</Text>
        </Clause>

        {/* 16. Signatures */}
        <Clause n={16} title="Electronic Signatures">
          <Text style={[styles.bodyText, { marginBottom: 8 }]}>{EXECUTION_NOTE}</Text>
          <View style={styles.signRow}>
            <View style={styles.signBlock}>
              <Text style={styles.signLabel}>Signed — Creator (Licensor)</Text>
              {agreement.creator_signed_name ? (
                <>
                  <Text style={styles.signName}>{agreement.creator_signed_name}</Text>
                  <Text style={styles.signMeta}>On {formatDateTime(agreement.creator_signed_at)}</Text>
                  {agreement.creator_signed_ip && (
                    <Text style={styles.signMeta}>IP {agreement.creator_signed_ip}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.signPending}>Awaiting signature</Text>
              )}
            </View>
            <View style={styles.signBlock}>
              <Text style={styles.signLabel}>Signed — Brand (Licensee)</Text>
              {agreement.brand_signed_name ? (
                <>
                  <Text style={styles.signName}>{agreement.brand_signed_name}</Text>
                  <Text style={styles.signMeta}>On {formatDateTime(agreement.brand_signed_at)}</Text>
                  {agreement.brand_signed_ip && (
                    <Text style={styles.signMeta}>IP {agreement.brand_signed_ip}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.signPending}>Awaiting signature</Text>
              )}
            </View>
          </View>
        </Clause>

        {/* Verification */}
        <Clause n={17} title="Authenticity & Verification">
          <View style={styles.verifyRow}>
            <Image src={qrDataUrl} style={styles.qrImage} />
            <View style={styles.verifyText}>
              <Text style={styles.verifyTitle}>Verify this Agreement online</Text>
              <Text style={styles.verifyBody}>
                Scan the QR or visit the URL below for an independent, tamper-evident lookup of this
                Agreement&apos;s status, parties, and signing dates. The SHA-256 fingerprint uniquely binds
                this PDF to the platform record.
              </Text>
              <Link src={verifyUrl} style={styles.verifyLink}>
                <Text>{verifyUrl}</Text>
              </Link>
              {agreement.pdf_sha256 && (
                <Text style={styles.verifyHash}>SHA-256: {agreement.pdf_sha256}</Text>
              )}
            </View>
          </View>
        </Clause>

        {/* Footer — fixed, real page numbers */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>{PLATFORM_ENTITY}</Text>
              {" · Collaboration Agreement "}{number}{" · faiceoff.com"}
            </Text>
            <Text style={styles.footerText}>
              Electronically executed — valid under Section 10A, IT Act 2000. Verify at {appUrl}/verify/agreement/{agreement.id}
            </Text>
          </View>
          <Text
            style={styles.pageNo}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

/**
 * Generate the multi-page Collaboration Agreement PDF.
 *
 * 1. Render QR code pointing at the public verify endpoint.
 * 2. Compose the @react-pdf Document (auto-paginated).
 * 3. Render to a Node Buffer + compute SHA-256.
 *
 * Note: `agreement.pdf_sha256` is shown on the PDF only if already set. Callers
 * that want the hash printed should render once, persist the returned sha256,
 * then it appears on the verify page (the binding is the buffer hash either way).
 */
export async function generateCollabAgreementPDF(
  input: GenerateAgreementPDFInput,
): Promise<AgreementPDFResult> {
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/agreement/${input.agreement.id}`;

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 240,
    margin: 1,
    color: { dark: "#1a1513", light: "#fdfbf7" },
  });

  const buffer = await renderToBuffer(
    <AgreementDocument input={input} qrDataUrl={qrDataUrl} />,
  );

  const sha256 = createHash("sha256").update(buffer).digest("hex");

  return { buffer, sha256 };
}
