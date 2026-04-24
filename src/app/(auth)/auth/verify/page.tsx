"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ArrowRight, CheckCheck, RotateCw } from "lucide-react";
import { AuthShell } from "@/components/landing/AuthShell";

const OTP_LENGTH = 8;

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const code = useMemo(() => digits.join(""), [digits]);
  const filled = code.length === OTP_LENGTH;

  const setDigit = (i: number, v: string) => {
    const next = [...digits]; next[i] = v; setDigits(next);
  };

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "");
    if (!v) { setDigit(i, ""); return; }
    if (v.length === 1) {
      setDigit(i, v);
      if (i < OTP_LENGTH - 1) inputs.current[i + 1]?.focus();
    } else {
      const chars = v.slice(0, OTP_LENGTH - i).split("");
      const next = [...digits];
      chars.forEach((c, idx) => (next[i + idx] = c));
      setDigits(next);
      inputs.current[Math.min(i + chars.length, OTP_LENGTH - 1)]?.focus();
    }
    if (error) setError(null);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus(); setDigit(i - 1, ""); e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    text.split("").forEach((c, idx) => (next[idx] = c));
    setDigits(next);
    inputs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!filled || verifying) return;
    setVerifying(true); setError(null);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setVerifying(false); return; }
      setSuccess(true);
      setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 1100);
    } catch {
      setError("Verification failed. Please try again.");
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setCooldown(30);
    } catch { /* silent */ }
    setResending(false);
  };

  const masked = email
    ? email.replace(/^(.).+(@.+)$/, (_m: string, a: string, b: string) => `${a}•••••${b}`)
    : "your email";

  return (
    <AuthShell
      eyebrow="One last step"
      title={<>Enter the <span className="text-gradient-primary">8-digit code.</span></>}
      subtitle={<>We sent a verification code to <span className="text-foreground font-semibold">{masked}</span>. It expires in 10 minutes.</>}
      side={{ tint: "success", heading: "Secure by default.", body: "Every new account gets a fresh one-time code. No passwords to guess. Just click your inbox." }}
    >
      <form onSubmit={verify} className="space-y-6" noValidate>
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5">
          {digits.map((d, i) => (
            <motion.input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              whileFocus={{ scale: 1.04 }}
              animate={d ? { scale: [1, 1.08, 1] } : undefined}
              transition={{ duration: 0.25 }}
              className={`aspect-square w-full text-center font-display text-lg sm:text-2xl font-bold rounded-lg sm:rounded-xl border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${d ? "border-primary/60 bg-primary/5" : "border-input"}`}
            />
          ))}
        </div>

        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-destructive">
            {error}
          </motion.p>
        )}

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={!filled || verifying || success}
          className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 hover:shadow-glow transition-all disabled:opacity-50"
        >
          <AnimatePresence mode="wait">
            {success ? (
              <motion.span key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2">
                <CheckCheck size={18} /> Verified
              </motion.span>
            ) : verifying ? (
              <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" /> Verifying…
              </motion.span>
            ) : (
              <motion.span key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                Verify & continue <ArrowRight size={18} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="flex items-center justify-between text-sm pt-1">
          <a href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Use a different email
          </a>
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || resending}
            className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {resending ? <><Loader2 size={14} className="animate-spin" /> Resending…</> : cooldown > 0 ? <>Resend in {cooldown}s</> : <><RotateCw size={14} /> Resend code</>}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <VerifyForm />
    </Suspense>
  );
}
