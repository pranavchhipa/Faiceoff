/**
 * License certificate PDF generator using @react-pdf/renderer.
 *
 * Generates a professional one-page A4 certificate for each issued license.
 * Includes a QR code pointing to the public verify URL for tamper evidence.
 *
 * Hash: SHA-256 of the rendered buffer — stored alongside the cert for
 * integrity verification ("cert_signature_sha256" on the licenses row).
 *
 * Design language: "Hybrid Soft Luxe v2" — gold accent, paper-white bg.
 * Using Helvetica (built-in PDF font) — Outfit/Jakarta require TTF embedding.
 */

import React from "react";
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

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  paper: "#fdfbf7",
  ink: "#1a1513",
  gold: "#c9a96e",
  goldLight: "#e5d9c2",
  muted: "#6b5e52",
  cardBg: "#faf7f2",
} as const;

const SCOPE_LABELS: Record<LicenseScope, string> = {
  digital: "Digital media (websites, social, online ads)",
  digital_print: "Digital + Print media (brochures, posters, billboards)",
  digital_print_packaging: "Digital + Print + Product packaging",
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.ink,
  },
  outerBorder: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderStyle: "solid",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 16,
  },
  titleText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  subtitleText: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 3,
  },
  qrBlock: {
    alignItems: "center",
    width: 90,
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  qrCaption: {
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 3,
  },
  goldDivider: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
    marginBottom: 10,
  },
  metaTable: {
    marginBottom: 12,
    flex: 1,
    paddingRight: 16,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.muted,
    width: 82,
  },
  metaValue: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: COLORS.ink,
    flex: 1,
  },
  metaValueBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.ink,
    flex: 1,
    textTransform: "capitalize",
  },
  metaAndQrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.goldLight,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 10,
  },
  cardFull: {
    flex: 1,
  },
  cardHalf: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.gold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.goldLight,
    paddingBottom: 3,
  },
  cardBodyText: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.ink,
    lineHeight: 1.5,
  },
  cardBodyBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.ink,
    marginBottom: 2,
  },
  cardBodyMuted: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
  },
  verifyLink: {
    color: COLORS.gold,
    textDecoration: "none",
    fontSize: 8.5,
  },
  footer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.goldLight,
  },
  footerText: {
    fontFamily: "Helvetica",
    fontSize: 7,
    color: COLORS.muted,
    lineHeight: 1.6,
    marginBottom: 3,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  badge: {
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: COLORS.muted,
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format ISO timestamp as human-readable IST date. */
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

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://faiceoff.in"
  );
}

// ── Document component ─────────────────────────────────────────────────────

interface CertDocumentProps {
  input: GenerateLicenseCertPDFInput;
  qrDataUrl: string;
}

function CertDocument({ input, qrDataUrl }: CertDocumentProps) {
  const { license, creator, brand, generation } = input;
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/${license.id}`;

  const exclusivityText = license.is_category_exclusive
    ? `Category-exclusive: ${license.exclusive_category ?? "(category)"}${
        license.exclusive_until
          ? ` until ${formatDate(license.exclusive_until)}`
          : ""
      }`
    : "None";

  return (
    <Document
      title={`Faiceoff License Certificate — ${license.id}`}
      author="Faiceoff Platform"
      subject="AI Likeness License Certificate"
      creator="Faiceoff Platform Pvt. Ltd."
    >
      <Page size="A4" style={styles.page}>
        {/* Decorative gold border (absolute, fixed) */}
        <View style={styles.outerBorder} fixed />

        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.titleText}>FAICEOFF LICENSE CERTIFICATE</Text>
            <Text style={styles.subtitleText}>
              AI Likeness Licensing · Faiceoff Platform Pvt. Ltd.
            </Text>
          </View>
          <View style={styles.qrBlock}>
            <Image src={qrDataUrl} style={styles.qrImage} />
            <Text style={styles.qrCaption}>Scan to verify</Text>
          </View>
        </View>

        {/* Gold accent divider */}
        <View style={styles.goldDivider} />

        {/* ── License metadata ── */}
        <View style={styles.metaAndQrRow}>
          <View style={styles.metaTable}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>License ID</Text>
              <Text style={styles.metaValue}>{license.id.toUpperCase()}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issued</Text>
              <Text style={styles.metaValue}>{formatDate(license.issued_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Expires</Text>
              <Text style={styles.metaValue}>{formatDate(license.expires_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValueBold}>{license.status}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Generation ID</Text>
              <Text style={styles.metaValue}>{generation.id}</Text>
            </View>
          </View>
        </View>

        {/* ── Party cards row ── */}
        <View style={styles.sectionRow}>
          {/* Licensor (Creator) */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardTitle}>Licensor (Creator)</Text>
            <Text style={styles.cardBodyBold}>{creator.display_name}</Text>
            {creator.instagram_handle ? (
              <Text style={styles.cardBodyMuted}>
                @{creator.instagram_handle.replace(/^@/, "")}
              </Text>
            ) : null}
          </View>

          {/* Licensee (Brand) */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardTitle}>Licensee (Brand)</Text>
            <Text style={styles.cardBodyBold}>{brand.company_name}</Text>
            {brand.gst_number ? (
              <Text style={styles.cardBodyMuted}>GSTIN: {brand.gst_number}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Scope ── */}
        <View style={styles.sectionRow}>
          <View style={[styles.card, styles.cardFull]}>
            <Text style={styles.cardTitle}>License Scope</Text>
            <Text style={styles.cardBodyBold}>
              {license.scope.replace(/_/g, " + ").toUpperCase()}
            </Text>
            <Text style={styles.cardBodyText}>
              {SCOPE_LABELS[license.scope]}
            </Text>
          </View>
        </View>

        {/* ── Exclusivity + Term row ── */}
        <View style={styles.sectionRow}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardTitle}>Exclusivity</Text>
            <Text style={styles.cardBodyText}>{exclusivityText}</Text>
          </View>

          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardTitle}>Term</Text>
            <Text style={styles.cardBodyText}>
              12 months{"\n"}
              From: {formatDate(license.issued_at)}{"\n"}
              To:     {formatDate(license.expires_at)}
            </Text>
            {license.renewed_count > 0 ? (
              <Text style={styles.cardBodyMuted}>
                Renewed {license.renewed_count}x
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Verification ── */}
        <View style={styles.sectionRow}>
          <View style={[styles.card, styles.cardFull]}>
            <Text style={styles.cardTitle}>Verification</Text>
            <Text style={styles.cardBodyText}>
              This certificate can be independently verified at:
            </Text>
            <Link src={verifyUrl} style={styles.verifyLink}>
              <Text>{verifyUrl}</Text>
            </Link>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {"This license grants the Licensee permission to use the AI-generated content depicting the Licensor's likeness as specified above. This is a non-exclusive, non-transferable license for the scope stated. Subject to Faiceoff Terms of Service. Verify at "}{verifyUrl}
          </Text>
          <Text style={styles.footerText}>
            Processed in compliance with the Digital Personal Data Protection Act 2023 (DPDP Act) and the Information
            Technology Act 2000. Faiceoff acts as Data Fiduciary for creator likeness data. Governing law: Laws of India.
            Exclusive jurisdiction: Mumbai, Maharashtra.
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>DPDP Act 2023</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>IT Act 2000</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Faiceoff Platform Pvt. Ltd.</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ── Public export ──────────────────────────────────────────────────────────

/**
 * Generate a professional A4 license certificate PDF.
 *
 * Steps:
 * 1. Render QR code as PNG data URL pointing to the public verify endpoint.
 * 2. Compose @react-pdf/renderer Document with all license fields.
 * 3. Render to Node Buffer.
 * 4. Compute SHA-256 for tamper detection.
 *
 * @param input - License, creator, brand, and generation data.
 * @returns `{ buffer, sha256 }` — buffer is the raw PDF bytes; sha256 is the
 * hex-encoded SHA-256 hash to store in `licenses.cert_signature_sha256`.
 */
export async function generateLicenseCertPDF(
  input: GenerateLicenseCertPDFInput,
): Promise<LicenseCertPDFResult> {
  const appUrl = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify/${input.license.id}`;

  // 1. QR code as PNG data URL (base64-encoded)
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 120,
    margin: 1,
    color: {
      dark: "#1a1513",
      light: "#fdfbf7",
    },
  });

  // 2. Render document to buffer
  const buffer = await renderToBuffer(
    <CertDocument input={input} qrDataUrl={qrDataUrl} />,
  );

  // 3. SHA-256 for tamper detection
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  return { buffer, sha256 };
}
