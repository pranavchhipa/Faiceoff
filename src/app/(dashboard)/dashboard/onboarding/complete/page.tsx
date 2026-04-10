"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PartyPopper, ArrowRight, CheckCircle } from "lucide-react";
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

  useEffect(() => {
    if (authLoading || !user || saved) return;

    async function markComplete() {
      // Mark onboarding complete via server API (bypasses RLS)
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
      });

      if (!res.ok) return;

      setSaved(true);
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
