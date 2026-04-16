"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Lock, CheckCircle2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * /reset-password
 *
 * Landing page for the password recovery email link. Supabase's SSR client
 * auto-exchanges the recovery token in the URL hash for a session, so by the
 * time this component mounts the user is signed in with a short-lived
 * recovery session. We just need to let them set a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Session check — confirm the user actually landed here from a recovery link
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!session);
      setCheckingSession(false);
    }

    check();

    // Listen for the PASSWORD_RECOVERY event Supabase fires after the hash
    // token is exchanged. In that case session becomes available shortly.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(!!session);
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not update password.");
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);

      // After a short delay, send them into the app — they're already signed
      // in thanks to the recovery session.
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-[var(--color-neutral-400)]" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Link expired or invalid
        </h1>
        <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
          This reset link may have expired or already been used. Request a new
          one to continue.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            asChild
            className="h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
          >
            <Link href="/forgot-password">Request new link</Link>
          </Button>
          <Link
            href="/login"
            className="mt-1 inline-flex items-center justify-center gap-1 text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to login
          </Link>
        </div>
      </motion.div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="text-center"
      >
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-mint)]/50">
          <CheckCircle2 className="size-7 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Password updated
        </h1>
        <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
          Taking you to your dashboard…
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="text-center mb-6">
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          Choose something memorable. At least 8 characters.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2"
          >
            {error}
          </motion.p>
        )}

        <Button
          type="submit"
          disabled={loading || !password || !confirmPassword}
          className="w-full h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </motion.div>
  );
}
