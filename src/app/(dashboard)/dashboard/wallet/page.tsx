"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  IndianRupee,
  Clock,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ── Types ── */

interface WalletTransaction {
  id: string;
  type: string;
  amount_paise: number;
  direction: "credit" | "debit";
  reference_type: string | null;
  description: string | null;
  balance_after_paise: number;
  created_at: string;
}

/* ── Helpers ── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    topup: "Wallet Top-up",
    generation_charge: "Generation Charge",
    generation_earning: "Generation Earning",
    generation_spend: "Generation Spend",
    payout: "Payout to Bank",
    refund: "Refund",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

/* ── Component ── */
//
// PHASE 9 STUB (2026-04-22) — legacy gateway retired, Cashfree live.
//
// Top-up flow moved to /api/credits/top-up (Cashfree Collect + Drop-in). The
// full brand credits UI is being rebuilt in Chunk B at /brand/credits — this
// page stays as a read-only historical view of the archived
// wallet_transactions_archive table and surfaces a banner pointing at the new
// flow.
//
// Payout flow will move to /api/payouts/initiate (Cashfree Payouts) in
// Chunk B. Until then the creator-side button is disabled with a tooltip.

export default function WalletPage() {
  const { user, isLoading: authLoading } = useAuth();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Payout state (creator)
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutLoading] = useState(false);
  const [payoutError] = useState<string | null>(null);
  const [payoutSuccess] = useState(false);

  const role = user?.user_metadata?.role ?? "creator";

  const fetchWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await fetch("/api/wallet/transactions", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          transactions: WalletTransaction[];
          balance_paise: number;
        };
        setTransactions(data.transactions ?? []);
        setBalance(data.balance_paise ?? 0);
      } else {
        console.error("Failed to load wallet transactions:", res.status);
      }
    } catch (err) {
      console.error("Wallet fetch error:", err);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchWallet();
  }, [authLoading, fetchWallet]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-outline-variant)]/30 border-t-[var(--color-accent-gold)]" />
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="max-w-5xl"
      >
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-on-surface)]">
            {role === "brand" ? "Wallet" : "Earnings"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-outline-variant)]">
            {role === "brand"
              ? "Historical balance and transactions. The new credits system is coming soon."
              : "Historical earnings and transactions. Payouts are being upgraded to Cashfree."}
          </p>
        </div>

        {/* Cashfree migration banner */}
        <div className="mb-6 rounded-2xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/15">
              <Sparkles className="size-4 text-[var(--color-accent-gold)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-700 text-[var(--color-on-surface)] mb-1">
                {role === "brand"
                  ? "New credits system coming soon"
                  : "Payouts are being upgraded"}
              </p>
              <p className="text-xs text-[var(--color-outline-variant)] leading-relaxed mb-3">
                {role === "brand"
                  ? "We're rolling out a Cashfree-powered credits system with better pricing, instant top-ups, and live balance. The new brand credits dashboard will launch soon — your historical transactions are preserved below."
                  : "Creator payouts are moving to Cashfree for faster settlements and better coverage across Indian banks. Until then, balance and earnings continue to display. For urgent payout requests, contact support."}
              </p>
              {role === "brand" && (
                <Link
                  href="mailto:marketing@rectangled.io?subject=Credits%20top-up%20—%20early%20access"
                  className="inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-accent-gold)] hover:underline"
                >
                  Contact support for early access
                  <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Balance Card (read-only archive view) */}
        <div className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-4 sm:p-6 shadow-sm mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-2">
                {role === "brand"
                  ? "HISTORICAL BALANCE"
                  : "HISTORICAL EARNINGS"}
              </p>
              <p className="text-3xl sm:text-4xl font-700 text-[var(--color-on-surface)] break-all">
                {formatINR(balance)}
              </p>
            </div>
            <div className="flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/10">
              {role === "brand" ? (
                <Wallet className="size-6 sm:size-7 text-[var(--color-accent-gold)]" />
              ) : (
                <IndianRupee className="size-6 sm:size-7 text-[var(--color-accent-gold)]" />
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 sm:gap-3">
            {role === "brand" && (
              <Button
                disabled
                className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white opacity-50 cursor-not-allowed"
                title="Cashfree integration coming soon — top-up temporarily disabled"
              >
                <Sparkles className="size-4" />
                Add Funds (coming soon)
              </Button>
            )}
            {role === "creator" && (
              <Button
                disabled
                className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white opacity-50 cursor-not-allowed"
                title="Cashfree Payouts integration coming soon"
              >
                <ArrowUpRight className="size-4" />
                Request Payout (coming soon)
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={fetchWallet}
              className="rounded-xl text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>

        {/* Transactions */}
        <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-4">
          TRANSACTION HISTORY
        </p>

        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-10 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
              <Clock className="size-5 text-[var(--color-outline-variant)]" />
            </div>
            <p className="text-sm font-600 text-[var(--color-on-surface)] mb-1">
              No transactions yet
            </p>
            <p className="text-xs text-[var(--color-outline-variant)]">
              {role === "brand"
                ? "The new Cashfree credits system will light up once it launches."
                : "Earnings from approved generations will appear here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="flex items-center gap-3 sm:gap-4 rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-3 sm:p-4"
                >
                  {/* Direction icon */}
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                      tx.direction === "credit"
                        ? "bg-[var(--color-mint)]"
                        : "bg-[var(--color-blush)]"
                    }`}
                  >
                    {tx.direction === "credit" ? (
                      <ArrowDownLeft className="size-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="size-4 text-red-500" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-[var(--color-on-surface)]">
                      {txTypeLabel(tx.type)}
                    </p>
                    {tx.description && (
                      <p className="text-xs text-[var(--color-outline-variant)] truncate">
                        {tx.description}
                      </p>
                    )}
                    <p className="text-xs text-[var(--color-outline-variant)] mt-0.5">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-700 ${
                        tx.direction === "credit"
                          ? "text-green-600"
                          : "text-[var(--color-on-surface)]"
                      }`}
                    >
                      {tx.direction === "credit" ? "+" : "-"}
                      {formatINR(tx.amount_paise)}
                    </p>
                    <p className="text-xs text-[var(--color-outline-variant)]">
                      Bal: {formatINR(tx.balance_after_paise)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ── Payout Modal (disabled — kept as placeholder for Chunk B) ── */}
      <AnimatePresence>
        {showPayoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--color-on-surface)]/40"
              onClick={() => !payoutLoading && setShowPayoutModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-6 shadow-[var(--shadow-elevated)] mx-4"
            >
              {/* Close */}
              <button
                onClick={() => !payoutLoading && setShowPayoutModal(false)}
                className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-xl text-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-on-surface)]"
              >
                <X className="size-4" />
              </button>

              {payoutSuccess ? (
                <div className="text-center py-4">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-mint)]">
                    <CheckCircle2 className="size-6 text-green-600" />
                  </div>
                  <h3 className="text-lg font-700 text-[var(--color-on-surface)] mb-1">
                    Payout Requested
                  </h3>
                  <p className="text-sm text-[var(--color-outline-variant)]">
                    {formatINR(parseFloat(payoutAmount) * 100)} will be
                    transferred to your bank account within 3-5 business days.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-700 text-[var(--color-on-surface)] mb-1">
                    Request Payout
                  </h3>
                  <p className="text-sm text-[var(--color-outline-variant)] mb-5">
                    Payouts are being upgraded to Cashfree. Contact support for
                    urgent requests.
                  </p>

                  <div className="rounded-xl bg-[var(--color-surface-container-low)] px-4 py-3 mb-4">
                    <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-0.5">
                      Available Balance
                    </p>
                    <p className="text-lg font-700 text-[var(--color-accent-gold)]">
                      {formatINR(balance)}
                    </p>
                  </div>

                  <label className="block text-sm font-600 text-[var(--color-on-surface)] mb-2">
                    Payout Amount (₹)
                  </label>
                  <div className="relative mb-4">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-outline-variant)]">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min={100}
                      max={balance / 100}
                      step={1}
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="rounded-xl pl-7 text-lg font-600 border-[var(--color-outline-variant)]/15"
                      disabled
                    />
                  </div>

                  {payoutError && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 mb-4">
                      <AlertCircle className="size-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600">{payoutError}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowPayoutModal(false)}
                      className="flex-1 rounded-xl border-[var(--color-outline-variant)]/15 font-600 text-[var(--color-on-surface)]"
                    >
                      Close
                    </Button>
                    <Link
                      href="mailto:marketing@rectangled.io?subject=Payout%20request"
                      className="flex-1"
                    >
                      <Button className="w-full rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90">
                        <ExternalLink className="size-4" />
                        Contact Support
                      </Button>
                    </Link>
                  </div>

                  <p className="mt-4 text-[11px] text-[var(--color-outline-variant)] text-center">
                    Cashfree Payouts integration is scheduled for Chunk B.
                  </p>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
