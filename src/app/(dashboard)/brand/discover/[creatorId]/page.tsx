/**
 * /brand/discover/[creatorId] — Creator detail + Generate trigger
 *
 * Server component fetches creator profile and brand balance, then renders
 * the LaunchSection client island which owns the GenerationSheet.
 */

import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AtSign, Sparkles, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LaunchSection } from "./launch-section";

interface CreatorCategoryRow {
  id: string;
  category: string;
  subcategories: string[] | null;
  price_per_generation_paise: number;
  is_active: boolean;
}

interface CreatorDetail {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  kyc_status: string | null;
  hero_photo_url: string | null;
  categories: CreatorCategoryRow[];
}

interface BrandBalance {
  credits_remaining: number;
  wallet_available_paise: number;
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatFollowersShort(n: number | null): string | null {
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
    .select(
      `
      id, bio, instagram_handle, instagram_followers, kyc_status, user_id,
      users!inner ( display_name ),
      creator_categories (
        id, category, subcategories, price_per_generation_paise, is_active
      )
    `,
    )
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

  return {
    id: data.id as string,
    display_name: data.users?.display_name ?? "Creator",
    bio: data.bio ?? null,
    instagram_handle: data.instagram_handle ?? null,
    instagram_followers: data.instagram_followers ?? null,
    kyc_status: data.kyc_status ?? null,
    hero_photo_url: heroPhotoUrl,
    categories: (data.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active) as CreatorCategoryRow[],
  };
}

async function loadBrandBalance(userId: string): Promise<BrandBalance | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!brand) return null;

  const { data: billing } = await admin
    .from("v_brand_billing")
    .select("credits_remaining, wallet_available_paise")
    // View exposes brand id as `brand_id`, NOT `id`.
    .eq("brand_id", brand.id)
    .maybeSingle();

  return {
    credits_remaining: (billing?.credits_remaining as number) ?? 0,
    wallet_available_paise: (billing?.wallet_available_paise as number) ?? 0,
  };
}

interface PageProps {
  params: Promise<{ creatorId: string }>;
}

export default async function BrandCreatorDetailPage({ params }: PageProps) {
  const { creatorId } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Data ───────────────────────────────────────────────────────────────────
  const [creator, brandBalance] = await Promise.all([
    loadCreator(creatorId),
    loadBrandBalance(user.id),
  ]);

  if (!creator) notFound();
  if (!brandBalance) redirect("/brand/dashboard");

  const cheapestCategory = creator.categories.length > 0
    ? creator.categories.reduce((min, c) =>
        c.price_per_generation_paise < min.price_per_generation_paise ? c : min,
      )
    : null;

  // Pre-pick the cheapest active category so the GenerationSheet has a known
  // price to anchor on. The sheet itself handles per-scope/exclusivity uplift.
  const sheetCreator = {
    id: creator.id,
    display_name: creator.display_name,
    base_price_paise: cheapestCategory?.price_per_generation_paise ?? 0,
    categories: creator.categories.map((c) => c.category),
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Back link */}
      <Link
        href="/brand/discover"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to discover
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-10">
        {/* ── Left: profile ──────────────────────────────────────────────── */}
        <div>
          {/* Hero */}
          <div className="relative aspect-[4/5] sm:aspect-[16/9] rounded-[var(--radius-card)] overflow-hidden bg-[var(--color-blush)] mb-5">
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
                <Sparkles className="size-16 text-[var(--color-foreground)] opacity-40" />
              </div>
            )}
            {creator.kyc_status === "verified" && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-card)]/90 backdrop-blur-sm border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-foreground)]">
                <ShieldCheck className="size-3" />
                KYC verified
              </span>
            )}
          </div>

          {/* Name + handle */}
          <div className="mb-4">
            <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-foreground)]">
              {creator.display_name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
              {creator.instagram_handle && (
                <span className="inline-flex items-center gap-1">
                  <AtSign className="size-3.5" />
                  {creator.instagram_handle}
                </span>
              )}
              {formatFollowersShort(creator.instagram_followers) && (
                <span className="font-600 text-[var(--color-foreground)]">
                  {formatFollowersShort(creator.instagram_followers)} followers
                </span>
              )}
            </div>
          </div>

          {/* Bio */}
          {creator.bio && (
            <p className="text-sm text-[var(--color-foreground)] leading-relaxed mb-6">
              {creator.bio}
            </p>
          )}

          {/* Categories list */}
          <div>
            <p className="mb-3 text-xs font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Available categories
            </p>
            <div className="space-y-2">
              {creator.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-border)]/15 bg-[var(--color-card)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-600 text-[var(--color-foreground)]">
                      {cat.category}
                    </p>
                    {cat.subcategories && cat.subcategories.length > 0 && (
                      <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                        {cat.subcategories.slice(0, 4).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-700 text-[var(--color-foreground)]">
                    {formatINR(cat.price_per_generation_paise)}
                    <span className="text-[10px] font-500 text-[var(--color-muted-foreground)] ml-0.5">
                      /img
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: launch panel ───────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-6 self-start">
          <LaunchSection
            creator={sheetCreator}
            brandBalance={brandBalance}
          />
        </aside>
      </div>
    </div>
  );
}
