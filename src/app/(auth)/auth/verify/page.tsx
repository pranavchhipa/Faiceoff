"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleVerify() {
    if (otp.length !== 8) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: otp }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResent(true);
        setTimeout(() => setResent(false), 5000);
      }
    } catch {
      setError("Failed to resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--color-lilac)]/50">
          <svg
            className="size-6 text-[var(--color-ink)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
          We sent a verification code to{" "}
          <span className="font-500 text-[var(--color-ink)]">{email}</span>
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <InputOTP
          maxLength={8}
          value={otp}
          onChange={setOtp}
          onComplete={handleVerify}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={1} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={2} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={3} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={4} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={5} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={6} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
            <InputOTPSlot index={7} className="size-11 text-lg font-600 border-[var(--color-neutral-200)]" />
          </InputOTPGroup>
        </InputOTP>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 w-full text-center"
          >
            {error}
          </motion.p>
        )}

        <Button
          onClick={handleVerify}
          disabled={loading || otp.length !== 8}
          className="w-full h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] text-white font-600 hover:bg-[var(--color-gold-hover)] transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Verify code"
          )}
        </Button>

        <div className="text-center">
          <p className="text-sm text-[var(--color-neutral-500)]">
            {"Didn't receive it? "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || resent}
              className="font-500 text-[var(--color-gold)] hover:text-[var(--color-gold-hover)] disabled:opacity-50 transition-colors"
            >
              {resending
                ? "Sending..."
                : resent
                  ? "Code sent!"
                  : "Resend code"}
            </button>
          </p>
        </div>
      </div>

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

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-[var(--color-neutral-400)]" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
