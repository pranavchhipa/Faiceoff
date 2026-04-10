"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, User, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CreatorSignupPage() {
  const router = useRouter();
  const [formState, setFormState] = useState({
    email: "",
    displayName: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formState.email,
          displayName: formState.displayName,
          phone: formState.phone || undefined,
          role: "creator",
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
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
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-blush)]/60 px-3 py-1 text-xs font-500 text-[var(--color-ink)] mb-3">
          Creator Account
        </div>
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          License your likeness
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          Earn from AI-generated content featuring you
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="displayName"
              type="text"
              placeholder="Your name"
              value={formState.displayName}
              onChange={(e) => updateField("displayName", e.target.value)}
              required
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={formState.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              className="pl-10 h-11 rounded-[var(--radius-input)] border-[var(--color-neutral-200)] bg-white focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone number{" "}
            <span className="text-[var(--color-neutral-400)] font-400">
              (optional)
            </span>
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={formState.phone}
              onChange={(e) => updateField("phone", e.target.value)}
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
          disabled={loading || !formState.email || !formState.displayName}
          className="w-full h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Create creator account"
          )}
        </Button>
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
