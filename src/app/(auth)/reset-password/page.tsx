"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Lock, CheckCircle2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function ResetPasswordPage() {
  const router = useRouter();
  // Lazy ref — client created only once, only on the browser
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // ── 1. Check hash for an error BEFORE touching Supabase ──
    // When the link is expired/invalid Supabase puts:
    //   #error=access_denied&error_code=otp_expired&...
    // in the redirect URL. We detect this and show the graceful UI
    // instead of letting the client try to process a bad token.
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      setHasSession(false);
      setCheckingSession(false);
      return;
    }

    // ── 2. Create client lazily (browser-only) ──
    if (!supabaseRef.current) {
      supabaseRef.current = createClient() as SupabaseClient;
    }
    const supabase = supabaseRef.current;

    let cancelled = false;

    // ── 3. Listen for PASSWORD_RECOVERY event ──
    // Supabase fires this after it exchanges the hash token into a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
        setCheckingSession(false);
      }
    });

    // ── 4. Also check if a session already exists ──
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        setHasSession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
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

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? "Could not update password.");
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);

      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setFormError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ── Loading state ──
  if (checkingSession) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-[var(--color-neutral-400)]" />
      </div>
    );
  }

  // ── Expired / invalid link ──
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
          This reset link has expired or already been used. Request a new one.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            asChild
            className="h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
          >
            <Link href="/forgot-password">Request new link</Link>
          </Button>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1 text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to login
          </Link>
        </div>
      </motion.div>
    );
  }

  // ── Success state ──
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

  // ── Set new password form ──
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

        {formError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2"
          >
            {formError}
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
