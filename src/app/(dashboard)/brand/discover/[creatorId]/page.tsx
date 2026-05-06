/**
 * /brand/discover/[creatorId] — Creator profile + Package cards
 *
 * Shows creator info on the left, and 1-3 package cards (Frame/Feature/Cover)
 * on the right. Brand clicks a package to send a collab request.
 */

import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  Sparkles,
  ShieldCheck,
  Image as ImageIcon,
  Zap,
  Globe,
  ArrowRight,
  Clock,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreatorPackageRow {
  id: string;
  tier: "frame" | "feature" | "cover";
  price_paise: number;
  final_images: number;
  is_active: boolean;
}

interface CreatorDetail {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  youtube_handle: string | null;
  youtube_subscribers: number | null;
  kyc_status: string | null;
  hero_photo_url: string | null;
  is_live: boolean;
  packages: CreatorPackageRow[];
}

const TIER_META = {
  frame: {
    label: "Frame",
    badge: "Social Organic",
    duration: "90 days",
    icon: ImageIcon,
    color: "from-sky-500/10 to-sky-500/5",
    border: "border-sky-500/20",
    iconColor: "text-sky-500",
    description: "Single-platform organic posts. Short-term visibility.",
  },
  feature: {
    label: "Feature",
    badge: "Social Paid",
    duration: "6 months",
    icon: Zap,
    color: "from-[var(--color-primary)]/12 to-[var(--color-primary)]/5",
    border: "border-[var(--color-primary)]/30",
    iconColor: "text-[var(--color-primary)]",
    description: "Paid ads + boosted posts across platforms.",
  },
  cover: {
    label: "Cover",
    badge: "Digital Full",
    duration: "12 months",
    icon: Globe,
    color: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
    iconColor: "text-violet-500",
    description: "Full digital rights — web, OOH, email, all platforms.",
  },
} as const;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function fmtFollowers(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

async function loadCreator(id: string): Promise<CreatorDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("creators")
    .select(`id, bio, instagram_handle, instagram_followers, youtube_handle, youtube_subscribers, kyc_status, user_id, is_live, users!inner ( display_name )`)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  // Hero photo
  const { data: primaryPhoto } = await admin
    .from("creator_reference_photos")
    .select("storage_path")
    .eq("creator_id", id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  let heroPhotoUrl: string | null = null;
  if (primaryPhoto?.storage_path) {
    const { data: signed } = await admin.storage
      .from("reference-photos")
      .createSignedUrl(primaryPhoto.storage_path as string, 60 * 60);
    heroPhotoUrl = signed?.signedUrl ?? null;
  }

  // Load packages
  const { data: packages } = await admin
    .from("creator_packages")
    .select("id, tier, price_paise, final_images, is_active")
    .eq("creator_id", id)
    .eq("is_active", true)
    .order("price_paise", { ascending: true });

  return {
    id: data.id as string,
    display_name: data.users?.display_name ?? "Creator",
    bio: data.bio ?? null,
    instagram_handle: data.instagram_handle ?? null,
    instagram_followers: data.instagram_followers ?? null,
    youtube_handle: data.youtube_handle ?? null,
    youtube_subscribers: data.youtube_subscribers ?? null,
    kyc_status: data.kyc_status ?? null,
    hero_photo_url: heroPhotoUrl,
    is_live: data.is_live ?? false,
    packages: (packages ?? []) as CreatorPackageRow[],
  };
}

interface PageProps {
  params: Promise<{ creatorId: string }>;
}

export default async function BrandCreatorDetailPage({ params }: PageProps) {
  const { creatorId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creator = await loadCreator(creatorId);
  if (!creator) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Back */}
      <Link
        href="/brand/discover"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to discover
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
        {/* ── Left: profile ─────────────────────────────────────────────── */}
        <div>
          {/* Hero */}
          <div className="relative mb-5 aspect-[16/9] overflow-hidden rounded-2xl bg-[var(--color-secondary)]">
            {creator.hero_photo_url ? (
              <Image
                src={creator.hero_photo_url}
                alt={creator.display_name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
                priority
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Sparkles className="h-16 w-16 text-[var(--color-foreground)] opacity-30" />
              </div>
            )}
            {creator.kyc_status === "verified" && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/90 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-foreground)] backdrop-blur-sm">
                <ShieldCheck className="h-3 w-3" />
                KYC verified
              </span>
            )}
          </div>

          {/* Name + handle */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-800 tracking-tight text-[var(--color-foreground)] sm:text-3xl">
                {creator.display_name}
              </h1>
              {creator.is_live && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-700 text-emerald-600">
                  Live
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
              {creator.instagram_handle && (
                <span className="inline-flex items-center gap-1.5">
                  <AtSign className="h-3.5 w-3.5" />
                  <span>{creator.instagram_handle}</span>
                  {fmtFollowers(creator.instagram_followers) && (
                    <span className="font-700 text-[var(--color-foreground)]">
                      {fmtFollowers(creator.instagram_followers)}
                    </span>
                  )}
                </span>
              )}
              {creator.youtube_handle && (
                <span className="inline-flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-red-500" />
                  <span>{creator.youtube_handle}</span>
                  {fmtFollowers(creator.youtube_subscribers) && (
                    <span className="font-700 text-[var(--color-foreground)]">
                      {fmtFollowers(creator.youtube_subscribers)}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {creator.bio && (
            <p className="mb-6 text-sm leading-relaxed text-[var(--color-foreground)]">
              {creator.bio}
            </p>
          )}

          {/* How it works */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              How it works
            </p>
            <div className="space-y-2.5">
              {[
                { n: "1", text: "Pick a package and send a collab request with your product" },
                { n: "2", text: "Creator reviews and accepts (72h window)" },
                { n: "3", text: "Pay upfront — generation credits unlock immediately" },
                { n: "4", text: "Generate in Studio → creator approves → license issued" },
              ].map((s) => (
                <div key={s.n} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] font-mono text-[9px] font-800 text-[var(--color-primary-foreground)]">
                    {s.n}
                  </span>
                  <p className="text-[13px] text-[var(--color-muted-foreground)]">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: package cards ──────────────────────────────────────── */}
        <aside className="self-start lg:sticky lg:top-6">
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            Packages
          </p>

          {!creator.is_live && (
            <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3 text-[13px] text-yellow-700">
              This creator is not currently accepting requests.
            </div>
          )}

          {creator.packages.length === 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-8 text-center">
              <p className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                No packages yet
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                This creator hasn&apos;t set up packages yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(["frame", "feature", "cover"] as const).map((tier) => {
                const pkg = creator.packages.find((p) => p.tier === tier);
                if (!pkg) return null;
                const meta = TIER_META[tier];
                const Icon = meta.icon;
                return (
                  <div
                    key={tier}
                    className={`rounded-2xl border bg-gradient-to-br p-4 ${meta.color} ${meta.border}`}
                  >
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-card)] ${meta.iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
                          {meta.label}
                        </p>
                        <p className="font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                          {meta.badge}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="font-display text-[18px] font-800 text-[var(--color-foreground)]">
                          {fmt(pkg.price_paise)}
                        </p>
                        <p className="font-mono text-[9px] text-[var(--color-muted-foreground)]">
                          {pkg.final_images} images
                        </p>
                      </div>
                    </div>

                    <p className="mb-3 text-[12px] text-[var(--color-muted-foreground)]">
                      {meta.description}
                    </p>

                    <div className="mb-3 flex items-center gap-3 text-[11px] text-[var(--color-muted-foreground)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {meta.duration} license
                      </span>
                      <span>{pkg.final_images * 3} gen credits</span>
                    </div>

                    <Link
                      href={creator.is_live ? `/brand/discover/${creatorId}/request?package=${pkg.id}` : "#"}
                      className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-700 transition-all ${
                        creator.is_live
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] hover:-translate-y-0.5"
                          : "pointer-events-none bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] opacity-60"
                      }`}
                    >
                      Send request <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
