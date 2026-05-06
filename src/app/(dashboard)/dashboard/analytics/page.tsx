"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BarChart3,
  TrendingUp,
  IndianRupee,
  Clock,
  ArrowUpRight,
  Loader2,
  Megaphone,
} from "lucide-react";
import Link from "next/link";

/* ── Types ── */

interface WalletTx {
  id: string;
  type: string;
  amount_paise: number;
  direction: "credit" | "debit";
  created_at: string;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  spent_paise: number;
  generation_count: number;
  max_generations: number;
  created_at: string;
}

/* ── Helpers ── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(paise / 100);
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AnalyticsPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [generationCount, setGenerationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get creator record
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!creator) {
      setLoading(false);
      return;
    }

    const [txRes, campaignRes, genRes] = await Promise.all([
      // Reads wallet_transactions_archive (renamed in migration 00027).
      // Chunk D will rebuild analytics against escrow_ledger +
      // platform_revenue_ledger; until then the archive gives us historical
      // earnings charts without regressing the current UX.
      (supabase as unknown as {
        from(t: string): {
          select(c: string): {
            eq(col: string, v: string): {
              order(col: string, opts: { ascending: boolean }): Promise<{
                data: Array<{
                  id: string;
                  type: string;
                  amount_paise: number;
                  direction: "credit" | "debit";
                  created_at: string;
                }> | null;
                count?: number;
              }>;
            };
          };
        };
      })
        .from("wallet_transactions_archive")
        .select("id, type, amount_paise, direction, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("collab_sessions")
        .select("id, name, status, spent_paise, generation_count, max_generations, created_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("status", "delivered"),
    ]);

    if (txRes.data) setTransactions(txRes.data as WalletTx[]);
    if (campaignRes.data) setCampaigns(campaignRes.data as CampaignRow[]);
    setGenerationCount(genRes.count ?? 0);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // Derived stats
  const totalEarnings = useMemo(
    () => transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount_paise, 0),
    [transactions]
  );

  // Monthly earnings for chart (last 6 months)
  const monthlyEarnings = useMemo(() => {
    const now = new Date();
    const months: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = MONTH_LABELS[d.getMonth()];
      const total = transactions
        .filter((t) => {
          if (t.direction !== "credit") return false;
          const td = new Date(t.created_at);
          return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        })
        .reduce((s, t) => s + t.amount_paise, 0);
      months.push({ label, total });
    }
    return months;
  }, [transactions]);

  const maxMonthly = Math.max(...monthlyEarnings.map((m) => m.total), 1);

  const STATS = [
    {
      label: "Total Earnings",
      value: formatINR(totalEarnings),
      icon: IndianRupee,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Generations",
      value: String(generationCount),
      icon: BarChart3,
      iconBg: "bg-[var(--color-primary)]/10",
      iconColor: "text-[var(--color-primary)]",
    },
    {
      label: "Active Collabs",
      value: String(campaigns.filter((c) => c.status === "active").length),
      icon: Megaphone,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Avg. Response",
      value: "—",
      icon: Clock,
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
  ];

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-700 text-[var(--color-foreground)]">Analytics</h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-muted-foreground)]">
          Track your performance, earnings, and engagement
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5">
              <div className={`flex size-8 items-center justify-center rounded-lg ${stat.iconBg}`}>
                <Icon className={`size-4 ${stat.iconColor}`} />
              </div>
              <p className="mt-2 text-lg font-700 text-[var(--color-foreground)]">{stat.value}</p>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Earnings Chart */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-700 text-[var(--color-foreground)]">Earnings Overview</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">Last 6 months</p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-2 h-36">
          {monthlyEarnings.map((month) => (
            <div key={month.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-[var(--color-primary)] to-[var(--color-primary-container)] transition-all"
                style={{
                  height: `${Math.max((month.total / maxMonthly) * 100, 4)}%`,
                  opacity: month.total > 0 ? 1 : 0.15,
                }}
              />
              <span className="text-[10px] font-500 text-[var(--color-muted-foreground)]">{month.label}</span>
            </div>
          ))}
        </div>

        {totalEarnings === 0 && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
            <TrendingUp className="size-3.5" />
            <span>Data will appear once you start earning</span>
          </div>
        )}
      </div>

      {/* Top Campaigns */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="text-sm font-700 text-[var(--color-foreground)]">Collabs</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">Your collab activity</p>

        {campaigns.length > 0 ? (
          <div className="mt-3 space-y-2">
            {campaigns.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                href={`/creator/collabs/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-3 py-2.5 no-underline transition-colors hover:bg-[var(--color-secondary)]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-600 text-[var(--color-foreground)]">{c.name}</p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    {c.generation_count}/{c.max_generations} generations
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-600 ${
                    c.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : c.status === "completed"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-[var(--color-secondary)]/50 text-[var(--color-muted-foreground)]"
                  }`}>
                    {c.status}
                  </span>
                  <ArrowUpRight className="size-3.5 text-[var(--color-muted-foreground)]" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 mb-2">
              <BarChart3 className="size-5 text-[var(--color-primary)]/50" />
            </div>
            <p className="text-xs font-500 text-[var(--color-muted-foreground)]">No collabs yet</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">Collab analytics will show up here</p>
          </div>
        )}
      </div>
    </div>
  );
}
