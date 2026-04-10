"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LogOut,
  ArrowRight,
  Users,
  Megaphone,
  Wallet,
  Clock,
  IndianRupee,
  ImageIcon,
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";

/* ── Types ── */

interface BrandProfile {
  company_name: string | null;
  gst_number: string | null;
  industry: string | null;
  website_url: string | null;
  is_verified: boolean;
}

interface CreatorProfile {
  id: string;
  onboarding_step: string | null;
}

interface DashboardStats {
  activeCampaigns: number;
  totalGenerations: number;
  pendingApprovals: number;
  walletBalance: number;
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

/* ── Component ── */

export default function DashboardPage() {
  const { user, supabase, isLoading } = useAuth();
  const router = useRouter();

  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(
    null
  );
  const [stats, setStats] = useState<DashboardStats>({
    activeCampaigns: 0,
    totalGenerations: 0,
    pendingApprovals: 0,
    walletBalance: 0,
  });
  const [profileLoading, setProfileLoading] = useState(true);

  const role = user?.user_metadata?.role ?? "creator";
  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "User";

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }

    async function fetchProfile() {
      setProfileLoading(true);

      try {
        if (role === "brand") {
          const { data } = await supabase
            .from("brands")
            .select(
              "id, company_name, gst_number, industry, website_url, is_verified"
            )
            .eq("user_id", user!.id)
            .single();

          if (data) {
            setBrandProfile(data);

            const [campaignsRes, walletsRes] = await Promise.all([
              supabase
                .from("campaigns")
                .select("id, status, generation_count")
                .eq("brand_id", data.id),
              supabase
                .from("wallet_transactions")
                .select("balance_after_paise")
                .eq("user_id", user!.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);

            setStats({
              activeCampaigns:
                campaignsRes.data?.filter((c) => c.status === "active")
                  .length ?? 0,
              totalGenerations:
                campaignsRes.data?.reduce(
                  (sum, c) => sum + (c.generation_count ?? 0),
                  0
                ) ?? 0,
              pendingApprovals: 0,
              walletBalance: walletsRes.data?.balance_after_paise ?? 0,
            });
          }
        } else {
          const { data } = await supabase
            .from("creators")
            .select("id, onboarding_step")
            .eq("user_id", user!.id)
            .single();

          if (data) {
            setCreatorProfile(data);

            const [approvalsRes, walletsRes, campaignsRes] =
              await Promise.all([
                supabase
                  .from("approvals")
                  .select("id", { count: "exact" })
                  .eq("creator_id", data.id)
                  .eq("status", "pending"),
                supabase
                  .from("wallet_transactions")
                  .select("balance_after_paise")
                  .eq("user_id", user!.id)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle(),
                supabase
                  .from("campaigns")
                  .select("id, status")
                  .eq("creator_id", data.id),
              ]);

            setStats({
              activeCampaigns:
                campaignsRes.data?.filter((c) => c.status === "active")
                  .length ?? 0,
              totalGenerations: 0,
              pendingApprovals: approvalsRes.count ?? 0,
              walletBalance: walletsRes.data?.balance_after_paise ?? 0,
            });
          }
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setProfileLoading(false);
      }
    }

    fetchProfile();
  }, [user, role, supabase]);

  async function handleSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  const brandNeedsSetup =
    role === "brand" &&
    brandProfile &&
    (!brandProfile.gst_number || !brandProfile.industry);

  const creatorNeedsOnboarding =
    role === "creator" &&
    creatorProfile &&
    creatorProfile.onboarding_step !== "complete";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-3xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-800 tracking-tight text-[var(--color-ink)]">
            Welcome, {displayName}
          </h1>
          <p className="mt-1 text-[var(--color-neutral-500)]">
            {role === "creator"
              ? "Manage your likeness, review campaigns, and track earnings."
              : "Browse creators, create campaigns, and generate content."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:text-[var(--color-ink)]"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>

      {/* Profile loading */}
      {profileLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="size-5 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
        </div>
      )}

      {/* ── Creator Dashboard ── */}
      {!profileLoading && role === "creator" && (
        <div className="flex flex-col gap-6">
          {creatorNeedsOnboarding && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-blush)]/20 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-xl font-700 text-[var(--color-ink)] mb-2">
                    Complete your onboarding
                  </h2>
                  <p className="text-sm text-[var(--color-neutral-500)] max-w-md">
                    Upload reference photos, set your categories, and configure
                    pricing to start receiving campaign requests.
                  </p>
                  {creatorProfile?.onboarding_step && (
                    <p className="mt-2 text-xs font-500 text-[var(--color-neutral-400)]">
                      Current step:{" "}
                      <span className="text-[var(--color-ink)] capitalize">
                        {creatorProfile.onboarding_step.replace(/_/g, " ")}
                      </span>
                    </p>
                  )}
                </div>
                <Link href="/dashboard/onboarding">
                  <Button className="shrink-0 rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]">
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/dashboard/approvals"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-blush)]/40">
                  <ClipboardCheck className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Pending Approvals
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {stats.pendingApprovals}
              </p>
            </Link>

            <Link
              href="/dashboard/campaigns"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-ocean)]/40">
                  <Megaphone className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Active Campaigns
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {stats.activeCampaigns}
              </p>
            </Link>

            <Link
              href="/dashboard/wallet"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-mint)]/40">
                  <IndianRupee className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Earnings
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {formatINR(stats.walletBalance)}
              </p>
            </Link>

            <Link
              href="/dashboard/campaigns"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-lilac)]/40">
                  <Clock className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Total Campaigns
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {stats.activeCampaigns}
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* ── Brand Dashboard ── */}
      {!profileLoading && role === "brand" && (
        <div className="flex flex-col gap-6">
          {brandNeedsSetup && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-ocean)]/20 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-xl font-700 text-[var(--color-ink)] mb-2">
                    Complete your profile
                  </h2>
                  <p className="text-sm text-[var(--color-neutral-500)] max-w-md">
                    Add your company details, GST number, and industry to start
                    creating AI content with creators.
                  </p>
                </div>
                <Link href="/dashboard/brand-setup">
                  <Button className="shrink-0 rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]">
                    Complete
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/dashboard/creators"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-ocean)]/40">
                  <Users className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Discover Creators
                </h3>
              </div>
              <p className="text-xs text-[var(--color-neutral-400)]">
                Find creators for AI content
              </p>
              <p className="mt-2 text-sm font-600 text-[var(--color-gold)] group-hover:underline">
                Browse catalog
                <ArrowRight className="ml-1 inline size-3.5" />
              </p>
            </Link>

            <Link
              href="/dashboard/campaigns"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-lilac)]/40">
                  <Megaphone className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Active Campaigns
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {stats.activeCampaigns}
              </p>
            </Link>

            <Link
              href="/dashboard/campaigns"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-blush)]/40">
                  <ImageIcon className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Generations
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {stats.totalGenerations}
              </p>
            </Link>

            <Link
              href="/dashboard/wallet"
              className="group rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-mint)]/40">
                  <Wallet className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <h3 className="text-sm font-600 text-[var(--color-ink)]">
                  Wallet Balance
                </h3>
              </div>
              <p className="text-2xl font-700 text-[var(--color-ink)]">
                {formatINR(stats.walletBalance)}
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* Fallback */}
      {!profileLoading && !brandProfile && !creatorProfile && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] p-8 text-center bg-white">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-700 text-[var(--color-ink)] mb-2">
            {role === "creator"
              ? "Complete your onboarding"
              : "Set up your brand profile"}
          </h2>
          <p className="text-sm text-[var(--color-neutral-500)] max-w-md mx-auto mb-4">
            {role === "creator"
              ? "Upload reference photos, set your categories, and configure pricing to start receiving campaign requests."
              : "Add your company details, GST number, and top up your wallet to start creating AI content."}
          </p>
          <Link
            href={
              role === "creator"
                ? "/dashboard/onboarding"
                : "/dashboard/brand-setup"
            }
          >
            <Button className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]">
              Get started
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      )}
    </motion.div>
  );
}
