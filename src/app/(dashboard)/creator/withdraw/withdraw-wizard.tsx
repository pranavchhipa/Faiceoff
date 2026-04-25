"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  IndianRupee,
  Building2,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";

interface DashboardData {
  available_paise: number;
  min_payout_paise: number;
  can_withdraw: boolean;
}

interface BankAccount {
  id: string;
  account_number_last4: string;
  ifsc_code: string;
  account_holder_name: string;
  is_primary: boolean;
}

function fmt(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function computeTDS(gross: number): number {
  return Math.round(gross * 0.01);
}
function computeFee(): number {
  return 2500;
}
function computeNet(gross: number): number {
  return gross - computeTDS(gross) - computeFee();
}

interface BreakdownProps {
  grossPaise: number;
}

function Breakdown({ grossPaise }: BreakdownProps) {
  const tds = computeTDS(grossPaise);
  const fee = computeFee();
  const net = computeNet(grossPaise);

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-4 text-sm space-y-2">
      <div className="flex justify-between text-[var(--color-neutral-600)]">
        <span>Gross amount</span>
        <span>{fmt(grossPaise)}</span>
      </div>
      <div className="flex justify-between text-[var(--color-neutral-600)]">
        <span>TDS (1%)</span>
        <span className="text-red-500">-{fmt(tds)}</span>
      </div>
      <div className="flex justify-between text-[var(--color-neutral-600)]">
        <span>Processing fee</span>
        <span className="text-red-500">-{fmt(fee)}</span>
      </div>
      <Separator />
      <div className="flex justify-between font-bold text-[var(--color-ink)]">
        <span>Net to bank</span>
        <span>{fmt(net)}</span>
      </div>
    </div>
  );
}

const slideVariants = {
  enter: (dir: number) => ({
    x: dir * 60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
  exit: (dir: number) => ({
    x: dir * -60,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

export default function WithdrawWizard({
  dashboard,
  bankAccounts,
}: {
  dashboard: DashboardData;
  bankAccounts: BankAccount[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { available_paise, min_payout_paise, can_withdraw } = dashboard;
  const minRupees = min_payout_paise / 100;
  const maxRupees = Math.floor(available_paise / 100);

  // Clamp amount between min and max in ₹100 steps
  const initialAmount = Math.max(minRupees, Math.min(maxRupees, minRupees));
  const [amountRupees, setAmountRupees] = useState(initialAmount);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState(1);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryAccount = bankAccounts.find((a) => a.is_primary) ?? bankAccounts[0] ?? null;
  const grossPaise = amountRupees * 100;

  function goTo(next: 1 | 2 | 3) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  async function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/payouts/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_paise: grossPaise,
            bank_account_id: primaryAccount?.id,
          }),
        });
        const json = (await res.json()) as { payoutId?: string; error?: string };
        if (!res.ok) {
          setError(json.error ?? "Withdrawal failed. Please try again.");
          return;
        }
        setSuccess(true);
        toast.success("Withdrawal submitted successfully");
        setTimeout(() => {
          router.push("/creator/payouts");
        }, 2000);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (!can_withdraw) {
    const remainingPaise = Math.max(0, min_payout_paise - available_paise);
    const progressPct = Math.min(
      100,
      Math.round((available_paise / min_payout_paise) * 100),
    );
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8 lg:px-8 lg:py-10">
        <div className="mb-8">
          <h1 className="font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-ink)] md:text-[34px]">
            Withdraw
          </h1>
          <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
            Move your earnings to UPI or bank — instant via Cashfree.
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-gradient-to-br from-[var(--color-blush)]/60 via-white to-[var(--color-mint)]/40 p-8"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm">
              <IndianRupee className="size-5 text-[var(--color-accent-gold)]" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.2em] text-[var(--color-neutral-500)]">
                Below minimum
              </p>
              <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-ink)]">
                A little more to go
              </h2>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/80 p-4">
              <p className="font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)]">
                Available now
              </p>
              <p className="mt-1 font-display text-[22px] font-800 text-[var(--color-ink)]">
                {fmt(available_paise)}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-4">
              <p className="font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)]">
                Minimum payout
              </p>
              <p className="mt-1 font-display text-[22px] font-800 text-[var(--color-accent-gold)]">
                {fmt(min_payout_paise)}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="text-[var(--color-neutral-600)]">Progress to minimum</span>
              <span className="font-700 text-[var(--color-ink)]">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[var(--color-accent-gold)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-3 text-[13px] text-[var(--color-neutral-600)]">
              Earn{" "}
              <span className="font-700 text-[var(--color-ink)]">
                {fmt(remainingPaise)}
              </span>{" "}
              more to unlock withdrawals. Keep approving briefs — every approval
              clears to Available after a 7-day hold.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => router.push("/creator/approvals")}
              className="rounded-[var(--radius-button)] bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]/85"
            >
              Review approvals <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/creator/earnings")}
              className="rounded-[var(--radius-button)]"
            >
              Back to earnings
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoCard
            title="UPI in 30s"
            body="Once you cross the minimum, UPI withdrawals land instantly."
          />
          <InfoCard
            title="TDS handled"
            body="1% TDS deducted at source per Section 194-O. We file for you."
          />
          <InfoCard
            title="No fees"
            body="₹25 processing fee per withdrawal. No hidden charges."
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-lg"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">Withdraw</h1>
        <p className="text-sm text-[var(--color-neutral-500)] mt-1">
          Available: {fmt(available_paise)}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s <= step
                  ? "bg-[var(--color-accent-gold)] text-white"
                  : "bg-[var(--color-neutral-200)] text-[var(--color-neutral-500)]"
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <div
                className={`h-px w-10 transition-colors ${
                  s < step ? "bg-[var(--color-accent-gold)]" : "bg-[var(--color-neutral-200)]"
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-[var(--color-neutral-500)]">
          {step === 1 ? "Amount" : step === 2 ? "Bank account" : "Review"}
        </span>
      </div>

      {/* Step panels */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ── Step 1: Amount ── */}
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-5"
            >
              <div>
                <label className="block text-sm font-semibold text-[var(--color-ink)] mb-3">
                  Withdraw{" "}
                  <span className="text-[var(--color-accent-gold)]">{fmt(grossPaise)}</span>
                </label>
                <input
                  type="range"
                  min={minRupees}
                  max={maxRupees}
                  step={100}
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(Number(e.target.value))}
                  className="w-full accent-[var(--color-accent-gold)] cursor-pointer"
                />
                <div className="flex justify-between text-xs text-[var(--color-neutral-500)] mt-1">
                  <span>{fmt(min_payout_paise)}</span>
                  <span>{fmt(available_paise)}</span>
                </div>
              </div>

              <Breakdown grossPaise={grossPaise} />

              <Button
                onClick={() => goTo(2)}
                className="w-full rounded-[var(--radius-button)] bg-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold-hover)] text-white font-semibold"
              >
                Continue <ChevronRight className="size-4" />
              </Button>
            </motion.div>
          )}

          {/* ── Step 2: Bank account ── */}
          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {primaryAccount ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-5 flex items-center gap-4">
                  <div className="size-10 rounded-full bg-[var(--color-ocean)] flex items-center justify-center">
                    <Building2 className="size-5 text-[var(--color-neutral-600)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">
                      ●●●● ●●●● ●●●● {primaryAccount.account_number_last4}
                    </p>
                    <p className="text-xs text-[var(--color-neutral-500)]">
                      {primaryAccount.ifsc_code} · {primaryAccount.account_holder_name}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-blush)]/40 p-5 text-center">
                  <p className="text-sm text-[var(--color-neutral-600)]">
                    No bank account linked. Please add one in settings.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => goTo(1)}
                  className="flex-1 rounded-[var(--radius-button)]"
                >
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button
                  onClick={() => goTo(3)}
                  disabled={!primaryAccount}
                  className="flex-1 rounded-[var(--radius-button)] bg-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold-hover)] text-white font-semibold"
                >
                  Confirm this account <ChevronRight className="size-4" />
                </Button>
              </div>

              <p className="text-center text-xs text-[var(--color-neutral-400)]">
                Want a different account? Contact support — bank account
                management UI is coming soon.
              </p>
            </motion.div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {success ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-8"
                >
                  <div className="size-16 mx-auto mb-4 rounded-full bg-[var(--color-mint)] flex items-center justify-center">
                    <CheckCircle2 className="size-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--color-ink)] mb-2">
                    Processing…
                  </h2>
                  <p className="text-sm text-[var(--color-neutral-500)]">
                    Your withdrawal is being processed. Redirecting to history…
                  </p>
                </motion.div>
              ) : (
                <>
                  <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-5 space-y-3">
                    <h3 className="text-sm font-bold text-[var(--color-ink)]">Summary</h3>
                    <Breakdown grossPaise={grossPaise} />
                    {primaryAccount && (
                      <div className="flex items-center gap-3 pt-2">
                        <Building2 className="size-4 text-[var(--color-neutral-500)]" />
                        <span className="text-sm text-[var(--color-neutral-600)]">
                          ●●●● {primaryAccount.account_number_last4} ·{" "}
                          {primaryAccount.ifsc_code}
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-[var(--color-neutral-400)] bg-[var(--color-ocean)]/30 rounded-xl px-4 py-3">
                    Funds usually arrive in 24-48 hours via IMPS. TDS at 1% is deducted
                    per Income Tax Act Section 194-O.
                  </p>

                  {error && (
                    <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => goTo(2)}
                      disabled={isPending}
                      className="flex-1 rounded-[var(--radius-button)]"
                    >
                      <ArrowLeft className="size-4" /> Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isPending}
                      className="flex-1 rounded-[var(--radius-button)] bg-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold-hover)] text-white font-semibold"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Submitting…
                        </>
                      ) : (
                        "Submit withdrawal"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
      <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-ink)]">
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-neutral-500)]">
        {body}
      </p>
    </div>
  );
}
