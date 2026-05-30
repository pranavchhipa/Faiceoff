"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { useCachedFetch, invalidateCache } from "@/lib/hooks/use-cached-fetch";

interface Withdrawal {
  id: string;
  amount_paise: number;
  status: string;
  created_at: string;
  creator_id: string;
  holder_name: string;
  ifsc: string;
  account_masked: string;
  user_display_name: string;
}

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(paise / 100);
}

export default function AdminPayoutsPage() {
  const { data, loading: rawLoading, refresh } = useCachedFetch<{
    withdrawals?: Withdrawal[];
  }>("/api/admin/payouts");
  const withdrawals = data?.withdrawals ?? [];
  const loading = rawLoading && !data;
  const load = refresh;
  const [actingId, setActingId] = useState<string | null>(null);
  const [utrInputs, setUtrInputs] = useState<Record<string, string>>({});

  async function markPaid(id: string) {
    setActingId(id);
    const utr = utrInputs[id]?.trim();
    await fetch("/api/admin/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawal_id: id, ...(utr ? { utr } : {}) }),
    });
    setActingId(null);
    invalidateCache("/api/admin/payouts");
    await load();
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex items-end justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Banknote className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Admin
          </p>
          <h1 className="mt-1 font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            Manual Payouts
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Pending creator withdrawal requests. Transfer via NEFT/IMPS then mark paid.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/30"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </motion.div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No pending payouts</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">All caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {withdrawals.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-display text-[16px] font-800 text-[var(--color-foreground)]">
                    {w.user_display_name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {new Date(w.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="shrink-0">
                  <p className="font-display text-[24px] font-800 text-[var(--color-foreground)]">
                    {fmt(w.amount_paise)}
                  </p>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-[9px] font-700 uppercase ${
                    w.status === "processing" ? "bg-blue-500/10 text-blue-600" : "bg-yellow-500/10 text-yellow-700"
                  }`}>
                    {w.status}
                  </span>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl bg-[var(--color-secondary)] p-3 text-[12px] sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">ACCOUNT HOLDER</p>
                  <p className="mt-0.5 font-600 text-[var(--color-foreground)]">{w.holder_name}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">ACCOUNT NUMBER</p>
                  <p className="mt-0.5 font-600 text-[var(--color-foreground)] font-mono">{w.account_masked}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">IFSC</p>
                  <p className="mt-0.5 font-600 text-[var(--color-foreground)] font-mono">{w.ifsc}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="UTR / ref number (optional)"
                  value={utrInputs[w.id] ?? ""}
                  onChange={(e) => setUtrInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                />
                <button
                  onClick={() => markPaid(w.id)}
                  disabled={actingId === w.id}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-[12px] font-700 text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  {actingId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Mark paid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
