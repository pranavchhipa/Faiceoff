"use client";

import { useState } from "react";

interface Props {
  ccSlug: string;
}

export default function LoginForm({ ccSlug }: Props) {
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleaned = code.trim();
    if (useBackup) {
      if (!/^\d{5}-?\d{5}$/.test(cleaned) && !/^\d{10}$/.test(cleaned.replace(/-/g, ""))) {
        setError("Enter the 10-digit backup code (XXXXX-XXXXX).");
        return;
      }
    } else {
      if (!/^\d{6}$/.test(cleaned)) {
        setError("Enter the 6-digit code from your authenticator.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cc/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleaned, useBackup }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Invalid code");
        setSubmitting(false);
        return;
      }
      // HARD navigation (not router.replace) — a client-side nav would NOT
      // re-render the shared [ccSlug] layout, which rendered in the logged-out
      // state (no sidebar) on /login; a full load re-renders it authenticated
      // so the sidebar appears immediately instead of only after a refresh.
      window.location.replace(`/${ccSlug}/ops`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="cc-auth-card">
      <h1>Sign in to Control Centre</h1>
      <p className="sub">
        Open Google Authenticator and enter the 6-digit code for Faiceoff.
      </p>

      <form onSubmit={handleSubmit}>
        <label className="cc-label" htmlFor="code">
          {useBackup ? "Backup code" : "Authenticator code"}
        </label>
        <input
          id="code"
          className="cc-input mono"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={useBackup ? 11 : 6}
          value={code}
          onChange={(e) => {
            const v = useBackup
              ? e.target.value.replace(/[^\d-]/g, "").slice(0, 11)
              : e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
          }}
          placeholder={useBackup ? "12345-67890" : "123456"}
          autoFocus
        />
        {error && <p className="cc-error" style={{ marginTop: 12 }}>{error}</p>}

        <button
          type="submit"
          className="cc-btn cc-btn-primary"
          style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        className="cc-btn"
        style={{
          marginTop: 12,
          width: "100%",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          color: "var(--cc-fg-muted)",
          fontSize: 11,
          fontFamily: "var(--cc-mono)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
        onClick={() => {
          setUseBackup((v) => !v);
          setCode("");
          setError(null);
        }}
      >
        {useBackup ? "Use authenticator code instead" : "Use a backup code"}
      </button>
    </div>
  );
}
