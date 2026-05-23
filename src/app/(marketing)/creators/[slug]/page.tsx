/**
 * Public Creator Profile — /creators/[slug]
 *
 * Standalone design language, intentionally diverging from the cream-warm
 * landing page so creator profiles feel like a SEPARATE premium product.
 *
 * Aesthetic: dark editorial magazine. Heavy serif display, asymmetric bento
 * portfolio, dramatic numbers strip, full-bleed close-out. Inspired by
 * issue-cover layouts and high-end profile pages (Cameo / Linktree premium).
 *
 * Preview mode: when ?preview=1 + authenticated owner, bypasses published
 * check and renders an amber "Preview" sticky banner up top.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  AtSign,
  CheckCircle2,
  Globe,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Play,
  Quote,
  Sparkles,
  Star,
} from "lucide-react";
import { DEMO_CATEGORIES, ALL_CATEGORY_KEYS, type DemoCategoryKey } from "@/lib/profile/demo-prompts";
import { Logo } from "@/components/brand/logo";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://faiceoff.com";

interface PublicProfileResponse {
  slug: string;
  published: boolean;
  preview: boolean;
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
    youtube_handle: string | null;
    youtube_subscribers: number | null;
  };
  categories: DemoCategoryKey[];
  links: Array<{ id: string; label: string; url: string }>;
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

async function fetchProfile(
  slug: string,
  opts: { preview?: boolean; cookieHeader?: string | null } = {},
): Promise<PublicProfileResponse | null> {
  const url = `${APP_URL}/api/public/creators/${slug}${opts.preview ? "?preview=1" : ""}`;
  const res = await fetch(url, {
    next: opts.preview ? { revalidate: 0 } : { revalidate: 60 },
    cache: opts.preview ? "no-store" : undefined,
    headers: opts.cookieHeader ? { cookie: opts.cookieHeader } : undefined,
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfileResponse;
}

/* ───────── Metadata ───────── */

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchProfile(slug);
  if (!data) return { title: "Creator not found · Faiceoff" };
  const title = `${data.creator.display_name} · Brief them on Faiceoff`;
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
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

/* ───────── Helpers ───────── */

function inr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toString();
}

/**
 * Pick an icon for a custom link button based on its URL. Keeps the public
 * page self-contained (no per-link icon stored in DB).
 */
function linkGlyph(url: string) {
  const u = url.toLowerCase();
  if (u.startsWith("mailto:")) return <Mail className="h-4 w-4" />;
  if (u.startsWith("tel:")) return <Phone className="h-4 w-4" />;
  if (u.includes("wa.me") || u.includes("whatsapp")) return <MessageCircle className="h-4 w-4" />;
  if (u.includes("youtube.com") || u.includes("youtu.be")) return <Play className="h-4 w-4" />;
  if (u.includes("instagram.com")) return <AtSign className="h-4 w-4" />;
  // Has a real domain → globe; otherwise generic link
  if (/^https?:\/\//.test(u)) return <Globe className="h-4 w-4" />;
  return <Link2 className="h-4 w-4" />;
}

const TIER_META: Record<string, { label: string; tagline: string; symbol: string }> = {
  frame: { label: "Frame", tagline: "Social organic · 90 days", symbol: "I" },
  feature: { label: "Feature", tagline: "Social paid · 180 days", symbol: "II" },
  cover: { label: "Cover", tagline: "Digital full · 365 days", symbol: "III" },
};

/**
 * Spread N images across a 12-col asymmetric magazine layout.
 * Returns Tailwind col/row classes per index so 1, 2, 3, 4 images all look
 * intentional (not just a 4-up grid).
 */
function bentoClassFor(index: number, total: number): string {
  if (total === 1) return "col-span-12 md:row-span-2";
  if (total === 2) {
    return index === 0 ? "col-span-12 md:col-span-7 md:row-span-2" : "col-span-12 md:col-span-5 md:row-span-2";
  }
  if (total === 3) {
    if (index === 0) return "col-span-12 md:col-span-8 md:row-span-2";
    return "col-span-12 md:col-span-4";
  }
  // total === 4
  if (index === 0) return "col-span-12 md:col-span-7 md:row-span-2";
  if (index === 1) return "col-span-12 md:col-span-5";
  if (index === 2) return "col-span-6 md:col-span-3";
  return "col-span-6 md:col-span-2";
}

/* ───────── Page ───────── */

export default async function CreatorProfilePage(
  {
    params,
    searchParams,
  }: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ preview?: string }>;
  },
) {
  const { slug } = await params;
  const sp = await searchParams;
  const wantsPreview = sp.preview === "1";

  let cookieHeader: string | null = null;
  if (wantsPreview) {
    const { headers } = await import("next/headers");
    const h = await headers();
    cookieHeader = h.get("cookie");
  }

  const data = await fetchProfile(slug, { preview: wantsPreview, cookieHeader });
  if (!data) notFound();

  const c = data.creator;
  const firstName = c.display_name.split(" ")[0];

  // Order samples by category selection for visual consistency
  const samplesByCategory = new Map(data.samples.map((s) => [s.category, s]));
  const orderedSamples = data.categories
    .map((cat) => samplesByCategory.get(cat))
    .filter(Boolean) as PublicProfileResponse["samples"];

  const defaultPackage = data.packages[0];
  const ctaHref = defaultPackage
    ? `/signup?role=brand&intent=collab&creator=${data.slug}&package=${defaultPackage.id}`
    : `/signup?role=brand&intent=discover&creator=${data.slug}`;

  // Edition number — playful: ms since publish % 999 + 1
  const editionNo = data.published_at
    ? (Math.floor(new Date(data.published_at).getTime() / 1000) % 999) + 1
    : 1;

  const publishedDateLabel = data.published_at
    ? new Date(data.published_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "—";

  // ── schema.org JSON-LD — Person + Offers + Breadcrumb (rich results) ──
  const profileUrl = `${APP_URL}/creators/${data.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${profileUrl}#person`,
        name: c.display_name,
        url: profileUrl,
        image: c.avatar_url ?? undefined,
        description: c.bio ?? `${c.display_name} — verified AI creator on Faiceoff.`,
        sameAs: c.instagram_handle
          ? [`https://instagram.com/${c.instagram_handle}`]
          : undefined,
        ...(c.instagram_followers
          ? {
              interactionStatistic: {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/FollowAction",
                userInteractionCount: c.instagram_followers,
              },
            }
          : {}),
      },
      ...(data.packages.length > 0
        ? [
            {
              "@type": "Service",
              "@id": `${profileUrl}#service`,
              serviceType: "Licensed AI likeness content",
              provider: { "@id": `${profileUrl}#person` },
              areaServed: "IN",
              offers: data.packages.map((p) => ({
                "@type": "Offer",
                name: p.tier,
                price: (p.price_paise / 100).toFixed(2),
                priceCurrency: "INR",
                url: profileUrl,
              })),
            },
          ]
        : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Creators", item: `${APP_URL}/creators` },
          { "@type": "ListItem", position: 2, name: c.display_name, item: profileUrl },
        ],
      },
    ],
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden text-[#f5ebd6] selection:bg-[#e8825d]/30"
      style={{
        background:
          "radial-gradient(ellipse at top, #1a1612 0%, #0a0908 45%, #0a0908 100%)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* schema.org structured data — only for published (indexable) profiles */}
      {!data.preview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* Decorative film grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* ── Preview banner (only for owner of an unpublished profile) ───── */}
      {data.preview && (
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-[12px] font-600 text-amber-300 backdrop-blur-md">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Preview mode · this profile isn&apos;t public yet.{" "}
          <Link
            href="/creator/profile/setup"
            className="font-700 underline underline-offset-2"
          >
            Publish from setup
          </Link>
        </div>
      )}

      {/* ── Floating top navigation ─────────────────────────────────────── */}
      <header className="relative z-50 mx-auto flex max-w-[1400px] items-center justify-between px-4 pt-4 sm:px-5 sm:pt-6 lg:px-10">
        <Link href="/" aria-label="Faiceoff home" className="group inline-flex items-center">
          <Logo
            variant="full"
            tone="light"
            className="h-7 w-auto transition-transform group-hover:scale-[1.03] sm:h-8"
          />
        </Link>
        <Link
          href={ctaHref}
          className="group inline-flex h-11 items-center gap-1.5 rounded-full bg-[#f5ebd6] px-4 text-[12px] font-700 tracking-tight text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white sm:gap-2 sm:px-5 sm:text-[13px]"
          style={{ fontFamily: "Outfit, system-ui" }}
        >
          <span className="hidden sm:inline">Launch a Campaign</span>
          <span className="sm:hidden">Launch</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      {/* ── HERO — Magazine-cover split ─────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pt-8 pb-14 sm:px-5 sm:pt-10 sm:pb-20 lg:px-10 lg:pt-16 lg:pb-32">
        {/* Issue meta strip */}
        <div className="mb-6 flex items-center justify-between font-mono text-[9px] font-700 uppercase tracking-[0.22em] text-[#a89570] sm:mb-10 sm:text-[10px] sm:tracking-[0.28em]">
          <span>Issue №{String(editionNo).padStart(3, "0")} · {publishedDateLabel}</span>
          <span className="hidden sm:inline">Creator Edition</span>
        </div>

        <div className="grid gap-7 sm:gap-10 lg:grid-cols-[460px_1fr] lg:gap-16">
          {/* Portrait — left */}
          <div className="relative">
            <div className="relative aspect-[4/5] w-full max-w-[460px] overflow-hidden rounded-sm bg-[#1a1612]">
              {c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async"
                  src={c.avatar_url}
                  alt={c.display_name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a2520] to-[#0d0c0a] text-[140px] font-800 text-[#3a3530]">
                  {c.display_name[0]?.toUpperCase()}
                </div>
              )}
              {/* Gradient overlay for text legibility on bottom corner */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              {/* Verified watermark inside the portrait */}
              {c.instagram_verified && (
                <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#f5ebd6] backdrop-blur-md ring-1 ring-white/15">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  Verified
                </div>
              )}

              {/* Live availability dot */}
              {data.is_live && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md ring-1 ring-emerald-400/30">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Accepting collabs
                </div>
              )}
            </div>

            {/* Caption — magazine credit */}
            <div className="mt-3 flex items-baseline justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6e6457] sm:text-[10px] sm:tracking-[0.22em]">
              <span className="truncate">Pict. AI Studio · Faiceoff</span>
              <span className="truncate">{c.instagram_handle ? `@${c.instagram_handle}` : ""}</span>
            </div>
          </div>

          {/* Identity — right */}
          <div className="flex flex-col justify-center">
            {/* Categories — secondary tags above name */}
            {data.categories.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.24em] text-[#a89570]">
                {data.categories.map((key, i) => (
                  <span key={key} className="inline-flex items-center gap-2">
                    {i > 0 && <span className="opacity-40">/</span>}
                    {DEMO_CATEGORIES[key].label.split(" & ")[0]}
                  </span>
                ))}
              </div>
            )}

            {/* Name */}
            <h1
              className="break-words font-800 leading-[0.95] tracking-[-0.03em] text-[#f5ebd6] sm:leading-[0.92] sm:tracking-[-0.035em]"
              style={{
                fontFamily: "Outfit, system-ui",
                fontSize: "clamp(36px, 7vw, 88px)",
              }}
            >
              {c.display_name}
            </h1>

            {/* Handle */}
            {c.instagram_handle && (
              <a
                href={`https://instagram.com/${c.instagram_handle}`}
                target="_blank"
                rel="noreferrer"
                className="group mt-5 inline-flex items-center gap-1.5 self-start font-mono text-[14px] text-[#a89570] hover:text-[#f5ebd6]"
              >
                <AtSign className="h-3.5 w-3.5" />
                {c.instagram_handle}
                <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
              </a>
            )}

            {/* Bio */}
            {c.bio && (
              <p
                className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#d9c9aa] sm:mt-7 sm:text-[17px]"
                style={{ fontFamily: "Outfit, system-ui" }}
              >
                {c.bio}
              </p>
            )}

            {/* Stats inline — creator marketplace metrics only.
                Social-platform numbers (IG followers / YouTube subs) live in
                the dedicated SocialCard section below. */}
            {(data.stats.completed_collabs > 0 ||
              data.stats.approval_rate_pct !== null) && (
              <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[#2a2520] pt-6 sm:mt-9 sm:flex sm:flex-wrap sm:items-center sm:gap-x-10 sm:gap-y-3 sm:pt-7">
                {data.stats.completed_collabs > 0 && (
                  <HeroStat
                    value={data.stats.completed_collabs.toString()}
                    label="collabs done"
                  />
                )}
                {data.stats.approval_rate_pct !== null && (
                  <HeroStat
                    value={`${data.stats.approval_rate_pct}%`}
                    label="approval rate"
                  />
                )}
              </div>
            )}

            {/* CTA */}
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href={ctaHref}
                className="group inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[#e8825d] px-6 text-[14px] font-800 tracking-tight text-white shadow-[0_8px_30px_-8px_rgba(232,130,93,0.6)] transition hover:bg-[#e96d3f] sm:w-auto sm:gap-3 sm:px-7 sm:text-[15px]"
                style={{ fontFamily: "Outfit, system-ui" }}
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  Brief {firstName}
                  <span className="hidden sm:inline"> — launch a campaign</span>
                </span>
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              {defaultPackage && (
                <span className="text-center font-mono text-[11px] font-600 uppercase tracking-[0.18em] text-[#8d8275] sm:text-left">
                  starts at <span className="text-[#f5ebd6]">{inr(defaultPackage.price_paise)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL — IG + YouTube cards ─────────────────────────────────── */}
      {(c.instagram_handle || c.youtube_handle) && (
        <section className="relative z-10 mx-auto max-w-[1400px] px-4 pb-14 sm:px-5 sm:pb-20 lg:px-10 lg:pb-24">
          <div className="mb-5 flex items-end justify-between gap-3 sm:mb-7">
            <div>
              <div className="font-mono text-[10px] font-700 uppercase tracking-[0.24em] text-[#a89570] sm:text-[11px] sm:tracking-[0.28em]">
                Audience
              </div>
              <h2
                className="mt-1.5 font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6] sm:mt-2"
                style={{
                  fontFamily: "Outfit, system-ui",
                  fontSize: "clamp(24px, 3.5vw, 40px)",
                }}
              >
                Where {firstName} shows up.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {c.instagram_handle && (
              <SocialCard
                platform="instagram"
                handle={c.instagram_handle}
                href={`https://instagram.com/${c.instagram_handle}`}
                primaryStat={
                  c.instagram_followers !== null && c.instagram_followers > 0
                    ? compactNumber(c.instagram_followers)
                    : "—"
                }
                primaryLabel="followers"
                secondaryStat={
                  c.instagram_media_count !== null && c.instagram_media_count > 0
                    ? compactNumber(c.instagram_media_count)
                    : null
                }
                secondaryLabel="posts"
                verified={c.instagram_verified}
                accountType={c.instagram_account_type}
              />
            )}
            {c.youtube_handle && (
              <SocialCard
                platform="youtube"
                handle={c.youtube_handle.replace(/^@/, "")}
                href={`https://youtube.com/${c.youtube_handle.startsWith("@") ? c.youtube_handle : `@${c.youtube_handle}`}`}
                primaryStat={
                  c.youtube_subscribers !== null && c.youtube_subscribers > 0
                    ? compactNumber(c.youtube_subscribers)
                    : "—"
                }
                primaryLabel="subscribers"
                secondaryStat={null}
                secondaryLabel={null}
                verified={false}
                accountType={null}
              />
            )}
          </div>
        </section>
      )}

      {/* ── LINKS — Linktree-style custom buttons ───────────────────────── */}
      {data.links.length > 0 && (
        <section className="relative z-10 mx-auto max-w-[1400px] px-4 pb-14 sm:px-5 sm:pb-20 lg:px-10 lg:pb-24">
          <div className="mb-5 sm:mb-7">
            <div className="font-mono text-[10px] font-700 uppercase tracking-[0.24em] text-[#a89570] sm:text-[11px] sm:tracking-[0.28em]">
              Links
            </div>
            <h2
              className="mt-1.5 font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6] sm:mt-2"
              style={{
                fontFamily: "Outfit, system-ui",
                fontSize: "clamp(24px, 3.5vw, 40px)",
              }}
            >
              More from {firstName}.
            </h2>
          </div>

          <div className="mx-auto grid max-w-2xl gap-2.5 sm:gap-3">
            {data.links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer nofollow"
                className="group flex items-center gap-3 rounded-sm border border-[#2a2520] bg-[#0d0c0a] px-5 py-4 transition hover:border-[#3a3530] hover:bg-[#1a1612]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1a1612] text-[#a89570] ring-1 ring-[#2a2520] group-hover:text-[#e8825d]">
                  {linkGlyph(link.url)}
                </span>
                <span
                  className="flex-1 truncate font-700 tracking-tight text-[#f5ebd6]"
                  style={{ fontFamily: "Outfit, system-ui", fontSize: "15px" }}
                >
                  {link.label}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[#6e6457] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#f5ebd6]" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── PORTFOLIO — magazine bento ──────────────────────────────────── */}
      {orderedSamples.length > 0 && (
        <section
          className="relative z-10 border-y border-[#2a2520] bg-[#0d0c0a]/40 px-4 py-14 sm:px-5 sm:py-20 lg:px-10 lg:py-28"
        >
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-7 flex flex-col gap-4 sm:mb-10 md:flex-row md:items-end md:justify-between md:gap-6">
              <div>
                <div className="font-mono text-[10px] font-700 uppercase tracking-[0.24em] text-[#a89570] sm:text-[11px] sm:tracking-[0.28em]">
                  The Portfolio
                </div>
                <h2
                  className="mt-2 font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6]"
                  style={{
                    fontFamily: "Outfit, system-ui",
                    fontSize: "clamp(30px, 5vw, 64px)",
                  }}
                >
                  See {firstName} in action.
                </h2>
              </div>
              <p className="max-w-md text-[13px] leading-relaxed text-[#8d8275]">
                Hand-crafted style frames using {firstName}&apos;s licensed likeness.
                Your campaign will produce custom images with your actual product.
              </p>
            </div>

            <div className="grid auto-rows-[280px] grid-cols-12 gap-2.5 sm:auto-rows-[260px] sm:gap-3 md:auto-rows-[280px] md:gap-4">
              {orderedSamples.map((s, idx) => {
                const def = DEMO_CATEGORIES[s.category];
                return (
                  <figure
                    key={s.id}
                    className={`group relative overflow-hidden rounded-sm bg-[#1a1612] ${bentoClassFor(idx, orderedSamples.length)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async"
                      src={s.image_url}
                      alt={`${c.display_name} · ${def.label}`}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.05]"
                    />
                    {/* Bottom gradient */}
                    <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    {/* Category tag */}
                    <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                      <div>
                        <div className="font-mono text-[9.5px] font-700 uppercase tracking-[0.22em] text-[#e8825d]">
                          {def.label.split(" & ")[0]}
                        </div>
                        <div
                          className="mt-1 font-700 leading-tight tracking-tight text-[#f5ebd6]"
                          style={{
                            fontFamily: "Outfit, system-ui",
                            fontSize: idx === 0 ? "20px" : "14px",
                          }}
                        >
                          {def.label}
                        </div>
                      </div>
                      <span className="rounded-full bg-black/60 px-2 py-0.5 font-mono text-[8.5px] font-700 uppercase tracking-wider text-white/70 backdrop-blur-md ring-1 ring-white/10">
                        Made by Faiceoff
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── NUMBERS — full-bleed stats strip ────────────────────────────── */}
      <section className="relative z-10 px-4 py-14 sm:px-5 sm:py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-px overflow-hidden rounded-sm bg-[#2a2520] md:grid-cols-4">
          <BigStat
            value={data.stats.completed_collabs.toString()}
            label="Campaigns delivered"
          />
          <BigStat
            value={
              data.stats.approval_rate_pct !== null
                ? `${data.stats.approval_rate_pct}%`
                : "—"
            }
            label="Approval rate"
          />
          <BigStat
            value={c.instagram_followers ? compactNumber(c.instagram_followers) : "—"}
            label="Audience reach"
          />
          <BigStat value="48h" label="Average turnaround" />
        </div>
      </section>

      {/* ── PRICING — premium tier cards ────────────────────────────────── */}
      {data.packages.length > 0 && (
        <section className="relative z-10 border-t border-[#2a2520] bg-[#0d0c0a]/40 px-4 py-14 sm:px-5 sm:py-20 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-9 flex flex-col gap-4 sm:mb-12 md:grid md:grid-cols-[1fr_auto] md:items-end md:gap-6">
              <div>
                <div className="font-mono text-[10px] font-700 uppercase tracking-[0.24em] text-[#a89570] sm:text-[11px] sm:tracking-[0.28em]">
                  The Rate Card
                </div>
                <h2
                  className="mt-2 font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6]"
                  style={{
                    fontFamily: "Outfit, system-ui",
                    fontSize: "clamp(30px, 5vw, 64px)",
                  }}
                >
                  Pick a tier.<br />Ship in 48 hours.
                </h2>
              </div>
              <p className="max-w-md text-[13px] leading-relaxed text-[#8d8275]">
                Pay only when {firstName} approves the final image. Licensed for your
                brand, traceable forever.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-sm bg-[#2a2520] md:grid-cols-3">
              {data.packages.map((pkg, idx) => {
                const meta = TIER_META[pkg.tier] ?? {
                  label: pkg.tier,
                  tagline: "",
                  symbol: "✦",
                };
                const isFeatured = idx === 1;
                return (
                  <div
                    key={pkg.id}
                    className={`relative flex flex-col p-7 transition ${
                      isFeatured
                        ? "bg-[#1a1612]"
                        : "bg-[#0d0c0a] hover:bg-[#1a1612]"
                    }`}
                  >
                    {isFeatured && (
                      <span className="absolute right-5 top-5 rounded-full bg-[#e8825d]/15 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-[#e8825d]">
                        Most popular
                      </span>
                    )}
                    <div className="font-mono text-[11px] font-700 uppercase tracking-[0.22em] text-[#a89570]">
                      Tier {meta.symbol} · {meta.label}
                    </div>
                    <div
                      className="mt-6 font-800 tracking-[-0.03em] text-[#f5ebd6]"
                      style={{
                        fontFamily: "Outfit, system-ui",
                        fontSize: "clamp(40px, 4vw, 56px)",
                        lineHeight: 1,
                      }}
                    >
                      {inr(pkg.price_paise)}
                    </div>
                    <div className="mt-1 text-[12px] text-[#8d8275]">{meta.tagline}</div>

                    <ul className="my-6 space-y-2.5 text-[13.5px] text-[#d9c9aa]">
                      <li className="flex items-start gap-2.5">
                        <span className="mt-1.5 inline-block h-1 w-3 shrink-0 bg-[#e8825d]" />
                        {pkg.final_images} licensed final image{pkg.final_images > 1 ? "s" : ""}
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="mt-1.5 inline-block h-1 w-3 shrink-0 bg-[#e8825d]" />
                        {pkg.final_images * 3} generation credits
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="mt-1.5 inline-block h-1 w-3 shrink-0 bg-[#e8825d]" />
                        Creator-approved · License PDF · Forever traceable
                      </li>
                      {pkg.description && (
                        <li className="pl-5 pt-2 text-[12px] italic text-[#8d8275]">
                          {pkg.description}
                        </li>
                      )}
                    </ul>

                    <Link
                      href={`/signup?role=brand&intent=collab&creator=${data.slug}&package=${pkg.id}`}
                      className={`mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full text-[13px] font-700 tracking-tight transition ${
                        isFeatured
                          ? "bg-[#e8825d] text-white hover:bg-[#e96d3f]"
                          : "border border-[#3a3530] bg-transparent text-[#f5ebd6] hover:border-[#f5ebd6] hover:bg-[#f5ebd6] hover:text-[#0a0908]"
                      }`}
                      style={{ fontFamily: "Outfit, system-ui" }}
                    >
                      Choose {meta.label}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── PULL-QUOTE / Brand testimonial placeholder ──────────────────── */}
      <section className="relative z-10 px-4 py-16 sm:px-5 sm:py-24 lg:px-10 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Quote className="mx-auto h-6 w-6 text-[#e8825d] sm:h-7 sm:w-7" />
          <blockquote
            className="mt-5 font-700 leading-[1.2] tracking-[-0.02em] text-[#f5ebd6] sm:mt-6 sm:leading-[1.15]"
            style={{
              fontFamily: "Outfit, system-ui",
              fontSize: "clamp(20px, 4vw, 42px)",
            }}
          >
            &ldquo;Skipped a full studio shoot. Briefed at 11pm, had three licensed
            campaign images ready before standup.&rdquo;
          </blockquote>
          <div className="mt-5 font-mono text-[10px] font-700 uppercase tracking-[0.2em] text-[#8d8275] sm:mt-6 sm:text-[10.5px] sm:tracking-[0.22em]">
            Brand Partner · 2026
          </div>
        </div>
      </section>

      {/* ── FINAL CTA — full bleed ───────────────────────────────────────── */}
      <section className="relative z-10 mx-4 mb-8 overflow-hidden rounded-sm border border-[#2a2520] sm:mx-5 sm:mb-10 lg:mx-10">
        <div
          className="relative px-5 py-14 sm:px-6 sm:py-20 md:px-16 md:py-28"
          style={{
            background:
              "linear-gradient(135deg, #1a1612 0%, #2a1f15 50%, #1a1612 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40"
            style={{
              background:
                "radial-gradient(circle, rgba(232,130,93,0.5) 0%, transparent 60%)",
            }}
          />
          <div className="relative flex flex-col items-start gap-6 sm:gap-8 md:grid md:grid-cols-[1fr_auto] md:items-center">
            <div className="w-full">
              <div className="font-mono text-[10px] font-700 uppercase tracking-[0.24em] text-[#a89570] sm:text-[11px] sm:tracking-[0.28em]">
                Ready when you are
              </div>
              <h2
                className="mt-3 max-w-2xl font-800 leading-[0.95] tracking-[-0.02em] text-[#f5ebd6]"
                style={{
                  fontFamily: "Outfit, system-ui",
                  fontSize: "clamp(32px, 6vw, 72px)",
                }}
              >
                Brief {firstName}.
                <br />
                <span className="text-[#e8825d]">Skip the shoot.</span>
              </h2>
              <p
                className="mt-4 max-w-xl text-[14px] leading-relaxed text-[#a89570] sm:text-[15px]"
                style={{ fontFamily: "Outfit, system-ui" }}
              >
                One brief. Three days. Licensed campaign-ready images with
                {" "}{firstName}&apos;s real face. No location scouting. No retainer.
                Pay only on approval.
              </p>
            </div>
            <Link
              href={ctaHref}
              className="group inline-flex h-14 w-full shrink-0 items-center justify-center gap-2.5 rounded-full bg-[#f5ebd6] px-6 text-[15px] font-800 tracking-tight text-[#0a0908] transition hover:bg-[#e8825d] hover:text-white sm:h-16 sm:w-auto sm:gap-3 sm:px-8 sm:text-[16px]"
              style={{ fontFamily: "Outfit, system-ui" }}
            >
              Launch a Campaign
              <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:h-5 sm:w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Browse by category (interlinking — every profile → all categories) ── */}
      <section className="relative z-10 border-t border-[#2a2520] px-4 py-10 sm:px-5 lg:px-10">
        <div className="mx-auto max-w-[1400px]">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[#6e6457]">
            Browse more AI creators
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/creators"
              className="inline-flex items-center rounded-full border border-[#2a2520] px-3 py-1.5 font-mono text-[10.5px] font-700 uppercase tracking-wider text-[#a89570] transition hover:border-[#e8825d]/50 hover:text-[#f5ebd6]"
            >
              All Creators
            </Link>
            {ALL_CATEGORY_KEYS.map((key) => {
              const def = DEMO_CATEGORIES[key];
              return (
                <Link
                  key={key}
                  href={`/creators/category/${key}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2520] px-3 py-1.5 font-mono text-[10.5px] font-700 uppercase tracking-wider text-[#a89570] transition hover:border-[#e8825d]/50 hover:text-[#f5ebd6]"
                >
                  {def.emoji} {def.label.split(" & ")[0]}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Minimal footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-[#2a2520] px-4 py-7 sm:px-5 sm:py-8 lg:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-5 text-center sm:flex-row sm:gap-4 sm:text-left">
          <Link href="/" className="group inline-flex items-center gap-2 opacity-80 hover:opacity-100">
            <Logo variant="mark" className="h-7 w-7" />
            <span className="font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#a89570] sm:text-[10px] sm:tracking-[0.22em]">
              Powered by Faiceoff
            </span>
          </Link>
          <div className="flex items-center gap-4 font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#6e6457] sm:gap-5 sm:text-[10px] sm:tracking-[0.22em]">
            <Link href="/terms" className="hover:text-[#f5ebd6]">Terms</Link>
            <Link href="/privacy" className="hover:text-[#f5ebd6]">Privacy</Link>
            <Link href="/verify" className="hover:text-[#f5ebd6]">Verify</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────── Sub-components ───────── */

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        className="font-800 tracking-[-0.02em] text-[#f5ebd6]"
        style={{
          fontFamily: "Outfit, system-ui",
          fontSize: "clamp(28px, 3vw, 42px)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[#8d8275]">
        {label}
      </div>
    </div>
  );
}

/* Social platform brand SVGs (inline, no external assets) */
function IgGlyph({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#ffd600" />
          <stop offset="30%" stopColor="#ff6930" />
          <stop offset="60%" stopColor="#e2436f" />
          <stop offset="90%" stopColor="#c837ab" />
          <stop offset="100%" stopColor="#6559ca" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad)" />
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.6" fill="none" />
      <circle cx="17.2" cy="6.8" r="1" fill="white" />
    </svg>
  );
}

function YtGlyph({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
      <polygon points="10,8.5 10,15.5 16,12" fill="white" />
    </svg>
  );
}

function SocialCard({
  platform,
  handle,
  href,
  primaryStat,
  primaryLabel,
  secondaryStat,
  secondaryLabel,
  verified,
  accountType,
}: {
  platform: "instagram" | "youtube";
  handle: string;
  href: string;
  primaryStat: string;
  primaryLabel: string;
  secondaryStat: string | null;
  secondaryLabel: string | null;
  verified: boolean;
  accountType: string | null;
}) {
  const Icon = platform === "instagram" ? IgGlyph : YtGlyph;
  const platformLabel = platform === "instagram" ? "Instagram" : "YouTube";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group relative flex items-center gap-4 overflow-hidden rounded-sm border border-[#2a2520] bg-[#0d0c0a] p-5 transition hover:border-[#3a3530] hover:bg-[#1a1612] sm:p-6"
    >
      {/* Subtle hover glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-2xl transition group-hover:opacity-30"
        style={{
          background:
            platform === "instagram"
              ? "radial-gradient(circle, #e2436f, transparent 70%)"
              : "radial-gradient(circle, #FF0000, transparent 70%)",
        }}
      />

      {/* Platform icon */}
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
        <Icon className="h-10 w-10 sm:h-12 sm:w-12" />
      </div>

      {/* Identity + stats */}
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-700 uppercase tracking-[0.2em] text-[#a89570]">
            {platformLabel}
          </span>
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-px font-mono text-[8.5px] font-700 uppercase tracking-wider text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Verified
            </span>
          )}
          {accountType && (
            <span className="font-mono text-[8.5px] font-700 uppercase tracking-wider text-[#8d8275]">
              · {accountType.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="mt-1 truncate font-display text-[15px] font-700 text-[#f5ebd6] sm:text-[16px]">
          @{handle}
        </div>
        <div className="mt-3 flex items-baseline gap-5">
          <div>
            <div
              className="font-800 tracking-[-0.02em] text-[#f5ebd6]"
              style={{
                fontFamily: "Outfit, system-ui",
                fontSize: "clamp(22px, 2.5vw, 30px)",
                lineHeight: 1,
              }}
            >
              {primaryStat}
            </div>
            <div className="mt-1 font-mono text-[9.5px] font-700 uppercase tracking-[0.18em] text-[#8d8275]">
              {primaryLabel}
            </div>
          </div>
          {secondaryStat && secondaryLabel && (
            <div>
              <div
                className="font-800 tracking-[-0.02em] text-[#d9c9aa]"
                style={{
                  fontFamily: "Outfit, system-ui",
                  fontSize: "clamp(18px, 2vw, 24px)",
                  lineHeight: 1,
                }}
              >
                {secondaryStat}
              </div>
              <div className="mt-1 font-mono text-[9.5px] font-700 uppercase tracking-[0.18em] text-[#8d8275]">
                {secondaryLabel}
              </div>
            </div>
          )}
        </div>
      </div>

      <ArrowUpRight className="relative h-4 w-4 shrink-0 text-[#a89570] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#f5ebd6]" />
    </a>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 bg-[#0d0c0a] p-5 sm:p-7 md:p-10">
      <Star className="h-4 w-4 text-[#e8825d]" />
      <div
        className="font-800 tracking-[-0.03em] text-[#f5ebd6]"
        style={{
          fontFamily: "Outfit, system-ui",
          fontSize: "clamp(32px, 5vw, 72px)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#8d8275] sm:text-[10.5px] sm:tracking-[0.22em]">
        {label}
      </div>
    </div>
  );
}
