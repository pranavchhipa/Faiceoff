"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PartyPopper, ArrowRight, CheckCircle, Tags } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

// Simple confetti dot component
function ConfettiDot({
  delay,
  x,
  color,
}: {
  delay: number;
  x: number;
  color: string;
}) {
  return (
    <motion.div
      className="absolute size-2 rounded-full"
      style={{ backgroundColor: color, left: `${x}%` }}
      initial={{ opacity: 0, y: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [0, -80, -120, -160],
        scale: [0, 1, 1, 0.5],
        x: [0, (Math.random() - 0.5) * 60],
      }}
      transition={{
        duration: 2,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

const CONFETTI_COLORS = [
  "var(--color-gold)",
  "var(--color-blush)",
  "var(--color-ocean)",
  "var(--color-lilac)",
  "var(--color-mint)",
];

export default function CompletePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || saved) return;

    async function markComplete() {
      try {
        // Mark onboarding complete via server API (bypasses RLS)
        const res = await fetch("/api/onboarding/complete", {
          method: "POST",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { error?: string }).error || `Failed (${res.status})`;
          console.error("[complete] API error:", msg);
          setCompleteError(msg);
          return;
        }

        setSaved(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        console.error("[complete] error:", msg);
        setCompleteError(msg);
      }
    }

    markComplete();
  }, [user, authLoading, saved]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="text-center py-8"
    >
      {/* Confetti animation */}
      <div className="relative mx-auto mb-8 h-40 w-64 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <ConfettiDot
            key={i}
            delay={i * 0.1}
            x={10 + Math.random() * 80}
            color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
          />
        ))}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="flex size-20 items-center justify-center rounded-full bg-[var(--color-gold)]/10">
            <PartyPopper className="size-10 text-[var(--color-gold)]" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-3xl font-800 text-[var(--color-ink)] mb-3">
          You are all set!
        </h2>
        <p className="text-[var(--color-neutral-500)] max-w-md mx-auto mb-8 leading-relaxed">
          Your creator profile is now under review. Our team will verify your
          details and activate your account within 24-48 hours.
        </p>

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
          {[
            { label: "Profile", status: "Complete" },
            { label: "Photos", status: "Uploaded" },
            { label: "Review", status: "Pending" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4"
            >
              <CheckCircle className="size-5 text-[var(--color-gold)] mx-auto mb-2" />
              <p className="text-xs font-600 text-[var(--color-ink)]">
                {item.label}
              </p>
              <p className="text-xs text-[var(--color-neutral-400)]">
                {item.status}
              </p>
            </div>
          ))}
        </div>

        {/* Packages CTA banner */}
        <div className="mx-auto mb-6 max-w-md rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/5 px-5 py-4 text-left">
          <div className="mb-1 flex items-center gap-2">
            <Tags className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Next step
            </span>
          </div>
          <p className="font-display text-[15px] font-800 text-[var(--color-foreground)]">
            Set up your packages to go live
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
            You are not live yet. Create at least one Frame, Feature, or Cover package so brands can find and request you.
          </p>
          <button
            onClick={() => router.push("/creator/packages")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition hover:-translate-y-0.5"
          >
            Set up packages <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {completeError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2 mb-4 max-w-md mx-auto">
            Error: {completeError}
          </p>
        )}

        <Button
          onClick={() => router.push("/dashboard")}
          className="bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
        >
          Go to Dashboard
          <ArrowRight className="size-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
