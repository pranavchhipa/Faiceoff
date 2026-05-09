"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ccSlug: string;
  secret: string;
  qrDataUrl: string;
  backupCodes: string[];
}

export default function SetupForm({
  ccSlug,
  secret,
  qrDataUrl,
  backupCodes,
}: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!savedCodes) {
      setError("Confirm you have saved the backup codes first.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/cc/auth/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          backupCodes,
          code,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Verification failed");
        setSubmitting(false);
        return;
      }
      router.replace(`/${ccSlug}/login`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="cc-auth-card" style={{ maxWidth: 540 }}>
      <h1>Control Centre · First-time setup</h1>
      <p className="sub">
        Scan the QR with Google Authenticator (or any TOTP app), save the
        backup codes, then enter the 6-digit code to lock in.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 18, alignItems: "start", marginBottom: 22 }}>
        <Image
          src={qrDataUrl}
          alt="TOTP QR code"
          width={220}
          height={220}
          unoptimized
          style={{ borderRadius: 4, background: "#fff" }}
        />
        <div>
          <p className="cc-label">Secret (manual entry)</p>
          <code
            style={{
              fontFamily: "var(--cc-mono)",
              fontSize: 12,
              background: "var(--cc-bg)",
              border: "1px solid var(--cc-border-strong)",
              borderRadius: 4,
              padding: "8px 10px",
              display: "block",
              wordBreak: "break-all",
              color: "var(--cc-fg)",
            }}
          >
            {secret}
          </code>
          <p
            style={{
              fontFamily: "var(--cc-mono)",
              fontSize: 11,
              color: "var(--cc-fg-muted)",
              marginTop: 8,
            }}
          >
            Type: TIME-BASED (TOTP) · 30s · 6 digits
          </p>
        </div>
      </div>

      <p className="cc-label">Backup codes — save somewhere safe</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          marginBottom: 12,
          background: "var(--cc-bg)",
          border: "1px solid var(--cc-border-strong)",
          borderRadius: 4,
          padding: 12,
        }}
      >
        {backupCodes.map((c) => (
          <span
            key={c}
            style={{
              fontFamily: "var(--cc-mono)",
              fontSize: 12,
              color: "var(--cc-fg)",
              letterSpacing: "0.04em",
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--cc-fg-muted)", marginBottom: 16 }}>
        Each code can be used once if you lose your authenticator. We hash
        them on the server — nobody (including us) can recover them later.
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          fontSize: 12.5,
          color: "var(--cc-fg)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={savedCodes}
          onChange={(e) => setSavedCodes(e.target.checked)}
        />
        I&apos;ve saved the backup codes somewhere safe.
      </label>

      <form onSubmit={handleVerify}>
        <label className="cc-label" htmlFor="code">
          6-digit code from authenticator
        </label>
        <input
          id="code"
          className="cc-input mono"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          autoFocus
        />
        {error && <p className="cc-error" style={{ marginTop: 12 }}>{error}</p>}

        <button
          type="submit"
          className="cc-btn cc-btn-primary"
          style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
          disabled={submitting}
        >
          {submitting ? "Verifying…" : "Verify & finalise"}
        </button>
      </form>
    </div>
  );
}
