"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { AuthShell, FormField } from "@/components/landing/AuthShell";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const next: { email?: string; password?: string } = {};
    if (!isEmail(email)) next.email = "Please enter a valid email address.";
    if (!password) next.password = "Please enter your password.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-in-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setServerError(
          data.error === "Invalid login credentials"
            ? "Incorrect email or password. Never set one? Use Forgot password."
            : data.error ?? "Sign in failed."
        );
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title={<>Sign in to <span className="text-gradient-primary">Faiceoff.</span></>}
      subtitle="Sign in with your email and password."
      side={{
        tint: "creator",
        heading: "Your face. Your rules.",
        body: "You approve every image. You set every price. You earn in INR.",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormField label="Email">
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              autoFocus
              autoComplete="email"
              inputMode="email"
              maxLength={255}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
              placeholder="you@example.com"
              className={`w-full pl-10 pr-4 py-3.5 rounded-xl border bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring transition-all ${errors.email ? "border-destructive" : "border-input focus:border-ring"}`}
            />
          </div>
          {errors.email && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs text-destructive">
              {errors.email}
            </motion.p>
          )}
        </FormField>

        <FormField label="Password">
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
              placeholder="Your password"
              className={`w-full pl-10 pr-11 py-3.5 rounded-xl border bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring transition-all ${errors.password ? "border-destructive" : "border-input focus:border-ring"}`}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs text-destructive">
              {errors.password}
            </motion.p>
          )}
        </FormField>

        <div className="flex justify-end -mt-2">
          <Link href="/forgot-password" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Forgot password?
          </Link>
        </div>

        {serverError && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
            {serverError}
          </motion.p>
        )}

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 hover:shadow-glow transition-shadow disabled:opacity-70"
        >
          {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
        </motion.button>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Link href="/auth/signup/creator" className="py-3 rounded-xl border border-border bg-tint-creator font-medium text-sm text-center hover:border-primary/40 transition-colors">
            Join as Creator
          </Link>
          <Link href="/auth/signup/brand" className="py-3 rounded-xl border border-border bg-tint-brand font-medium text-sm text-center hover:border-primary/40 transition-colors">
            Join as Brand
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
