"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useMotionValue, useTransform, useSpring, animate } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  IndianRupee,
  Clock,
  Hourglass,
  Sparkles,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

interface DashboardData {
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
  min_payout_paise: number;
  can_withdraw: boolean;
}

function fmt(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => {
    if (suffix === "") {
      return fmt(Math.round(v));
    }
    return `${Math.round(v)}${suffix}`;
  });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionVal, target, { duration: 1.2, ease: "easeOut" });
    return controls.stop;
  }, [target, motionVal]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
};

export default function EarningsCards({ data }: { data: DashboardData }) {
  const {
    available_paise,
    holding_paise,
    pending_count,
    lifetime_earned_paise,
    min_payout_paise,
    can_withdraw,
  } = data;

  const cards = [
    {
      label: "Available",
      sub: can_withdraw ? "Ready to withdraw" : `Min ${fmt(min_payout_paise)} required`,
      icon: IndianRupee,
      bg: "var(--color-blush)",
      border: "var(--color-blush-deep)",
      value: available_paise,
      isCount: false,
      dimmed: !can_withdraw,
    },
    {
      label: "Holding",
      sub: "In 7-day dispute window",
      icon: Hourglass,
      bg: "var(--color-lilac)",
      border: "var(--color-lilac-deep)",
      value: holding_paise,
      isCount: false,
      dimmed: false,
    },
    {
      label: "Pending",
      sub: "Approvals awaiting response",
      icon: Clock,
      bg: "var(--color-mint)",
      border: "var(--color-mint-deep)",
      value: pending_count,
      isCount: true,
      dimmed: false,
      link: "/creator/approvals",
    },
    {
      label: "Lifetime earned",
      sub: "All time",
      icon: TrendingUp,
      bg: "var(--color-ocean)",
      border: "var(--color-ocean-deep)",
      value: lifetime_earned_paise,
      isCount: false,
      dimmed: false,
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-4xl"
    >
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-on-surface)]">
          Your earnings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline)]">
          Track your income, withdrawals, and pending approvals.
        </p>
      </div>

      {/* 4-pot grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="relative rounded-[var(--radius-card)] border p-5 flex flex-col gap-3 shadow-[var(--shadow-card)]"
              style={{
                background: card.bg,
                borderColor: card.border,
                opacity: card.dimmed ? 0.6 : 1,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-neutral-600)]">
                  {card.label}
                </span>
                <Icon className="size-4 text-[var(--color-neutral-600)]" />
              </div>

              <div className="text-2xl sm:text-3xl font-bold text-[var(--color-ink)]">
                {card.isCount ? (
                  <CountUp target={card.value} suffix="" />
                ) : (
                  <CountUp target={card.value} />
                )}
              </div>

              <p className="text-xs text-[var(--color-neutral-600)]">{card.sub}</p>

              {"link" in card && card.link && (
                <Link
                  href={card.link}
                  className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-ink)] hover:underline no-underline"
                >
                  View approvals <ArrowRight className="size-3" />
                </Link>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="mb-8">
        <Button
          asChild={can_withdraw}
          disabled={!can_withdraw}
          className="rounded-[var(--radius-button)] bg-[var(--color-accent-gold)] text-white font-semibold hover:bg-[var(--color-accent-gold-hover)] disabled:opacity-50 disabled:cursor-not-allowed px-6"
        >
          {can_withdraw ? (
            <Link href="/creator/withdraw">Withdraw available balance</Link>
          ) : (
            <span>Withdraw available balance</span>
          )}
        </Button>
        {!can_withdraw && (
          <p className="mt-2 text-xs text-[var(--color-neutral-500)]">
            Minimum withdrawal is {fmt(min_payout_paise)}. Keep earning!
          </p>
        )}
      </div>

      <Separator className="mb-6" />

      {/* How it works */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="size-4 text-[var(--color-accent-gold)]" />
          <h2 className="text-sm font-bold text-[var(--color-ink)]">How it works</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm text-[var(--color-neutral-600)]">
          <div>
            <p className="font-semibold text-[var(--color-ink)] mb-1">Available</p>
            <p>Cleared earnings past the 7-day dispute window. Ready to withdraw to your bank.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--color-ink)] mb-1">Holding</p>
            <p>Earnings within the 7-day dispute window. Released automatically once the window closes.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--color-ink)] mb-1">Pending</p>
            <p>Generations awaiting your approval. Approve to unlock the associated payment.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
