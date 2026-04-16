"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Building2, Globe, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BrandSignupPage() {
  const router = useRouter();
  const [formState, setFormState] = useState({
    email: "",
    companyName: "",
    website: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (formState.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (formState.password !== formState.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formState.email,
          displayName: formState.companyName,
          password: formState.password,
          role: "brand",
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.debug ? `${data.error} — ${data.debug}` : data.error);
        setLoading(false);
        return;
      }

      router.push(
        `/auth/verify?email=${encodeURIComponent(formState.email)}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-ocean)]/60 px-3 py-1 text-xs font-500 text-[var(--color-ink)] mb-3">
          Brand Account
        </div>
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Access licensed faces
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          Create AI content with real creator likenesses
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company name</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="companyName"
              type="text"
              placeholder="Your company"
              value={formState.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              required
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={formState.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={formState.password}
              onChange={(e) => updateField("password", e.target.value)}
              required
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
              placeholder="Re-enter password"
              value={formState.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              required
              minLength={8}
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">
            Website{" "}
            <span className="text-[var(--color-neutral-400)] font-400">
              (optional)
            </span>
          </Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="website"
              type="url"
              placeholder="https://yourcompany.com"
              value={formState.website}
              onChange={(e) => updateField("website", e.target.value)}
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
          disabled={
            loading ||
            !formState.email ||
            !formState.companyName ||
            !formState.password
          }
          className="w-full h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Create brand account"
          )}
        </Button>

        <p className="text-xs text-center text-[var(--color-neutral-400)]">
          We'll send a verification code to your email to confirm it's yours.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-neutral-500)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-500 text-[var(--color-gold)] hover:text-[var(--color-gold-hover)]"
        >
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
