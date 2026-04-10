"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  IndianRupee,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
    payout: "Payout",
    refund: "Refund",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

/* ── Component ── */

export default function WalletPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);

  const role = user?.user_metadata?.role ?? "creator";

  const fetchWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setTransactions(data as unknown as WalletTransaction[]);
      if (data.length > 0) {
        setBalance(
          (data[0] as unknown as WalletTransaction).balance_after_paise
        );
      }
    }

    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading) fetchWallet();
  }, [authLoading, fetchWallet]);

  async function handleTopup() {
    setTopupLoading(true);
    try {
      const res = await fetch("/api/wallet/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: 100_00 }), // Default ₹100
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      // Open Razorpay checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
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
          // Verify payment
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
            fetchWallet();
          }
        },
        prefill: {
          email: user?.email ?? "",
        },
        theme: {
          color: "#c9a96e",
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Topup error:", err);
    } finally {
      setTopupLoading(false);
    }
  }

  if (authLoading || loading) {
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
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-3xl"
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-800 tracking-tight text-[var(--color-ink)]">
          Wallet
        </h1>
        <p className="mt-1 text-[var(--color-neutral-500)]">
          {role === "brand"
            ? "Manage your campaign budget and payments."
            : "Track your earnings and request payouts."}
        </p>
      </div>

      {/* Balance Card */}
      <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-500 text-[var(--color-neutral-500)] mb-1">
              Current Balance
            </p>
            <p className="font-[family-name:var(--font-display)] text-4xl font-800 text-[var(--color-ink)]">
              {formatINR(balance)}
            </p>
          </div>
          <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-gold)]/10">
            <Wallet className="size-7 text-[var(--color-gold)]" />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          {role === "brand" && (
            <Button
              onClick={handleTopup}
              disabled={topupLoading}
              className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]"
            >
              {topupLoading ? (
                <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <Plus className="size-4" />
                  Add Funds
                </>
              )}
            </Button>
          )}
          {role === "creator" && balance > 0 && (
            <Button
              variant="outline"
              className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600"
            >
              <ArrowUpRight className="size-4" />
              Request Payout
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={fetchWallet}
            className="rounded-[var(--radius-button)]"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      <Separator className="mb-6 bg-[var(--color-neutral-200)]" />

      {/* Transactions */}
      <h2 className="font-[family-name:var(--font-display)] text-lg font-700 text-[var(--color-ink)] mb-4">
        Transaction History
      </h2>

      {transactions.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
            <Clock className="size-5 text-[var(--color-neutral-400)]" />
          </div>
          <p className="text-sm font-600 text-[var(--color-ink)] mb-1">
            No transactions yet
          </p>
          <p className="text-xs text-[var(--color-neutral-500)]">
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
                className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4"
              >
                {/* Direction icon */}
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    tx.direction === "credit"
                      ? "bg-[var(--color-mint)]/40"
                      : "bg-[var(--color-blush)]/40"
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
                  <p className="text-sm font-600 text-[var(--color-ink)]">
                    {txTypeLabel(tx.type)}
                  </p>
                  {tx.description && (
                    <p className="text-xs text-[var(--color-neutral-500)] truncate">
                      {tx.description}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-neutral-400)] mt-0.5">
                    {formatDate(tx.created_at)}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-700 ${
                      tx.direction === "credit"
                        ? "text-green-600"
                        : "text-[var(--color-ink)]"
                    }`}
                  >
                    {tx.direction === "credit" ? "+" : "-"}
                    {formatINR(tx.amount_paise)}
                  </p>
                  <p className="text-xs text-[var(--color-neutral-400)]">
                    Bal: {formatINR(tx.balance_after_paise)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
