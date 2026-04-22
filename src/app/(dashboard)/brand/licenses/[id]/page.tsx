"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  User,
  Building2,
  Calendar,
  ExternalLink,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface LicenseDetail {
  id: string;
  generation_id: string;
  brand_name: string | null;
  creator_name: string | null;
  scope: string | string[] | null;
  exclusive: boolean;
  issued_at: string;
  expires_at: string;
  status: "active" | "expired" | "revoked";
  auto_renew: boolean;
  cert_url: string | null;
}

/* ── Helpers ── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntilExpiry(expiresAt: string): number {
  const now = new Date().getTime();
  const exp = new Date(expiresAt).getTime();
  return Math.floor((exp - now) / (1000 * 60 * 60 * 24));
}

function getScopeArray(scope: string | string[] | null): string[] {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope;
  try {
    const parsed = JSON.parse(scope);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return [scope];
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: "Active", bg: "bg-[var(--color-mint)]", text: "text-green-700" },
  expired: { label: "Expired", bg: "bg-[var(--color-blush)]", text: "text-red-700" },
  revoked: { label: "Revoked", bg: "bg-[var(--color-neutral-100)]", text: "text-[var(--color-neutral-600)]" },
};

/* ── Auto-renew toggle ── */

function AutoRenewToggle({
  licenseId,
  initialValue,
}: {
  licenseId: string;
  initialValue: boolean;
}) {
  const [enabled, setEnabled] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/licenses/${licenseId}/auto-renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.auto_renew ?? !enabled);
      }
    } catch (err) {
      console.error("Auto-renew toggle error:", err);
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-600 text-[var(--color-ink)]">
        Auto-renew
      </span>
      <button
        onClick={toggle}
        disabled={loading}
        title={enabled ? "Disable auto-renew" : "Enable auto-renew"}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)] disabled:opacity-50 ${
          enabled ? "bg-[var(--color-accent-gold)]" : "bg-[var(--color-neutral-300)]"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-xs text-[var(--color-neutral-500)]">
        {enabled ? "On" : "Off"}
      </span>
    </div>
  );
}

/* ── Component ── */

export default function LicenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [license, setLicense] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    async function fetchLicense() {
      setLoading(true);
      try {
        const res = await fetch(`/api/licenses/${id}`);
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setLicense(data.license ?? data);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }

    fetchLicense();
  }, [id]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6 h-5 w-40 animate-pulse rounded bg-[var(--color-neutral-100)]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-50)] p-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 rounded bg-[var(--color-neutral-100)]" />
            ))}
          </div>
          <div className="animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-50)] h-[700px]" />
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (notFound || !license) {
    return (
      <div className="max-w-2xl py-24 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--color-blush)]">
          <AlertTriangle className="size-7 text-red-500" />
        </div>
        <h2 className="text-xl font-700 text-[var(--color-ink)] mb-2">License not found</h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-6">
          This license does not exist or you don't have access to it.
        </p>
        <Link href="/brand/licenses">
          <Button
            variant="outline"
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)]"
          >
            <ArrowLeft className="size-4" />
            Back to Licenses
          </Button>
        </Link>
      </div>
    );
  }

  const cfg = statusConfig[license.status] ?? statusConfig.active;
  const scopeArr = getScopeArray(license.scope);
  const days = daysUntilExpiry(license.expires_at);
  const certSrc = `/api/licenses/${id}/certificate`;

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-6"
      >
        <Link
          href="/brand/licenses"
          className="inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors no-underline"
        >
          <ArrowLeft className="size-4" />
          Licenses
        </Link>
        <span className="mx-2 text-[var(--color-neutral-300)]">/</span>
        <span className="text-sm font-600 text-[var(--color-ink)] font-mono">
          {license.id.slice(0, 8)}
        </span>
      </motion.div>

      {/* 2-col layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: License details ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 sm:p-6 shadow-[var(--shadow-card)] flex flex-col gap-5"
        >
          {/* Status big pill */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-800 tracking-tight text-[var(--color-ink)]">
              License Agreement
            </h1>
            <span className={`shrink-0 rounded-[var(--radius-pill)] px-3.5 py-1 text-sm font-700 ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2.5 rounded-[var(--radius-card)] bg-[var(--color-ocean)]/30 p-3">
              <User className="size-4 text-[var(--color-ink)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Creator</p>
                <p className="text-sm font-700 text-[var(--color-ink)]">{license.creator_name ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-[var(--radius-card)] bg-[var(--color-blush)]/30 p-3">
              <Building2 className="size-4 text-[var(--color-ink)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Brand</p>
                <p className="text-sm font-700 text-[var(--color-ink)]">{license.brand_name ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2.5">
              <Calendar className="size-4 text-[var(--color-neutral-400)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Issued</p>
                <p className="text-sm font-600 text-[var(--color-ink)]">{formatDate(license.issued_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar className="size-4 text-[var(--color-neutral-400)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Expires</p>
                <p className={`text-sm font-600 ${days < 30 ? "text-red-600" : days < 90 ? "text-yellow-600" : "text-green-600"}`}>
                  {formatDate(license.expires_at)}
                  {days >= 0 && (
                    <span className="ml-1.5 text-xs text-[var(--color-neutral-400)]">
                      ({days}d)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Scope chips */}
          {scopeArr.length > 0 && (
            <div>
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-2">Scope</p>
              <div className="flex flex-wrap gap-1.5">
                {scopeArr.map((s) => (
                  <span
                    key={s}
                    className="rounded-[var(--radius-pill)] bg-[var(--color-lilac)] px-2.5 py-0.5 text-xs font-600 text-[var(--color-ink)] capitalize"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Exclusive */}
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-[var(--color-neutral-400)] shrink-0" />
            <span className="text-sm text-[var(--color-neutral-500)]">
              {license.exclusive ? (
                <span className="font-700 text-[var(--color-accent-gold)]">Exclusive license</span>
              ) : (
                "Non-exclusive license"
              )}
            </span>
          </div>

          {/* Auto-renew toggle */}
          <AutoRenewToggle licenseId={license.id} initialValue={license.auto_renew} />

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-neutral-200)]">
            <a
              href={certSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-4 py-2 text-sm font-600 text-white hover:opacity-80 transition-opacity no-underline"
            >
              <FileText className="size-3.5" />
              Download cert PDF
              <ExternalLink className="size-3" />
            </a>
            <Link
              href={`/brand/vault`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] px-4 py-2 text-sm font-600 text-[var(--color-ink)] hover:bg-[var(--color-neutral-50)] transition-colors no-underline"
            >
              View in vault
            </Link>
          </div>
        </motion.div>

        {/* ── Right: PDF embed ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="flex flex-col"
        >
          <p className="mb-2 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">
            License Certificate
          </p>
          {!pdfError ? (
            <embed
              src={certSrc}
              type="application/pdf"
              className="w-full h-[700px] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] border border-[var(--color-neutral-200)]"
              onError={() => setPdfError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] h-[700px] text-center p-8">
              <FileText className="size-12 text-[var(--color-neutral-300)] mb-3" />
              <p className="text-sm font-600 text-[var(--color-ink)] mb-1">PDF not available</p>
              <p className="text-xs text-[var(--color-neutral-500)] mb-4">
                The certificate could not be loaded in the viewer.
              </p>
              <a
                href={certSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-600 text-[var(--color-accent-gold)] hover:underline"
              >
                Download instead
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
