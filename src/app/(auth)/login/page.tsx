"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
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
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          Sign in with your email to continue
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
            "Send OTP"
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <Separator className="bg-[var(--color-neutral-200)]" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-[var(--color-neutral-400)]">
          New to Faiceoff?
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          asChild
          className="h-11 rounded-[var(--radius-button)] border-[var(--color-neutral-200)] hover:border-[var(--color-blush-deep)] hover:bg-[var(--color-blush)]/40 transition-colors"
        >
          <Link href="/auth/signup/creator">Join as Creator</Link>
        </Button>
        <Button
          variant="outline"
          asChild
          className="h-11 rounded-[var(--radius-button)] border-[var(--color-neutral-200)] hover:border-[var(--color-ocean-deep)] hover:bg-[var(--color-ocean)]/40 transition-colors"
        >
          <Link href="/auth/signup/brand">Join as Brand</Link>
        </Button>
      </div>
    </motion.div>
  );
}
