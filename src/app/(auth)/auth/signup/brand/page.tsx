"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Building2, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { AuthShell, FormField } from "@/components/landing/AuthShell";

export default function BrandSignupPage() {
  const router = useRouter();
  const [formState, setFormState] = useState({ email: "", companyName: "", password: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (formState.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (formState.password !== formState.confirmPassword) { setError("Passwords don't match."); return; }
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
      if (data.error) { setError(data.debug ? `${data.error} — ${data.debug}` : data.error); setLoading(false); return; }
      router.push(`/auth/verify?email=${encodeURIComponent(formState.email)}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title={<>Join as a <span className="text-gradient-primary">Brand.</span></>}
      subtitle="Generate ads with verified Indian creators. Full usage rights, GST invoiced."
      side={{ tint: "brand", heading: "Skip the shoot. Ship the campaign.", body: "Verified creators, AI generation, full commercial rights — all in one workflow." }}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {[
          { key: "companyName", label: "Company name", Icon: Building2, type: "text",  ac: "organization", ph: "Acme India Pvt Ltd",  max: 100 },
          { key: "email",       label: "Work email",   Icon: Mail,      type: "email", ac: "email",         ph: "you@company.com",     max: 255 },
        ].map(({ key, label, Icon, type, ac, ph, max }, i) => (
          <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <FormField label={label}>
              <div className="relative">
                <Icon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={type}
                  autoComplete={ac}
                  maxLength={max}
                  value={formState[key as keyof typeof formState]}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={ph}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </FormField>
          </motion.div>
        ))}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <FormField label="Password" hint="At least 8 characters.">
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                maxLength={128}
                value={formState.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Create a password"
                className="w-full pl-10 pr-11 py-3.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}>
          <FormField label="Confirm password">
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={formState.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                placeholder="Re-enter password"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </FormField>
        </motion.div>

        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
            {error}
          </motion.p>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          We'll send an 8-digit code to verify your email. By continuing you agree to our Terms and DPDP-compliant Privacy policy.
        </p>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={loading || !formState.email || !formState.companyName || !formState.password}
          className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 hover:shadow-glow transition-shadow disabled:opacity-70"
        >
          {loading ? <><Loader2 size={18} className="animate-spin" /> Creating account…</> : <>Create brand account <ArrowRight size={18} /></>}
        </motion.button>

        <p className="text-sm text-muted-foreground text-center pt-2">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-foreground hover:text-primary transition-colors">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
