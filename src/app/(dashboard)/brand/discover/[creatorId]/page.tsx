/**
 * /brand/discover/[creatorId] — Creator profile + Packages
 *
 * Hero-first layout: large portrait + identity stack on the right.
 * Packages render as a 3-up grid below the hero with expandable detail.
 */

import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Tag,
  Send,
  CreditCard,
  Wand2,
  FileBadge,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { PackageList } from "./package-list";

/* ── Brand SVG icons ── */
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
  is_verified: boolean;
  hero_photo_url: string | null;
  is_live: boolean;
  categories: string[];
  packages: CreatorPackageRow[];
}

function cleanHandle(h: string | null): string | null {
  if (!h) return null;
  return h.replace(/^@+/, "");
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
      youtube_handle, youtube_subscribers, kyc_status, is_verified,
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

  let heroPhotoUrl: string | null = null;
  let finalPath: string | null = data.cover_image_path ?? null;

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
    is_verified: data.is_verified === true,
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

  const totalReach =
    (creator.instagram_followers ?? 0) + (creator.youtube_subscribers ?? 0);
  const totalReachStr = fmtFollowers(totalReach);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Back link */}
      <Link
        href="/brand/discover"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to discover
      </Link>

      {/* ═══════════ HERO ═══════════ */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[340px_1fr] lg:gap-10">
        {/* Photo */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-[var(--color-secondary)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
          {creator.hero_photo_url ? (
            <Image
              src={creator.hero_photo_url}
              alt={creator.display_name}
              fill
              className="object-cover object-top"
              sizes="(max-width: 768px) 100vw, 340px"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-[88px] font-800 text-[var(--color-muted-foreground)]/30">
              {creator.display_name[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          {/* Gradient overlay for badge contrast */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
          {/* Gold verified tick */}
          {creator.is_verified && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
              <VerifiedSeal size={13} /> Verified
            </span>
          )}
        </div>

        {/* Info column */}
        <div className="flex flex-col">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            Creator profile
          </p>
          <h1 className="mt-1 font-display text-[40px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] sm:text-[52px] lg:text-[64px]">
            {creator.display_name}
          </h1>

          {creator.bio && (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
              {creator.bio}
            </p>
          )}

          {/* Stats strip */}
          <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-md">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5">
              <p className="font-display text-[18px] font-800 leading-none text-[var(--color-foreground)]">
                {totalReachStr ?? "—"}
              </p>
              <p className="mt-1 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Total reach
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5">
              <p className="font-display text-[18px] font-800 leading-none text-[var(--color-foreground)]">
                {creator.categories.length || 0}
              </p>
              <p className="mt-1 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Niches
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5">
              <p className="font-display text-[18px] font-800 leading-none text-[var(--color-foreground)]">
                {creator.packages.length}
              </p>
              <p className="mt-1 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Packages
              </p>
            </div>
          </div>

          {/* Social handles */}
          {(creator.instagram_handle || creator.youtube_handle) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {creator.instagram_handle && (
                <a
                  href={`https://instagram.com/${creator.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12px] text-[var(--color-foreground)] transition-all hover:border-[#E1306C]/50 hover:bg-[#E1306C]/5"
                >
                  <InstagramIcon className="h-3.5 w-3.5 text-[#E1306C]" />
                  <span className="font-600">@{creator.instagram_handle}</span>
                  {fmtFollowers(creator.instagram_followers) && (
                    <span className="font-700 text-[var(--color-muted-foreground)]">
                      · {fmtFollowers(creator.instagram_followers)}
                    </span>
                  )}
                </a>
              )}
              {creator.youtube_handle && (
                <a
                  href={`https://youtube.com/@${creator.youtube_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12px] text-[var(--color-foreground)] transition-all hover:border-[#FF0000]/50 hover:bg-[#FF0000]/5"
                >
                  <YouTubeIcon className="h-3.5 w-3.5 text-[#FF0000]" />
                  <span className="font-600">@{creator.youtube_handle}</span>
                  {fmtFollowers(creator.youtube_subscribers) && (
                    <span className="font-700 text-[var(--color-muted-foreground)]">
                      · {fmtFollowers(creator.youtube_subscribers)}
                    </span>
                  )}
                </a>
              )}
            </div>
          )}

          {/* Categories */}
          {creator.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {creator.categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS — horizontal timeline ═══════════ */}
      <section className="mt-10">
        <p className="mb-4 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          How a collab works
        </p>
        <div className="relative grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-0">
          {/* Connecting line — desktop only */}
          <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent md:block" />

          {[
            { icon: Send, title: "Pick + send", body: "Choose a package and send a request with your product photo + brief." },
            { icon: CreditCard, title: "Creator accepts", body: "72-hour window. You only pay after they accept." },
            { icon: Wand2, title: "Generate", body: "Faiceoff AI creates branded images using the creator's likeness." },
            { icon: FileBadge, title: "Approve + license", body: "Creator approves each image. License PDF + audit log issued." },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="relative flex flex-col items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 md:items-center md:border-0 md:bg-transparent md:p-3 md:text-center"
              >
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="md:mt-1">
                  <p className="flex items-center gap-2 font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)] md:justify-center">
                    <span className="font-mono text-[10px] font-700 text-[var(--color-primary)]">
                      0{i + 1}
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                    {step.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════ PACKAGES ═══════════ */}
      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Packages
            </p>
            <h2 className="mt-1 font-display text-[26px] font-800 tracking-tight text-[var(--color-foreground)]">
              Pick the right tier for your campaign
            </h2>
          </div>
          <p className="hidden text-[12px] text-[var(--color-muted-foreground)] sm:block">
            Tap <span className="font-700 text-[var(--color-foreground)]">View full info</span> on any tier
          </p>
        </div>

        {!creator.is_live && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-[13px] text-amber-600">
            <Users className="h-3.5 w-3.5 shrink-0" />
            This creator is paused right now. You can still browse their packages.
          </div>
        )}

        <PackageList
          creatorId={creatorId}
          packages={creator.packages}
          isLive={creator.is_live}
        />
      </section>
    </div>
  );
}
