"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Script from "next/script";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  IndianRupee,
  Clock,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
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

export default function WalletPage() {
  const { user, isLoading: authLoading } = useAuth();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);

  // Top-up modal
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("5000"); // rupees
  const [topupError, setTopupError] = useState<string | null>(null);

  // Payout state
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

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

  /* ── Brand: Razorpay top-up ── */
  // Ensures the Razorpay checkout.js is loaded. The <Script> tag covers
  // normal navigations, but on fast clicks (or if the user lands directly
  // here) we guarantee it with a lazy loader.
  function ensureRazorpayLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof window !== "undefined" && (window as any).Razorpay) {
        resolve();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Razorpay script"))
        );
        return;
      }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Razorpay script"));
      document.body.appendChild(s);
    });
  }

  async function handleTopup() {
    setTopupError(null);

    const rupees = parseFloat(topupAmount);
    if (isNaN(rupees) || rupees < 100) {
      setTopupError("Minimum top-up is ₹100");
      return;
    }
    if (rupees > 200_000) {
      setTopupError("Maximum top-up is ₹2,00,000 per transaction");
      return;
    }

    const amountPaise = Math.round(rupees * 100);

    setTopupLoading(true);
    try {
      await ensureRazorpayLoaded();

      const res = await fetch("/api/wallet/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: amountPaise }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        throw new Error(
          "Payment gateway not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID missing)"
        );
      }

      const options = {
        key: keyId,
        amount: data.amount,
        currency: "INR",
        name: "Faiceoff",
        description: "Wallet Top-up",
        order_id: data.order_id,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch("/api/wallet/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });

            if (verifyRes.ok) {
              setShowTopupModal(false);
              fetchWallet();
            } else {
              const verr = await verifyRes.json().catch(() => ({}));
              setTopupError(verr.error ?? "Payment verification failed");
            }
          } catch (err) {
            setTopupError(
              err instanceof Error ? err.message : "Verification error"
            );
          }
        },
        modal: {
          ondismiss: () => {
            setTopupLoading(false);
          },
        },
        prefill: { email: user?.email ?? "" },
        theme: { color: "#c9a96e" },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
        setTopupError(resp.error?.description ?? "Payment failed");
        setTopupLoading(false);
      });
      rzp.open();
    } catch (err) {
      console.error("Topup error:", err);
      setTopupError(err instanceof Error ? err.message : "Top-up failed");
      setTopupLoading(false);
    }
  }

  /* ── Creator: Request payout ── */
  async function handlePayout() {
    setPayoutError(null);
    setPayoutLoading(true);

    const amountRupees = parseFloat(payoutAmount);
    if (isNaN(amountRupees) || amountRupees <= 0) {
      setPayoutError("Enter a valid amount");
      setPayoutLoading(false);
      return;
    }

    const amountPaise = Math.round(amountRupees * 100);

    try {
      const res = await fetch("/api/wallet/request-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: amountPaise }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPayoutError(data.error || "Payout request failed");
        setPayoutLoading(false);
        return;
      }

      setPayoutSuccess(true);
      setBalance(data.new_balance_paise);

      // Close modal after 2s and refresh
      setTimeout(() => {
        setShowPayoutModal(false);
        setPayoutSuccess(false);
        setPayoutAmount("");
        fetchWallet();
      }, 2000);
    } catch (err) {
      setPayoutError(
        err instanceof Error ? err.message : "Network error",
      );
    } finally {
      setPayoutLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-outline-variant)]/30 border-t-[var(--color-accent-gold)]" />
      </div>
    );
  }

  return (
    <>
      {/* Razorpay checkout.js — required for window.Razorpay constructor */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="max-w-5xl"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-800 tracking-tight text-[var(--color-on-surface)]">
            {role === "brand" ? "Wallet" : "Earnings"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-outline-variant)]">
            {role === "brand"
              ? "Manage your campaign budget and payments."
              : "Track your earnings and request payouts."}
          </p>
        </div>

        {/* Balance Card */}
        <div className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-2">
                {role === "brand" ? "CURRENT BALANCE" : "AVAILABLE EARNINGS"}
              </p>
              <p className="text-4xl font-700 text-[var(--color-on-surface)]">
                {formatINR(balance)}
              </p>
            </div>
            <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/10">
              {role === "brand" ? (
                <Wallet className="size-7 text-[var(--color-accent-gold)]" />
              ) : (
                <IndianRupee className="size-7 text-[var(--color-accent-gold)]" />
              )}
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            {role === "brand" && (
              <Button
                onClick={() => {
                  setTopupError(null);
                  setTopupAmount("5000");
                  setShowTopupModal(true);
                }}
                disabled={topupLoading}
                className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
              >
                <Plus className="size-4" />
                Add Funds
              </Button>
            )}
            {role === "creator" && (
              <Button
                onClick={() => {
                  setPayoutError(null);
                  setPayoutSuccess(false);
                  setPayoutAmount("");
                  setShowPayoutModal(true);
                }}
                disabled={balance < 10000}
                className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                <ArrowUpRight className="size-4" />
                Request Payout
              </Button>
            )}
            {role === "creator" && balance < 10000 && balance > 0 && (
              <p className="flex items-center text-xs text-[var(--color-outline-variant)]">
                Min. payout: ₹100
              </p>
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
                ? "Add funds to your wallet to start running campaigns."
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
                  className="flex items-center gap-4 rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-4"
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

      {/* ── Top-up Modal ── */}
      <AnimatePresence>
        {showTopupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--color-on-surface)]/40"
              onClick={() => !topupLoading && setShowTopupModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-6 shadow-[var(--shadow-elevated)] mx-4"
            >
              <button
                onClick={() => !topupLoading && setShowTopupModal(false)}
                className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-xl text-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-on-surface)]"
              >
                <X className="size-4" />
              </button>

              <h3 className="text-xl font-700 text-[var(--color-on-surface)] mb-1">
                Add Funds
              </h3>
              <p className="text-sm text-[var(--color-outline-variant)] mb-5">
                Top up your wallet to run campaigns. Full budget is held in
                escrow when you create a campaign.
              </p>

              {/* Quick presets */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[500, 1000, 5000, 10000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTopupAmount(String(preset));
                      setTopupError(null);
                    }}
                    className={`rounded-xl px-3 py-2 text-sm font-600 transition-colors ${
                      topupAmount === String(preset)
                        ? "bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] border border-[var(--color-accent-gold)]/40"
                        : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] border border-transparent hover:bg-[var(--color-surface-container)]"
                    }`}
                  >
                    ₹{preset.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-600 text-[var(--color-on-surface)] mb-2">
                Custom Amount (₹)
              </label>
              <div className="relative mb-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-outline-variant)]">
                  ₹
                </span>
                <Input
                  type="number"
                  min={100}
                  max={200000}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => {
                    setTopupAmount(e.target.value);
                    setTopupError(null);
                  }}
                  placeholder="Enter amount"
                  className="rounded-xl pl-7 text-lg font-600 border-[var(--color-outline-variant)]/15"
                />
              </div>
              <p className="text-xs text-[var(--color-outline-variant)] mb-5">
                Min: ₹100 • Max: ₹2,00,000
              </p>

              {topupError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 mb-4">
                  <AlertCircle className="size-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{topupError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowTopupModal(false)}
                  disabled={topupLoading}
                  className="flex-1 rounded-xl border-[var(--color-outline-variant)]/15 font-600 text-[var(--color-on-surface)]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleTopup}
                  disabled={topupLoading || !topupAmount}
                  className="flex-1 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
                >
                  {topupLoading ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      <Plus className="size-4" />
                      Proceed to Pay
                    </>
                  )}
                </Button>
              </div>

              <p className="mt-4 text-[11px] text-[var(--color-outline-variant)] text-center">
                Razorpay test mode: card 4111 1111 1111 1111, any future
                expiry, any CVV.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Payout Modal ── */}
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
                /* Success state */
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
                /* Form state */
                <>
                  <h3 className="text-xl font-700 text-[var(--color-on-surface)] mb-1">
                    Request Payout
                  </h3>
                  <p className="text-sm text-[var(--color-outline-variant)] mb-5">
                    Enter the amount you want to withdraw to your bank account.
                  </p>

                  {/* Available balance */}
                  <div className="rounded-xl bg-[var(--color-surface-container-low)] px-4 py-3 mb-4">
                    <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-0.5">
                      Available Balance
                    </p>
                    <p className="text-lg font-700 text-[var(--color-accent-gold)]">
                      {formatINR(balance)}
                    </p>
                  </div>

                  {/* Amount input */}
                  <label className="block text-sm font-600 text-[var(--color-on-surface)] mb-2">
                    Payout Amount (₹)
                  </label>
                  <div className="relative mb-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-outline-variant)]">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min={100}
                      max={balance / 100}
                      step={1}
                      value={payoutAmount}
                      onChange={(e) => {
                        setPayoutAmount(e.target.value);
                        setPayoutError(null);
                      }}
                      placeholder="Enter amount"
                      className="rounded-xl pl-7 text-lg font-600 border-[var(--color-outline-variant)]/15"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-xs text-[var(--color-outline-variant)]">
                      Min: ₹100
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setPayoutAmount(String(Math.floor(balance / 100)))
                      }
                      className="text-xs font-600 text-[var(--color-accent-gold)] hover:underline"
                    >
                      Withdraw all
                    </button>
                  </div>

                  {/* Error */}
                  {payoutError && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 mb-4">
                      <AlertCircle className="size-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600">{payoutError}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowPayoutModal(false)}
                      disabled={payoutLoading}
                      className="flex-1 rounded-xl border-[var(--color-outline-variant)]/15 font-600 text-[var(--color-on-surface)]"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePayout}
                      disabled={payoutLoading || !payoutAmount}
                      className="flex-1 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
                    >
                      {payoutLoading ? (
                        <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <>
                          <ArrowUpRight className="size-4" />
                          Confirm Payout
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Info */}
                  <p className="mt-4 text-[11px] text-[var(--color-outline-variant)] text-center">
                    Payouts are processed within 3-5 business days to your
                    registered bank account.
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
