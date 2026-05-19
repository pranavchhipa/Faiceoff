/**
 * Public Creator Profile — /creators/[slug]
 *
 * Server-rendered, no auth required. Brands discover creators here via direct
 * link (IG bio, DM share, etc.). The page surfaces:
 *   - Hero: avatar + handle + verified badge + follower count + bio
 *   - Categories chips (what the creator does)
 *   - AI demo gallery (bento, 1-4 images)
 *   - Pricing tiers (Frame / Feature / Cover)
 *   - Trust metrics
 *   - "Launch a Campaign" CTA → existing collab-request flow
 *
 * If the slug isn't published, renders a clean 404.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AtSign,
  CheckCircle2,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { DEMO_CATEGORIES, type DemoCategoryKey } from "@/lib/profile/demo-prompts";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://faiceoff.com";

interface PublicProfileResponse {
  slug: string;
  published_at: string | null;
  theme: string;
  is_live: boolean;
  creator: {
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    instagram_handle: string | null;
    instagram_followers: number | null;
    instagram_account_type: string | null;
    instagram_verified: boolean;
    instagram_media_count: number | null;
  };
  categories: DemoCategoryKey[];
  samples: Array<{
    id: string;
    category: DemoCategoryKey;
    image_url: string;
    created_at: string;
  }>;
  packages: Array<{
    id: string;
    tier: string;
    price_paise: number;
    final_images: number;
    description: string | null;
  }>;
  stats: {
    completed_collabs: number;
    approval_rate_pct: number | null;
  };
}

async function fetchProfile(slug: string): Promise<PublicProfileResponse | null> {
  const res = await fetch(`${APP_URL}/api/public/creators/${slug}`, {
    // Revalidate every 60s — profile data is fairly static
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfileResponse;
}

/* ───────── Metadata (OG / Twitter / etc.) ───────── */

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchProfile(slug);
  if (!data) return { title: "Creator not found · Faiceoff" };

  const title = `${data.creator.display_name} · AI-licensed creator on Faiceoff`;
  const description = data.creator.bio
    ? data.creator.bio.slice(0, 160)
    : `Launch a brand campaign with ${data.creator.display_name}. ${data.categories.length} signature categories, ${data.creator.instagram_followers ?? 0} IG followers.`;
  const ogImage = `${APP_URL}/api/public/creators/${slug}/og`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/creators/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/* ───────── Page ───────── */

function inr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const TIER_META: Record<string, { label: string; tagline: string; emoji: string }> = {
  frame: { label: "Frame", tagline: "Social organic · 90 days", emoji: "🖼" },
  feature: { label: "Feature", tagline: "Social paid · 180 days", emoji: "⭐" },
  cover: { label: "Cover", tagline: "Digital full · 365 days", emoji: "👑" },
};

export default async function CreatorProfilePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await fetchProfile(slug);
  if (!data) notFound();

  const c = data.creator;

  // Sort samples in selected-categories order for visual consistency
  const samplesByCategory = new Map(data.samples.map((s) => [s.category, s]));
  const orderedSamples = data.categories
    .map((cat) => samplesByCategory.get(cat))
    .filter(Boolean) as PublicProfileResponse["samples"];

  // Determine default package for the brand CTA (cheapest = frame)
  const defaultPackage = data.packages[0];
  const ctaHref = defaultPackage
    ? `/signup?role=brand&intent=collab&creator=${data.slug}&package=${defaultPackage.id}`
    : `/signup?role=brand&intent=discover&creator=${data.slug}`;

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/[0.08] via-[var(--color-background)] to-[var(--color-background)]">
        {/* Decorative grain dots */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-foreground) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
          <div className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
            {/* Avatar */}
            <div className="flex justify-center md:block">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-[var(--color-primary)]/40 via-transparent to-emerald-400/30 blur-2xl" />
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar_url}
                    alt={c.display_name}
                    className="relative h-32 w-32 rounded-full object-cover ring-4 ring-[var(--color-card)] md:h-40 md:w-40"
                  />
                ) : (
                  <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-[var(--color-secondary)] font-display text-4xl font-800 text-[var(--color-foreground)] ring-4 ring-[var(--color-card)] md:h-40 md:w-40">
                    {c.display_name[0]?.toUpperCase()}
                  </div>
                )}
                {/* Live availability dot */}
                {data.is_live && (
                  <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-[var(--color-background)]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  </span>
                )}
              </div>
            </div>

            {/* Identity + CTAs */}
            <div className="text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                {c.instagram_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified Creator
                  </span>
                )}
                {data.is_live && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider text-emerald-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Accepting collabs
                  </span>
                )}
                {c.instagram_account_type && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {c.instagram_account_type.replace("_", " ")}
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-display text-[42px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[58px]">
                {c.display_name}
              </h1>

              {c.instagram_handle && (
                <a
                  href={`https://instagram.com/${c.instagram_handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 font-mono text-[13px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  <AtSign className="h-3.5 w-3.5" />
                  {c.instagram_handle}
                </a>
              )}

              {c.bio && (
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted-foreground)] md:mx-0">
                  {c.bio}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-start">
                {c.instagram_followers !== null && c.instagram_followers > 0 && (
                  <Stat
                    icon={<Users className="h-3.5 w-3.5" />}
                    value={c.instagram_followers.toLocaleString("en-IN")}
                    label="followers"
                  />
                )}
                {data.stats.completed_collabs > 0 && (
                  <Stat
                    icon={<Zap className="h-3.5 w-3.5" />}
                    value={data.stats.completed_collabs.toString()}
                    label="collabs done"
                  />
                )}
                {data.stats.approval_rate_pct !== null && (
                  <Stat
                    icon={<Star className="h-3.5 w-3.5" />}
                    value={`${data.stats.approval_rate_pct}%`}
                    label="approval rate"
                  />
                )}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Link
                  href={ctaHref}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 font-display text-[15px] font-700 tracking-tight text-[var(--color-primary-foreground)] shadow-[0_6px_20px_-6px_rgba(201,169,110,0.6)] transition hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" />
                  Launch a Campaign with {c.display_name.split(" ")[0]}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Categories chips ─────────────────────────────────────────────── */}
      {data.categories.length > 0 && (
        <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/40">
          <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
            <p className="mb-3 font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Signature categories
            </p>
            <div className="flex flex-wrap gap-2">
              {data.categories.map((key) => {
                const def = DEMO_CATEGORIES[key];
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 font-display text-[13px] font-600 text-[var(--color-foreground)]"
                  >
                    <span>{def.emoji}</span>
                    {def.label}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Demo gallery (bento) ─────────────────────────────────────────── */}
      {orderedSamples.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <div className="mb-8">
            <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Style Reel
            </span>
            <h2 className="mt-2 font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)] md:text-[36px]">
              See {c.display_name.split(" ")[0]} in action.
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] text-[var(--color-muted-foreground)]">
              Hand-crafted style frames using {c.display_name.split(" ")[0]}&apos;s licensed
              likeness — to show range. Your campaign will produce custom images with your actual product.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {orderedSamples.map((s) => {
              const def = DEMO_CATEGORIES[s.category];
              return (
                <figure
                  key={s.id}
                  className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-[var(--color-card)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image_url}
                    alt={`${c.display_name} demo · ${def.label}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
                    <span className="font-mono text-[10px] font-700 uppercase tracking-wider text-white/80">
                      {def.emoji} {def.label}
                    </span>
                  </div>
                  <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md ring-1 ring-white/15">
                    Style Frame
                  </div>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      {data.packages.length > 0 && (
        <section className="border-t border-[var(--color-border)] bg-[var(--color-card)]/40">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <div className="mb-8">
              <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Pricing
              </span>
              <h2 className="mt-2 font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)] md:text-[36px]">
                Pick a package, ship in 48 hours.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {data.packages.map((pkg) => {
                const meta = TIER_META[pkg.tier] ?? {
                  label: pkg.tier,
                  tagline: "",
                  emoji: "✨",
                };
                return (
                  <div
                    key={pkg.id}
                    className="relative flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 transition hover:border-[var(--color-primary)]/40 hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                        {meta.emoji} {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                      {meta.tagline}
                    </p>
                    <div className="mt-5">
                      <span className="font-display text-[32px] font-800 tracking-tight text-[var(--color-foreground)]">
                        {inr(pkg.price_paise)}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2 text-[13px] text-[var(--color-muted-foreground)]">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        {pkg.final_images} licensed final image{pkg.final_images > 1 ? "s" : ""}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        {pkg.final_images * 3} generation credits
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Creator-approved + license PDF
                      </li>
                      {pkg.description && (
                        <li className="pt-1 text-[12px] italic text-[var(--color-muted-foreground)]/80">
                          {pkg.description}
                        </li>
                      )}
                    </ul>
                    <Link
                      href={`/signup?role=brand&intent=collab&creator=${data.slug}&package=${pkg.id}`}
                      className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] font-display text-[13px] font-700 tracking-tight text-[var(--color-foreground)] transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)]"
                    >
                      Choose {meta.label}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA strip ──────────────────────────────────────────────── */}
      <section className="border-t border-[var(--color-border)] bg-gradient-to-r from-[var(--color-primary)]/[0.08] via-[var(--color-background)] to-emerald-400/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="font-display text-[24px] font-800 tracking-tight text-[var(--color-foreground)] md:text-[32px]">
              Ready to brief {c.display_name.split(" ")[0]}?
            </h2>
            <p className="mt-1 text-[14px] text-[var(--color-muted-foreground)]">
              Skip the shoot. Pay only on approval. Licensed forever.
            </p>
          </div>
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 font-display text-[15px] font-700 tracking-tight text-[var(--color-primary-foreground)] shadow-[0_6px_20px_-6px_rgba(201,169,110,0.6)] transition hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Launch a Campaign
          </Link>
        </div>
      </section>

      {/* Powered-by footer */}
      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-[11px] text-[var(--color-muted-foreground)] lg:px-8">
        Powered by{" "}
        <Link
          href="/"
          className="font-display font-700 text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
        >
          Faiceoff
        </Link>
        {" "}· India&apos;s AI face licensing marketplace
      </footer>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[var(--color-muted-foreground)]">{icon}</span>
      <span className="font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
        {value}
      </span>
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
    </div>
  );
}
