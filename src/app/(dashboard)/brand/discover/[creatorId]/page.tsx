/**
 * /brand/discover/[creatorId] — Creator profile + Package cards
 *
 * Portrait photo layout. Package cards on the right (sticky).
 */

import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Image as ImageIcon,
  Zap,
  Globe,
  ArrowRight,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* ── Inline brand icon SVGs (lucide doesn't have these) ── */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
    </svg>
  );
}

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
  categories: string[];
  packages: CreatorPackageRow[];
}

// Strip a leading @ so the UI can prepend its own consistently
function cleanHandle(h: string | null): string | null {
  if (!h) return null;
  return h.replace(/^@+/, "");
}

const TIER_META = {
  frame: {
    label: "Frame",
    badge: "Social Organic",
    duration: "90 days",
    icon: ImageIcon,
    color: "from-sky-500/10 to-sky-500/5",
    border: "border-sky-500/20",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-500",
    description: "Organic social posts on a single platform. Short-term visibility boost.",
  },
  feature: {
    label: "Feature",
    badge: "Social Paid",
    duration: "6 months",
    icon: Zap,
    color: "from-[var(--color-primary)]/12 to-[var(--color-primary)]/5",
    border: "border-[var(--color-primary)]/30",
    iconBg: "bg-[var(--color-primary)]/15",
    iconColor: "text-[var(--color-primary)]",
    description: "Paid + boosted ads across social platforms. Full 6-month run.",
  },
  cover: {
    label: "Cover",
    badge: "Full Digital",
    duration: "12 months",
    icon: Globe,
    color: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-500",
    description: "Unlimited digital usage — web, OOH, email, packaging, all ad platforms.",
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
    .select(`
      id, bio, instagram_handle, instagram_followers,
      youtube_handle, youtube_subscribers, kyc_status,
      user_id, is_live, cover_image_path,
      users!inner ( display_name ),
      creator_categories ( category, is_active )
    `)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = ((data.creator_categories ?? []) as any[])
    .filter((c) => c.is_active)
    .map((c) => c.category as string);

  // Prefer cover_image_path; fall back to primary reference photo
  let heroPhotoUrl: string | null = null;
  const heroPath: string | null = data.cover_image_path ?? null;
  let finalPath = heroPath;

  if (!finalPath) {
    const { data: primaryPhoto } = await admin
      .from("creator_reference_photos")
      .select("storage_path")
      .eq("creator_id", id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    finalPath = primaryPhoto?.storage_path ?? null;
  }

  if (finalPath) {
    const { data: signed } = await admin.storage
      .from("reference-photos")
      .createSignedUrl(finalPath, 3600);
    heroPhotoUrl = signed?.signedUrl ?? null;
  }

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
    instagram_handle: cleanHandle(data.instagram_handle ?? null),
    instagram_followers: data.instagram_followers ?? null,
    youtube_handle: cleanHandle(data.youtube_handle ?? null),
    youtube_subscribers: data.youtube_subscribers ?? null,
    kyc_status: data.kyc_status ?? null,
    hero_photo_url: heroPhotoUrl,
    is_live: data.is_live ?? false,
    categories,
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
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to discover
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
        {/* ── Left: profile ── */}
        <div>
          {/* Photo + identity row */}
          <div className="flex gap-5 items-start mb-6">
            {/* Portrait photo */}
            <div className="relative shrink-0 w-[120px] aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--color-secondary)] sm:w-[160px]">
              {creator.hero_photo_url ? (
                <Image
                  src={creator.hero_photo_url}
                  alt={creator.display_name}
                  fill
                  className="object-cover object-top"
                  sizes="160px"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-[48px] font-800 text-[var(--color-muted-foreground)]/30">
                  {creator.display_name[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>

            {/* Name + handles + badges */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="font-display text-2xl font-800 tracking-tight text-[var(--color-foreground)] sm:text-3xl leading-tight">
                  {creator.display_name}
                </h1>
                {creator.is_live && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-700 text-emerald-600">
                    ● Live
                  </span>
                )}
                {creator.kyc_status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-700 text-[var(--color-muted-foreground)]">
                    <ShieldCheck className="h-3 w-3" /> KYC
                  </span>
                )}
              </div>

              {/* Social handles */}
              <div className="flex flex-col gap-1.5 mt-2">
                {creator.instagram_handle && (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted-foreground)]">
                    <InstagramIcon className="h-3.5 w-3.5 shrink-0 text-[#E1306C]" />
                    <span>@{creator.instagram_handle}</span>
                    {fmtFollowers(creator.instagram_followers) && (
                      <span className="font-700 text-[var(--color-foreground)]">
                        {fmtFollowers(creator.instagram_followers)}
                      </span>
                    )}
                  </div>
                )}
                {creator.youtube_handle && (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted-foreground)]">
                    <YouTubeIcon className="h-3.5 w-3.5 shrink-0 text-[#FF0000]" />
                    <span>@{creator.youtube_handle}</span>
                    {fmtFollowers(creator.youtube_subscribers) && (
                      <span className="font-700 text-[var(--color-foreground)]">
                        {fmtFollowers(creator.youtube_subscribers)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {creator.bio && (
                <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-foreground)] line-clamp-4">
                  {creator.bio}
                </p>
              )}

              {/* Categories / niches */}
              {creator.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {creator.categories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2.5 py-0.5 font-mono text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              How it works
            </p>
            <div className="space-y-2.5">
              {[
                { n: "1", text: "Pick a package and send a collab request with your product photo" },
                { n: "2", text: "Creator reviews and accepts (72h window)" },
                { n: "3", text: "Pay upfront — Faiceoff holds funds until collab completes" },
                { n: "4", text: "AI generates images using creator's likeness → creator approves → license issued" },
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

        {/* ── Right: package cards ── */}
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
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.iconBg} ${meta.iconColor}`}>
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

                    <p className="mb-3 text-[12px] text-[var(--color-muted-foreground)] leading-relaxed">
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
