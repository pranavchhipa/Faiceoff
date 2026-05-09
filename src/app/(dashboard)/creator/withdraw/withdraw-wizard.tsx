"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/withdraw — 3-step wizard (Amount → Bank → Confirm) + below-min state
// + success state. Reads from POST /api/payouts/request (contract unchanged).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IndianRupee,
  Building2,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Wallet,
  ShieldCheck,
  AlertCircle,
  Receipt,
  ArrowRight,
  Banknote,
  Sparkles,
  TrendingUp,
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

const TDS_RATE = 0.01;
const PROCESSING_FEE_PAISE = 2500;

function computeTDS(gross: number): number { return Math.round(gross * TDS_RATE); }
function computeFee(): number { return PROCESSING_FEE_PAISE; }
function computeNet(gross: number): number { return gross - computeTDS(gross) - computeFee(); }

const slideVariants = {
  enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
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

const STEP_LABELS = ["Amount", "Bank", "Confirm"] as const;

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

  const initialAmount = Math.max(minRupees, Math.min(maxRupees, minRupees));
  const [amountRupees, setAmountRupees] = useState(initialAmount);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState(1);
  const [success, setSuccess] = useState<{ payout_id: string; net: number; gross: number } | null>(null);
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
        const json = (await res.json()) as {
          payout_id?: string;
          payoutId?: string;
          breakdown?: { gross: number; tds: number; fee: number; net: number };
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setError(json.message ?? json.error ?? "Withdrawal failed. Please try again.");
          return;
        }
        const id = json.payout_id ?? json.payoutId ?? "";
        const net = json.breakdown?.net ?? computeNet(grossPaise);
        setSuccess({ payout_id: id, net, gross: grossPaise });
        toast.success("Withdrawal submitted");
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  /* ═══════════ Below-minimum state ═══════════ */
  if (!can_withdraw) {
    const remainingPaise = Math.max(0, min_payout_paise - available_paise);
    const progressPct = Math.min(100, Math.round((available_paise / min_payout_paise) * 100));
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 lg:px-8 lg:py-8">
        {/* Back */}
        <Link
          href="/creator/earnings"
          className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to earnings
        </Link>

        {/* Hero */}
        <div className="mb-6">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <IndianRupee className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Withdraw
          </p>
          <h1 className="mt-2 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[40px]">
            Almost there.
          </h1>
          <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
            Cross the minimum payout threshold and withdraw to your bank — TDS is
            handled at source per Section 194-O.
          </p>
        </div>

        {/* Below-min card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className="h-[3px] w-full bg-[var(--color-primary)]" />

          <div className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Below minimum
                </p>
                <h2 className="font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
                  A little more to go
                </h2>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Stat
                label="Available now"
                value={fmt(available_paise)}
                tone="default"
              />
              <Stat
                label="Minimum payout"
                value={fmt(min_payout_paise)}
                tone="primary"
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                  Progress to minimum
                </span>
                <span className="font-mono text-[10px] font-700 text-[var(--color-foreground)]">{progressPct}%</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]"
                />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                Earn{" "}
                <span className="font-700 text-[var(--color-foreground)]">{fmt(remainingPaise)}</span>{" "}
                more to unlock withdrawals. Each approval clears to Available
                after a 7-day hold.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/creator/approvals")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
              >
                Review approvals
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => router.push("/creator/earnings")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-[13px] font-600 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)]"
              >
                Back to earnings
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoCard icon={Banknote} title="IMPS in 24-48h" body="Once you cross the minimum, payouts land in 1-2 business days." />
          <InfoCard icon={ShieldCheck} title="TDS handled" body="1% TDS deducted at source per Section 194-O. We file for you." />
          <InfoCard icon={Receipt} title="Flat ₹25 fee" body="One processing fee per withdrawal. No hidden charges." />
        </div>
      </div>
    );
  }

  /* ═══════════ Success state ═══════════ */
  if (success) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-6 lg:px-8 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className="h-[3px] w-full bg-emerald-500" />

          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 18 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10"
            >
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </motion.div>

            <p className="mt-6 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Withdrawal submitted
            </p>
            <h2 className="mt-2 font-display text-[28px] font-800 leading-tight tracking-tight text-[var(--color-foreground)] md:text-[32px]">
              Funds on the way.
            </h2>
            <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
              We&rsquo;ve queued the payout to your bank. Expect funds in your
              account within 1-2 business days.
            </p>

            {/* Receipt */}
            <div className="mx-auto mt-6 max-w-[440px] space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-4 text-left">
              <ReceiptRow label="You&rsquo;ll receive" value={fmt(success.net)} highlight />
              <ReceiptRow label="Gross requested" value={fmt(success.gross)} />
              {success.payout_id && (
                <ReceiptRow label="Payout reference" value={success.payout_id.slice(0, 8).toUpperCase()} mono />
              )}
              {primaryAccount && (
                <ReceiptRow
                  label="Bank"
                  value={`····${primaryAccount.account_number_last4} · ${primaryAccount.ifsc_code}`}
                  mono
                />
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => router.push("/creator/payouts")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
              >
                <Receipt className="h-3.5 w-3.5" />
                Track in Payouts
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => router.push("/creator/earnings")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-[13px] font-600 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)]"
              >
                Back to earnings
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ═══════════ Wizard ═══════════ */
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Back */}
      <Link
        href="/creator/earnings"
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to earnings
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Wallet className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          Withdraw — step {step} of 3
        </p>
        <h1 className="mt-2 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[40px]">
          {step === 1 && "How much?"}
          {step === 2 && "Where to?"}
          {step === 3 && "Looks good?"}
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-muted-foreground)]">
          Available <span className="font-mono font-700 text-[var(--color-foreground)]">{fmt(available_paise)}</span>{" "}
          · Min payout <span className="font-mono font-700 text-[var(--color-foreground)]">{fmt(min_payout_paise)}</span>
        </p>
      </motion.div>

      {/* Stepper */}
      <Stepper step={step} onStepClick={(s) => s < step && goTo(s)} />

      {/* Step card */}
      <div className="relative mt-5 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ── Step 1: Amount ── */}
          {step === 1 && (
            <motion.section
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
            >
              <SectionHeader
                eyebrow="Step 1 of 3"
                title="Choose amount"
                sub="Slide to set the gross amount you'd like to withdraw."
                icon={IndianRupee}
              />

              <div className="space-y-5 p-5">
                {/* Big amount display */}
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-5 text-center">
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    You&rsquo;re withdrawing
                  </p>
                  <p className="mt-2 font-display text-[44px] font-800 leading-none tracking-tight text-[var(--color-primary)]">
                    {fmt(grossPaise)}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    of {fmt(available_paise)} available
                  </p>
                </div>

                {/* Slider */}
                <div>
                  <input
                    type="range"
                    min={minRupees}
                    max={maxRupees}
                    step={100}
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(Number(e.target.value))}
                    className="w-full cursor-pointer accent-[var(--color-primary)]"
                  />
                  <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    <span>{fmt(min_payout_paise)}</span>
                    <span>{fmt(available_paise)}</span>
                  </div>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Min", value: minRupees },
                    { label: "25%", value: Math.max(minRupees, Math.floor(maxRupees * 0.25)) },
                    { label: "50%", value: Math.max(minRupees, Math.floor(maxRupees * 0.5)) },
                    { label: "Max", value: maxRupees },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setAmountRupees(preset.value)}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.14em] transition ${
                        amountRupees === preset.value
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                          : "border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Breakdown preview */}
                <Breakdown grossPaise={grossPaise} />

                <button
                  onClick={() => goTo(2)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
                >
                  Continue to bank
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.section>
          )}

          {/* ── Step 2: Bank ── */}
          {step === 2 && (
            <motion.section
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
            >
              <SectionHeader
                eyebrow="Step 2 of 3"
                title="Confirm bank account"
                sub="Funds land here via IMPS within 1-2 business days."
                icon={Building2}
              />

              <div className="space-y-4 p-5">
                {primaryAccount ? (
                  <div className="flex items-center gap-4 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
                          {primaryAccount.account_holder_name}
                        </p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.12em] text-emerald-600">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Primary
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[12px] font-600 text-[var(--color-muted-foreground)]">
                        ●●●● ●●●● ●●●● {primaryAccount.account_number_last4}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        IFSC {primaryAccount.ifsc_code}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
                        No bank account linked
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                        Add a bank account from earnings page settings before
                        you can withdraw.
                      </p>
                      <Link
                        href="/creator/earnings"
                        className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)] hover:underline"
                      >
                        Go add one <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}

                <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  Need a different account? Contact support — multi-account UI coming soon.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => goTo(1)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-[13px] font-600 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={() => goTo(3)}
                    disabled={!primaryAccount}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                  >
                    Confirm this account
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <motion.section
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
            >
              <SectionHeader
                eyebrow="Step 3 of 3"
                title="Review & confirm"
                sub="Last check — submission is final and triggers an IMPS transfer."
                icon={Sparkles}
              />

              <div className="space-y-4 p-5">
                {/* Net banner — biggest payoff */}
                <div className="overflow-hidden rounded-xl border-2 border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 to-[var(--color-primary)]/4 p-5 text-center">
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    You&rsquo;ll receive
                  </p>
                  <p className="mt-2 font-display text-[36px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                    {fmt(computeNet(grossPaise))}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    after TDS &amp; processing fee
                  </p>
                </div>

                {/* Breakdown */}
                <Breakdown grossPaise={grossPaise} variant="confirm" />

                {/* Bank summary */}
                {primaryAccount && (
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                        Sending to
                      </p>
                      <p className="mt-0.5 truncate font-display text-[13px] font-700 text-[var(--color-foreground)]">
                        {primaryAccount.account_holder_name}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        ····{primaryAccount.account_number_last4} · {primaryAccount.ifsc_code}
                      </p>
                    </div>
                  </div>
                )}

                {/* Compliance note */}
                <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-4 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                  <p>
                    Funds typically arrive in 24-48 hours via IMPS. 1% TDS deducted
                    at source per Income Tax Act Section 194-O — we file on your
                    behalf and email a quarterly statement.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-500">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => goTo(2)}
                    disabled={isPending}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-[13px] font-600 text-[var(--color-foreground)] transition hover:bg-[var(--color-secondary)] disabled:opacity-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        Submit withdrawal
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═══════════ Stepper ═══════════ */
function Stepper({
  step,
  onStepClick,
}: {
  step: 1 | 2 | 3;
  onStepClick: (s: 1 | 2 | 3) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex items-center justify-between gap-2">
        {[1, 2, 3].map((s, i) => {
          const isActive = s === step;
          const isDone = s < step;
          const isClickable = isDone;
          return (
            <div key={s} className="flex flex-1 items-center gap-2">
              <button
                onClick={() => isClickable && onStepClick(s as 1 | 2 | 3)}
                disabled={!isClickable}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 transition-all ${
                  isClickable ? "hover:bg-[var(--color-secondary)]" : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-800 transition-all ${
                    isActive
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] ring-4 ring-[var(--color-primary)]/15"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                </span>
                <span
                  className={`hidden font-mono text-[10px] font-700 uppercase tracking-[0.16em] sm:inline ${
                    isActive
                      ? "text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {STEP_LABELS[i]}
                </span>
              </button>
              {i < 2 && (
                <div className="relative h-px flex-1 bg-[var(--color-border)]">
                  <motion.div
                    initial={false}
                    animate={{ width: s < step ? "100%" : "0%" }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-y-0 left-0 bg-[var(--color-primary)]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════ Section header (inside step cards) ═══════════ */
function SectionHeader({
  eyebrow,
  title,
  sub,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
          {title}
        </h2>
        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">{sub}</p>
      </div>
    </div>
  );
}

/* ═══════════ Stat (below-min state) ═══════════ */
function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
      <p className="font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p
        className={`mt-1.5 font-display text-[22px] font-800 leading-none tracking-tight ${
          tone === "primary" ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ═══════════ Breakdown ═══════════ */
function Breakdown({
  grossPaise,
  variant = "default",
}: {
  grossPaise: number;
  variant?: "default" | "confirm";
}) {
  const tds = computeTDS(grossPaise);
  const fee = computeFee();
  const net = computeNet(grossPaise);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <Receipt className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          Breakdown
        </p>
      </div>
      <div className="space-y-2 px-4 py-3 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-muted-foreground)]">Gross amount</span>
          <span className="font-mono font-700 text-[var(--color-foreground)]">{fmt(grossPaise)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-muted-foreground)]">TDS (1%)</span>
          <span className="font-mono font-700 text-red-500">−{fmt(tds)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-muted-foreground)]">Processing fee</span>
          <span className="font-mono font-700 text-red-500">−{fmt(fee)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
        <span className="font-display text-[13px] font-800 text-[var(--color-foreground)]">
          {variant === "confirm" ? "You'll receive" : "Net to bank"}
        </span>
        <span className="font-display text-[16px] font-800 text-[var(--color-primary)]">{fmt(net)}</span>
      </div>
    </div>
  );
}

/* ═══════════ Receipt row (success state) ═══════════ */
function ReceiptRow({
  label,
  value,
  highlight = false,
  mono = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between text-[13px] ${highlight ? "border-b border-[var(--color-border)] pb-2 mb-1" : ""}`}>
      <span className="text-[var(--color-muted-foreground)]" dangerouslySetInnerHTML={{ __html: label }} />
      <span
        className={`text-right ${mono ? "font-mono" : ""} ${
          highlight
            ? "font-display text-[16px] font-800 text-[var(--color-primary)]"
            : "font-700 text-[var(--color-foreground)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ═══════════ Info card (below-min state) ═══════════ */
function InfoCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:border-[var(--color-primary)]/30">
      <Icon className="h-4 w-4 text-[var(--color-primary)]" />
      <p className="mt-2.5 font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">{body}</p>
    </div>
  );
}
