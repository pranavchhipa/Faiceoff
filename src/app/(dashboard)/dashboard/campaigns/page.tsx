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
  creator: { id: string; user: { display_name: string } | null } | null;
  brand: { id: string; user: { display_name: string } | null } | null;
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
  active: "bg-[var(--color-mint)] text-[var(--color-ink)]",
  paused: "bg-[var(--color-ocean)] text-[var(--color-ink)]",
  completed: "bg-[var(--color-lilac)] text-[var(--color-ink)]",
  cancelled: "bg-[var(--color-blush)] text-[var(--color-ink)]",
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

      // Brands see campaigns they created; creators see campaigns assigned to them
      let query = supabase
        .from("campaigns")
        .select(
          `id, name, description, status, generation_count, max_generations,
           budget_paise, spent_paise, created_at,
           creator:creators!campaigns_creator_id_fkey(id, user:users!creators_user_id_fkey(display_name)),
           brand:brands!campaigns_brand_id_fkey(id, user:users!brands_user_id_fkey(display_name))`
        )
        .order("created_at", { ascending: false });

      if (role === "brand") {
        // RLS already filters, but we explicitly scope for safety
        const { data: brandRow } = await supabase
          .from("brands")
          .select("id")
          .eq("user_id", user!.id)
          .single();

        if (brandRow) {
          query = query.eq("brand_id", brandRow.id);
        }
      } else {
        const { data: creatorRow } = await supabase
          .from("creators")
          .select("id")
          .eq("user_id", user!.id)
          .single();

        if (creatorRow) {
          query = query.eq("creator_id", creatorRow.id);
        }
      }

      const { data } = await query;
      setCampaigns((data as unknown as CampaignRow[]) ?? []);
      setLoading(false);
    }

    fetchCampaigns();
  }, [user, role, supabase]);

  /* ── Loading state ── */
  if (isLoading || loading) {
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
      className="mx-auto max-w-4xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-800 tracking-tight text-[var(--color-ink)]">
            Campaigns
          </h1>
          <p className="mt-1 text-[var(--color-neutral-500)]">
            {role === "brand"
              ? "Manage your AI content campaigns with creators."
              : "View campaigns you are assigned to."}
          </p>
        </div>
        {role === "brand" && (
          <Link href="/dashboard/campaigns/new">
            <Button className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]">
              <Plus className="size-4" />
              New Campaign
            </Button>
          </Link>
        )}
      </div>

      {/* ── Empty state ── */}
      {campaigns.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-ocean)]/30">
            <Megaphone className="size-6 text-[var(--color-neutral-500)]" />
          </div>
          <h2 className="text-xl font-700 text-[var(--color-ink)] mb-2">
            No campaigns yet
          </h2>
          <p className="text-sm text-[var(--color-neutral-500)] max-w-sm mx-auto mb-6">
            {role === "brand"
              ? "Create your first campaign to start generating AI content with a creator."
              : "When brands assign you to campaigns, they will appear here."}
          </p>
          {role === "brand" && (
            <Link href="/dashboard/campaigns/new">
              <Button className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]">
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
            const creatorName =
              campaign.creator?.user?.display_name ?? "Unknown Creator";
            const brandName =
              campaign.brand?.user?.display_name ?? "Unknown Brand";

            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="group block rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-base font-700 text-[var(--color-ink)] leading-tight line-clamp-2 group-hover:text-[var(--color-gold-hover)] transition-colors">
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
                  <p className="text-sm text-[var(--color-neutral-500)] mb-4">
                    {role === "brand"
                      ? `Creator: ${creatorName}`
                      : `Brand: ${brandName}`}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-[var(--color-neutral-500)]">
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="size-3.5" />
                      {campaign.generation_count}/{campaign.max_generations}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
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
