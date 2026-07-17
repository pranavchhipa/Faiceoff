"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Lock, CheckCircle2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/landing/AuthShell";

/**
 * /reset-password
 *
 * Defensive implementation: does NOT touch the Supabase browser client at all.
 * Parses the URL hash manually (Supabase puts access_token + refresh_token
 * there after a recovery redirect), then posts the access_token to the
 * server, which uses the admin client to validate and update the password.
 *
 * This avoids every fragile piece of Supabase's browser session/hash state
 * machinery — nothing to crash.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const hash = typeof window !== "undefined" ? window.location.hash : "";

      if (!hash || hash === "#") {
        setLinkError("No reset token found. Use the link from your email.");
        setChecking(false);
        return;
      }

      const params = new URLSearchParams(hash.replace(/^#/, ""));

      const hashError = params.get("error");
      const errorCode = params.get("error_code");
      if (hashError) {
        setLinkError(
          errorCode === "otp_expired"
            ? "This reset link has expired. Request a new one."
            : "This reset link is invalid. Request a new one."
        );
        setChecking(false);
        return;
      }

      const token = params.get("access_token");
      if (!token) {
        setLinkError("Invalid reset link. Request a new one.");
        setChecking(false);
        return;
      }

      setAccessToken(token);
      setChecking(false);
    } catch (err) {
      console.error("[reset-password] init error:", err);
      setLinkError("Something went wrong reading the reset link.");
      setChecking(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (!accessToken) {
      setFormError("Missing reset token. Request a new link.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, access_token: accessToken }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error ?? "Could not update password.");
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      console.error("[reset-password] submit error:", err);
      setFormError("Network error. Please try again.");
      setLoading(false);
    }
  }

  // ── Loading state ──
  if (checking) {
    return (
      <AuthShell title="Set a new password">
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  // ── Invalid / expired link ──
  if (linkError) {
    return (
      <AuthShell title="Link expired or invalid" subtitle={linkError}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex flex-col gap-3"
        >
          <Button
            asChild
            className="h-11 rounded-[var(--radius-button)] bg-primary text-primary-foreground font-600 hover:bg-primary/90 transition-colors"
          >
            <Link href="/forgot-password">Request new link</Link>
          </Button>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to login
          </Link>
        </motion.div>
      </AuthShell>
    );
  }

  // ── Success ──
  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Redirecting to login…">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex justify-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-7 text-emerald-600" />
          </div>
        </motion.div>
      </AuthShell>
    );
  }

  // ── Form ──
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something memorable. At least 8 characters."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="pl-10 h-11 rounded-[var(--radius-input)] border-input bg-secondary focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="pl-10 h-11 rounded-[var(--radius-input)] border-input bg-secondary focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>
          </div>

          {formError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-destructive bg-destructive/10 rounded-[var(--radius-input)] px-3 py-2"
            >
              {formError}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full h-11 rounded-[var(--radius-button)] bg-primary text-primary-foreground font-600 hover:bg-primary/90 transition-colors"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      </motion.div>
    </AuthShell>
  );
}
