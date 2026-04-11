"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Megaphone,
  ArrowRight,
  ImageIcon,
  IndianRupee,
} from "lucide-react";

/* ── Types ── */

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  generation_count: number;
  max_generations: number;
  budget_paise: number;
  spent_paise: number;
  created_at: string;
  creator_id: string;
  brand_id: string;
  creator_display_name: string;
  brand_display_name: string;
}

/* ── Helpers ── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const statusColors: Record<string, string> = {
  active: "bg-[var(--color-mint)] text-green-700",
  paused: "bg-[var(--color-blush)] text-red-700",
  completed:
    "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]",
  cancelled:
    "bg-[var(--color-lilac)] text-[var(--color-primary)]",
};

/* ── Component ── */

export default function CampaignsListPage() {
  const { user, supabase, isLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const role = user?.user_metadata?.role ?? "creator";

  useEffect(() => {
    if (!user) return;

    async function fetchCampaigns() {
      setLoading(true);

      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch campaigns:", err);
      }

      setLoading(false);
    }

    fetchCampaigns();
  }, [user, role, supabase]);

  /* ── Loading state ── */
  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-surface-container-high)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-4xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-800 tracking-tight text-[var(--color-on-surface)]">
            Campaigns
          </h1>
          <p className="mt-1 text-[var(--color-outline)]">
            {role === "brand"
              ? "Manage your AI content campaigns with creators."
              : "View campaigns you are assigned to."}
          </p>
        </div>
        {role === "brand" && (
          <Link href="/dashboard/campaigns/new">
            <Button className="rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90 transition-opacity">
              <Plus className="size-4" />
              New Campaign
            </Button>
          </Link>
        )}
      </div>

      {/* ── Empty state ── */}
      {campaigns.length === 0 && (
        <div className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-12 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
            <Megaphone className="size-6 text-[var(--color-on-surface-variant)]" />
          </div>
          <h2 className="text-xl font-700 text-[var(--color-on-surface)] mb-2">
            No campaigns yet
          </h2>
          <p className="text-sm text-[var(--color-outline)] max-w-sm mx-auto mb-6">
            {role === "brand"
              ? "Create your first campaign to start generating AI content with a creator."
              : "When brands assign you to campaigns, they will appear here."}
          </p>
          {role === "brand" && (
            <Link href="/dashboard/campaigns/new">
              <Button className="rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90 transition-opacity">
                Create Campaign
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* ── Campaign grid ── */}
      {campaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign, i) => {
            const creatorName = campaign.creator_display_name ?? "Creator";
            const brandName = campaign.brand_display_name ?? "Brand";
            const progressPercent =
              campaign.max_generations > 0
                ? Math.round(
                    (campaign.generation_count / campaign.max_generations) * 100
                  )
                : 0;

            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="group block rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-base font-700 text-[var(--color-on-surface)] leading-tight line-clamp-2 group-hover:text-[var(--color-primary)] transition-colors">
                      {campaign.name}
                    </h3>
                    <span
                      className={`shrink-0 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-600 capitalize ${
                        statusColors[campaign.status] ?? statusColors.active
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>

                  {/* Creator/Brand name */}
                  <p className="text-sm text-[var(--color-on-surface-variant)] mb-3">
                    {role === "brand"
                      ? `Creator: ${creatorName}`
                      : `Brand: ${brandName}`}
                  </p>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-container-low)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-[var(--color-on-surface-variant)]">
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="size-3.5" />
                      {campaign.generation_count}/{campaign.max_generations}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-accent-gold)]">
                      <IndianRupee className="size-3.5" />
                      {formatINR(campaign.spent_paise)} /{" "}
                      {formatINR(campaign.budget_paise)}
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
