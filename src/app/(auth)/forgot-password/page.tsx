"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }

      // Always show success, even if email doesn't exist (no enumeration).
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
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
          Check your inbox
        </h1>
        <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
          If an account exists for{" "}
          <span className="font-500 text-[var(--color-ink)]">{email}</span>, we
          sent a password reset link. It may take a minute to arrive.
        </p>
        <p className="mt-4 text-xs text-[var(--color-neutral-400)]">
          The link expires in 1 hour. You can close this page.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to login
          </Link>
        </div>
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
          Forgot your password?
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
          disabled={loading || !email}
          className="w-full h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to login
        </Link>
      </div>
    </motion.div>
  );
}
