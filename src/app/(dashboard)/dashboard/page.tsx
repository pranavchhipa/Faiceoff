"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bell,
  BellOff,
  Clock,
  IndianRupee,
  Images,
  LogOut,
  Megaphone,
  Settings,
  Zap,
  Fingerprint,
  Brain,
  CheckCircle2,
  AtSign,
  Sparkles,
  Eye,
  User as UserIcon,
  Users,
  Wallet,
  Shirt,
  Dumbbell,
  UtensilsCrossed,
  Palette,
  ChevronRight,
  ClipboardCheck,
  PenLine,
  Network,
  Cpu,
  ListTodo
} from "lucide-react";
import Link from "next/link";

interface BrandProfile {
  id: string;
  company_name: string | null;
  gst_number: string | null;
  industry: string | null;
  is_verified: boolean;
}

interface CreatorProfile {
  id: string;
  onboarding_step: string | null;
  is_active: boolean;
  instagram_handle: string | null;
  bio: string | null;
  kyc_status: string | null;
}

interface CategoryInfo {
  category: string;
  price_per_generation_paise: number;
  subcategories: string[];
}

interface DashboardStats {
  activeCampaigns: number;
  totalGenerations: number;
  pendingApprovals: number;
  walletBalance: number;
  totalCampaigns: number;
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  fashion: Shirt,
  fitness: Dumbbell,
  food: UtensilsCrossed,
  beauty: Sparkles,
  lifestyle: Palette,
};

const CATEGORY_BADGE_COLORS = [
  { bg: "#1a6b3c", text: "#ffffff" },
  { bg: "#2a5a8c", text: "#ffffff" },
  { bg: "#6a1cf6", text: "#ffffff" },
  { bg: "#9d365d", text: "#ffffff" },
] as const;

const CATEGORY_ICON_COLORS = [
  { bg: "#f6dfe0", text: "#9d365d" },
  { bg: "#d9e5f0", text: "#2a5a8c" },
  { bg: "#e2dcef", text: "#6a1cf6" },
  { bg: "#daece0", text: "#1a6b3c" },
] as const;

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  queued:      { bg: "#e2dcef", text: "#6a1cf6", label: "Queued" },
  training:    { bg: "#d9e5f0", text: "#2a5a8c", label: "Training" },
  ready:       { bg: "#daece0", text: "#1a6b3c", label: "Ready" },
  failed:      { bg: "#f6dfe0", text: "#9d365d", label: "Failed" },
  pending:     { bg: "#fef3c7", text: "#b8944f", label: "Pending" },
  approved:    { bg: "#daece0", text: "#1a6b3c", label: "Verified" },
  not_started: { bg: "#e4e9eb", text: "#595c5d", label: "Not Started" },
};

function getStatusBadge(status: string | null | undefined) {
  if (!status) return STATUS_BADGES.not_started;
  return STATUS_BADGES[status] ?? STATUS_BADGES.not_started;
}

export default function DashboardPage() {
  const { user, isLoading, role: dbRole, roleLoading } = useAuth();

  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [stats, setStats] = useState<DashboardStats>({
    activeCampaigns: 0,
    totalGenerations: 0,
    pendingApprovals: 0,
    walletBalance: 0,
    totalCampaigns: 0,
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // DB-backed role (authoritative). While it's resolving the page shows the
  // loading spinner (see below), so this fallback is only used after.
  // Admins never land here — middleware redirects /dashboard → /admin for
  // admin role — but narrow the type defensively.
  const role: "creator" | "brand" =
    dbRole === "admin"
      ? "creator"
      : dbRole ?? (user?.user_metadata?.role === "brand" ? "brand" : "creator");
  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "User";
  const firstName = displayName.split(" ")[0];

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    async function fetchDashboard() {
      setProfileLoading(true);
      try {
        const res = await fetch("/api/dashboard/stats");
        if (!res.ok) { setProfileLoading(false); return; }
        const data = await res.json();
        if (data.creator) {
          setCreatorProfile(data.creator);
          setStats({
            activeCampaigns: data.stats?.activeCampaigns ?? 0,
            totalCampaigns: data.stats?.totalCampaigns ?? 0,
            totalGenerations: 0,
            pendingApprovals: data.stats?.pendingApprovals ?? 0,
            walletBalance: data.stats?.walletBalance ?? 0,
          });
          setCategories(data.categories ?? []);
          setPhotoCount(data.photoCount ?? 0);
        }
        if (data.brand) {
          setBrandProfile(data.brand);
          setStats({
            activeCampaigns: data.stats?.activeCampaigns ?? 0,
            totalCampaigns: data.stats?.totalCampaigns ?? 0,
            totalGenerations: data.stats?.totalGenerations ?? 0,
            pendingApprovals: 0,
            walletBalance: data.stats?.walletBalance ?? 0,
          });
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setProfileLoading(false);
      }
    }
    fetchDashboard();
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfileMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const needsBrandSetup = role === "brand" && brandProfile && (!brandProfile.gst_number || !brandProfile.industry);

  async function handleSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  // Wait on: session, profile fetch, AND role resolution. Skipping roleLoading
  // caused the "creator → brand" flash for brand accounts on first render.
  if (isLoading || profileLoading || (roleLoading && !dbRole)) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-[3px] border-[var(--color-neutral-200)] border-t-[var(--color-gold)]" />
          <p className="text-xs font-500 text-[var(--color-outline)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const needsOnboarding = role === "creator" && creatorProfile && creatorProfile.onboarding_step !== "complete";
  const onboardingComplete = role === "creator" && creatorProfile && creatorProfile.onboarding_step === "complete";
  const noProfile = !brandProfile && !creatorProfile;

  const kycStatus = creatorProfile?.kyc_status || "pending";

  return (
    <motion.div
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.06 }}
      className="max-w-6xl mx-auto w-full pt-2"
    >
      {/* ══════════ Header ══════════ */}
      <motion.div variants={fadeUp} className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl sm:text-[28px] font-700 tracking-tight text-[var(--color-ink)] flex items-center gap-2">
            Hey, {firstName} <span className="text-[#8b5cf6] text-[22px] sm:text-[24px]">✦</span>
          </h1>
          <p className="text-[13px] sm:text-[14px] text-[var(--color-ink)] opacity-80 mt-0.5">
             {role === "creator"
               ? "Manage your likeness, review campaigns, and track earnings."
               : "Discover creators, run campaigns, and generate AI content."}
          </p>
        </div>

        {/* Bell + Avatar */}
        <div className="flex items-center gap-3">
          <div ref={notifRef} className="relative">
            <button
              onClick={() => { setShowNotifications((p) => !p); setShowProfileMenu(false); }}
              className="flex size-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-neutral-100)] transition-all hover:bg-[var(--color-neutral-200)] relative"
            >
              <Bell className="size-5 text-[var(--color-ink)] opacity-70" />
              <span className="absolute right-3 top-3 size-2 rounded-full bg-[#8b5cf6]" />
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-14 z-50 w-[calc(100vw-2.5rem)] max-w-80 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] border border-[var(--color-neutral-200)]"
                >
                  <div className="flex items-center justify-between border-b border-[var(--color-neutral-200)] px-5 py-3.5">
                    <p className="text-sm font-700 text-[var(--color-ink)]">Notifications</p>
                    <span className="rounded-full bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-700 text-[#8b5cf6]">Coming soon</span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-10 px-5">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--color-neutral-100)]">
                      <BellOff className="size-5 text-[var(--color-neutral-500)]" />
                    </div>
                    <p className="mt-3 text-sm font-600 text-[var(--color-ink)]">No notifications yet</p>
                    <p className="mt-1 text-center text-xs text-[var(--color-neutral-500)]">You&apos;ll be notified about approvals, campaigns, and earnings here.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div ref={profileRef} className="relative">
            <button
               onClick={() => { setShowProfileMenu((p) => !p); setShowNotifications(false); }}
               className="flex size-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#8b5cf6] text-white font-600 text-lg hover:opacity-90 transition-opacity"
            >
              {displayName.charAt(0).toUpperCase()}
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-14 z-50 w-[calc(100vw-2.5rem)] max-w-64 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] border border-[var(--color-neutral-200)]"
                >
                  <div className="border-b border-[var(--color-neutral-200)] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#8b5cf6] text-sm font-700 uppercase text-white">{displayName.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-700 text-[var(--color-ink)]">{displayName}</p>
                        <p className="truncate text-[11px] text-[var(--color-neutral-500)]">{user?.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2 border-b border-[var(--color-neutral-200)]">
                    <Link href="/dashboard/settings" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-500 text-[var(--color-ink)] no-underline transition-colors hover:bg-[var(--color-neutral-50)]">
                      <UserIcon className="size-4 text-[var(--color-neutral-500)]" /> My Profile
                    </Link>
                    <Link href="/dashboard/settings" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-500 text-[var(--color-ink)] no-underline transition-colors hover:bg-[var(--color-neutral-50)]">
                      <Settings className="size-4 text-[var(--color-neutral-500)]" /> Settings
                    </Link>
                    <Link href="/dashboard/wallet" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-500 text-[var(--color-ink)] no-underline transition-colors hover:bg-[var(--color-neutral-50)]">
                      <Wallet className="size-4 text-[var(--color-neutral-500)]" /> {role === "creator" ? "Earnings" : "Wallet"}
                    </Link>
                  </div>
                  <div className="p-2">
                    <button onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-500 text-red-600 transition-colors hover:bg-red-50">
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ══════════ Onboarding CTA ══════════ */}
      {(needsOnboarding || needsBrandSetup || noProfile) && (
        <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="mb-5 relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] p-[1px]">
          <div className="flex flex-col gap-4 rounded-[calc(var(--radius-card)-1px)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)]">
                <Zap className="size-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-700 text-[var(--color-ink)]">
                  {role === "creator" ? "Complete your onboarding" : "Set up your brand profile"}
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-neutral-600)]">
                  {role === "creator" ? "Upload photos, set categories & pricing to start earning" : "Add GST, company details & top up wallet"}
                  {creatorProfile?.onboarding_step && creatorProfile.onboarding_step !== "complete" && (
                    <span className="ml-1.5 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-600 capitalize text-[var(--color-primary)]">
                      {creatorProfile.onboarding_step.replace(/_/g, " ")}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Link href={role === "creator" ? "/dashboard/onboarding" : "/dashboard/brand-setup"} className="shrink-0 no-underline w-full sm:w-auto">
              <span className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] px-5 py-2.5 text-sm font-600 text-white transition-all hover:shadow-[0_4px_16px_rgba(106,28,246,0.3)]">
                {role === "creator" ? "Continue setup" : "Complete profile"} <ArrowRight className="size-4" />
              </span>
            </Link>
          </div>
        </motion.div>
      )}

      {/* ══════════ Status Banner ══════════ */}
      {onboardingComplete && role === "creator" && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center gap-2.5 rounded-xl bg-white border border-[var(--color-neutral-200)] shadow-sm px-4 py-2.5">
             <Clock className="size-4 text-[var(--color-ink)] opacity-60" />
             <p className="text-[13px] font-500 text-[var(--color-ink)] opacity-80">
               {creatorProfile?.is_active ? "Profile is live — Brands can discover and book you" : "Profile under review — Activation within 24–48 hours"}
             </p>
          </div>
        </motion.div>
      )}
      {brandProfile && brandProfile.is_verified && role === "brand" && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center gap-2.5 rounded-xl bg-[#daece0] px-4 py-2.5">
             <CheckCircle2 className="size-4 text-[#1a6b3c]" />
             <p className="text-[13px] font-500 text-[#1a6b3c]">
               Brand verified — You can now discover creators and run campaigns
             </p>
          </div>
        </motion.div>
      )}

      {/* ══════════ BRAND: FULL-WIDTH STATS ══════════ */}
      {role === "brand" && (
        <motion.div variants={fadeUp} className="mb-6">
          <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
            Performance
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-[var(--radius-card)] bg-[var(--color-ocean)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
              <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.activeCampaigns}</p>
              <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Active Campaigns</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-[var(--color-lilac)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
              <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.totalGenerations}</p>
              <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Total Generations</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-[var(--color-mint)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
              <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.walletBalance === 0 ? "₹0" : formatINR(stats.walletBalance)}</p>
              <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Wallet Balance</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-[var(--color-blush)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
              <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.totalCampaigns}</p>
              <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Total Campaigns</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════ BRAND: TWO-COLUMN (Quick Actions + Brand Info) ══════════ */}
      {role === "brand" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Quick Actions */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
              Quick Actions
            </h2>
            <div className="rounded-[var(--radius-card)] bg-white border border-[var(--color-neutral-200)] shadow-[var(--shadow-soft)] overflow-hidden divide-y divide-[var(--color-neutral-200)]">
              <Link href="/dashboard/creators" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <Users className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">Browse Creators</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
              <Link href="/dashboard/campaigns/new" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <Megaphone className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">New Campaign</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
              <Link href="/dashboard/wallet" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <Wallet className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">Top Up Wallet</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
            </div>
          </motion.div>

          {/* Brand Details */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
              Brand Details
            </h2>
            <div className="rounded-[var(--radius-card)] bg-white border border-[var(--color-neutral-200)] shadow-[var(--shadow-soft)] overflow-hidden divide-y divide-[var(--color-neutral-200)]">
              <div className="p-4">
                <p className="text-[10px] font-700 text-[var(--color-neutral-500)] uppercase tracking-wide">Company</p>
                <p className="text-[15px] font-600 text-[var(--color-ink)] mt-1">{brandProfile?.company_name || displayName}</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-700 text-[var(--color-neutral-500)] uppercase tracking-wide">Industry</p>
                <p className="text-[15px] font-600 text-[var(--color-ink)] mt-1">{brandProfile?.industry || "Not set"}</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-700 text-[var(--color-neutral-500)] uppercase tracking-wide">GST Number</p>
                <p className="text-[15px] font-600 text-[var(--color-ink)] mt-1">{brandProfile?.gst_number || "Not provided"}</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-700 text-[var(--color-neutral-500)] uppercase tracking-wide">Status</p>
                <p className="mt-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-600 ${brandProfile?.is_verified ? "bg-[var(--color-mint)] text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    <CheckCircle2 className="size-3" />
                    {brandProfile?.is_verified ? "Verified" : "Pending Verification"}
                  </span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ══════════ CREATOR: MAIN CONTENT TWO-COLUMN ══════════ */}
      {role === "creator" && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">

        {/* LEFT COLUMN */}
        <div className="space-y-8 flex flex-col min-w-0">

          {/* YOUR PROFILE (CREATOR) */}
          {onboardingComplete && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
                Your Profile
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Card 1: Instagram */}
                <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-blush)] p-5 min-h-[140px] flex flex-col justify-between shadow-[var(--shadow-soft)]">
                   <Network className="absolute -bottom-4 -right-4 size-32 text-[#d4afb1] opacity-40" strokeWidth={1} />
                   <div className="flex items-start justify-between relative z-10 gap-2">
                     <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[#f0cdd0]">
                       <AtSign className="size-[18px] text-[#9d365d]" />
                     </div>
                     <span className="rounded-full bg-[#f0cdd0] px-2.5 py-1 text-[10px] font-700 tracking-wider text-[#9d365d]">
                       INSTAGRAM
                     </span>
                   </div>
                   <div className="relative z-10 mt-5 min-w-0">
                     {creatorProfile?.instagram_handle ? (
                       <>
                         <p className="text-[16px] font-600 text-[#9d365d] truncate">
                           @{creatorProfile.instagram_handle}
                         </p>
                         <p className="text-[11px] font-500 text-[#9d365d] opacity-80 underline decoration-[#9d365d]/40 underline-offset-2 mt-0.5">Linked Account</p>
                       </>
                     ) : (
                       <>
                         <p className="text-[16px] font-600 text-[#9d365d] truncate opacity-80">Not linked</p>
                         <Link
                           href="/dashboard/settings"
                           className="text-[11px] font-500 text-[#9d365d] underline decoration-[#9d365d]/40 underline-offset-2 mt-0.5 no-underline hover:underline"
                         >
                           Add your handle
                         </Link>
                       </>
                     )}
                   </div>
                </div>

                {/* Card 2: Photos */}
                <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-mint)] p-5 min-h-[140px] flex flex-col justify-between shadow-[var(--shadow-soft)]">
                   <Images className="absolute -bottom-4 -right-4 size-32 text-[#a8d3b6] opacity-40" strokeWidth={1.5} />
                   <div className="flex items-start justify-between relative z-10 gap-2">
                     <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[#c3deca]">
                       <Images className="size-[18px] text-[#1a6b3c]" />
                     </div>
                     <span className="rounded-full bg-[#c3deca] px-2.5 py-1 text-[10px] font-700 tracking-wider text-[#1a6b3c]">
                       PHOTOS
                     </span>
                   </div>
                   <div className="relative z-10 mt-5 min-w-0">
                     <p className="text-[16px] font-600 text-[#1a6b3c] truncate">
                       {photoCount > 0 ? `${photoCount} uploaded` : "No photos yet"}
                     </p>
                     <p className="text-[11px] font-500 text-[#1a6b3c] opacity-80 mt-0.5">Training Data</p>
                   </div>
                </div>

                {/* Card 3: AI Model */}
                <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-lilac)] p-5 min-h-[140px] flex flex-col justify-between shadow-[var(--shadow-soft)]">
                   <Cpu className="absolute -bottom-4 -right-4 size-32 text-[#c2b5db] opacity-40" strokeWidth={1} />
                   <div className="flex items-start justify-between relative z-10 gap-2">
                     <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[#d0c7e3]">
                       <Brain className="size-[18px] text-[#6a1cf6]" />
                     </div>
                     <span className="rounded-full bg-[#d0c7e3] px-2.5 py-1 text-[10px] font-700 tracking-wider text-[#6a1cf6]">
                       QUEUED
                     </span>
                   </div>
                   <div className="relative z-10 mt-5 min-w-0">
                     <p className="text-[16px] font-600 text-[#6a1cf6] truncate">AI Model</p>
                     <p className="text-[11px] font-500 text-[#6a1cf6] opacity-80 mt-0.5">Processing likeness</p>
                   </div>
                </div>

                {/* Card 4: KYC */}
                <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ocean)] p-5 min-h-[140px] flex flex-col justify-between shadow-[var(--shadow-soft)]">
                   <Fingerprint className="absolute -bottom-4 -right-4 size-32 text-[#b0c8df] opacity-40" strokeWidth={1} />
                   <div className="flex items-start justify-between relative z-10 gap-2">
                     <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[#c4d6e8]">
                       <Fingerprint className="size-[18px] text-[#2a5a8c]" />
                     </div>
                     <span className="rounded-full bg-[#c4d6e8] px-2.5 py-1 text-[10px] font-700 tracking-wider text-[#2a5a8c]">
                       {creatorProfile?.kyc_status === 'approved' ? 'VERIFIED' : 'PENDING'}
                     </span>
                   </div>
                   <div className="relative z-10 mt-5 min-w-0">
                     <p className="text-[16px] font-600 text-[#2a5a8c] truncate">KYC</p>
                     <p className="text-[11px] font-500 text-[#2a5a8c] opacity-80 mt-0.5">Identity Verification</p>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* CATEGORIES & PRICING */}
          {onboardingComplete && categories.length > 0 && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
                Categories & Pricing
              </h2>
              <div className="flex flex-wrap gap-3">
                {categories.map((cat, i) => {
                  const CatIcon = CATEGORY_ICONS[cat.category.toLowerCase()] ?? Palette;
                  let bgColors = { bg: "bg-white", badge: "bg-[var(--color-ink)]", text: "text-[var(--color-ink)]", iconBg: "bg-[var(--color-ink)] bg-opacity-[0.08]" };
                  
                  if (cat.category.toLowerCase() === "fashion") {
                     bgColors = { bg: "bg-[var(--color-neutral-50)]", iconBg: "bg-black/5", badge: "bg-[#1a6b3c]", text: "text-[var(--color-ink)]" };
                  } else if (cat.category.toLowerCase() === "fitness") {
                     bgColors = { bg: "bg-[var(--color-neutral-50)]", iconBg: "bg-black/5", badge: "bg-[#2a5a8c]", text: "text-[var(--color-ink)]" };
                  } else if (cat.category.toLowerCase() === "food") {
                     bgColors = { bg: "bg-[var(--color-neutral-50)]", iconBg: "bg-black/5", badge: "bg-[#b8602b]", text: "text-[var(--color-ink)]" };
                  }

                  return (
                    <div key={cat.category} className={`flex items-center gap-3 rounded-full ${bgColors.bg} pl-2.5 pr-3 py-2 border border-[var(--color-neutral-200)] shadow-sm`}>
                      <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${bgColors.iconBg}`}>
                        <CatIcon className={`size-4 ${bgColors.text} opacity-80`} />
                      </div>
                      <span className={`text-[12px] font-700 uppercase tracking-wide ${bgColors.text}`}>
                        {cat.category}
                      </span>
                      <span className={`rounded-full ${bgColors.badge} px-3 py-1 text-[13px] font-700 text-white shadow-sm`}>
                        {formatINR(cat.price_per_generation_paise)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

        </div>

        {/* RIGHT COLUMN (Creator only) */}
        <div className="space-y-8 min-w-0">

          {/* PERFORMANCE */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
              Performance
            </h2>
            <div className="grid grid-cols-2 gap-3">
               <div className="rounded-[var(--radius-card)] bg-[var(--color-ocean)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
                 <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.pendingApprovals}</p>
                 <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Pending Approvals</p>
               </div>
               <div className="rounded-[var(--radius-card)] bg-[var(--color-ocean)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
                 <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.activeCampaigns}</p>
                 <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Active Campaigns</p>
               </div>
               <div className="rounded-[var(--radius-card)] bg-[var(--color-mint)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
                 <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.walletBalance === 0 ? "₹0" : formatINR(stats.walletBalance)}</p>
                 <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Total Earnings</p>
               </div>
               <div className="rounded-[var(--radius-card)] bg-[var(--color-mint)] p-4 flex flex-col items-start min-h-[96px] justify-center shadow-[var(--shadow-soft)]">
                 <p className="text-[26px] font-600 text-[var(--color-ink)] leading-none mb-1.5">{stats.totalCampaigns || 0}</p>
                 <p className="text-[10px] font-700 text-[var(--color-ink)] opacity-60 uppercase tracking-wide">Total Campaigns</p>
               </div>
            </div>
          </motion.div>

          {/* QUICK ACTIONS */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
              Quick Actions
            </h2>
            <div className="rounded-[var(--radius-card)] bg-white border border-[var(--color-neutral-200)] shadow-[var(--shadow-soft)] overflow-hidden divide-y divide-[var(--color-neutral-200)]">
              <Link href="/dashboard/approvals" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <ListTodo className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">Review Approvals</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
              <Link href="/dashboard/wallet" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <IndianRupee className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">View Earnings</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
              <Link href="/dashboard/settings" className="flex items-center justify-between p-4 hover:bg-[var(--color-neutral-50)] transition-colors group no-underline">
                <div className="flex items-center gap-3">
                  <PenLine className="size-5 text-[var(--color-ink)] opacity-80" />
                  <span className="text-[14px] font-600 text-[var(--color-ink)]">Edit Profile</span>
                </div>
                <ChevronRight className="size-4 text-[var(--color-neutral-400)] group-hover:translate-x-1 group-hover:text-[var(--color-ink)] transition-all" />
              </Link>
            </div>
          </motion.div>

        </div>
      </div>
      )}

      {/* FOOTER BANNER */}
      <motion.div variants={fadeUp} className="mt-8 flex items-center gap-3 px-2 py-4">
         <Clock className="size-[14px] text-[var(--color-neutral-500)]" />
         <p className="text-[12px] text-[var(--color-neutral-500)] font-500">
           {role === "creator"
             ? "Approval requests expire after 48 hours. Check your pending approvals regularly."
             : "Campaigns auto-pause when wallet balance runs low. Keep your wallet topped up."}
         </p>
      </motion.div>

    </motion.div>
  );
}