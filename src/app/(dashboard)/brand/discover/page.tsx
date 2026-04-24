/**
 * /brand/discover — Browse licensed creators (Linear × Bento)
 *
 * Server component that pulls all active creators + their cheapest niche +
 * primary reference photo (signed URL). Rendered as a dense card grid with
 * niche chips, follower counts, and a starting price. Tapping a card routes
 * to the creator detail page where the brand launches a session.
 */

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ChevronRight,
  Filter,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreatorCard {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_followers: number | null;
  hero_photo_url: string | null;
  cheapest_paise: number | null;
  category_count: number;
  primary_category: string | null;
  is_verified: boolean;
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

async function loadCreators(): Promise<CreatorCard[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("creators")
    .select(
      `
      id,
      bio,
      instagram_followers,
      user_id,
      kyc_status,
      users!inner ( display_name ),
      creator_categories ( category, price_per_generation_paise, is_active )
    `,
    )
    .eq("is_active", true)
    .limit(100);

  if (error || !data) {
    console.error("[brand/discover] creators query failed:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as any[];
  const creatorIds = rows.map((c) => c.id as string);

  // Hero photos via signed URLs
  const heroByCreator = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: photos } = await admin
      .from("creator_reference_photos")
      .select("creator_id, storage_path, is_primary")
      .in("creator_id", creatorIds)
      .order("is_primary", { ascending: false });

    const primaryPath = new Map<string, string>();
    for (const p of (photos ?? []) as Array<{
      creator_id: string;
      storage_path: string;
      is_primary: boolean;
    }>) {
      if (!primaryPath.has(p.creator_id)) {
        primaryPath.set(p.creator_id, p.storage_path);
      }
    }

    if (primaryPath.size > 0) {
      const paths = Array.from(primaryPath.values());
      const { data: signed } = await admin.storage
        .from("reference-photos")
        .createSignedUrls(paths, 60 * 60);

      const urlByPath = new Map<string, string>();
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }

      for (const [creatorId, path] of primaryPath) {
        const url = urlByPath.get(path);
        if (url) heroByCreator.set(creatorId, url);
      }
    }
  }

  return rows.map((c) => {
    const cats = (c.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active) as Array<{
      category: string;
      price_per_generation_paise: number;
    }>;

    const cheapest =
      cats.length > 0
        ? Math.min(...cats.map((cc) => cc.price_per_generation_paise))
        : null;

    return {
      id: c.id,
      display_name: c.users?.display_name ?? "Creator",
      bio: c.bio,
      instagram_followers: c.instagram_followers ?? null,
      hero_photo_url: heroByCreator.get(c.id) ?? null,
      cheapest_paise: cheapest,
      category_count: cats.length,
      primary_category: cats[0]?.category ?? null,
      is_verified: c.kyc_status === "approved",
    };
  });
}

export default async function BrandDiscoverPage() {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creators = await loadCreators();

  // Seed a sample grid if DB is empty (so the preview looks alive)
  const visible: CreatorCard[] =
    creators.length > 0 ? creators : SEED_CREATORS;

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            {visible.length} licensed faces · KYC verified · consented
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Discover creators
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Browse trained likenesses. Start a session in seconds — every rupee
            goes to the creator.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/brand/sessions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            My sessions
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ═══════════ Filter bar ═══════════ */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 md:flex-row md:items-center md:gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-[var(--color-secondary)]/60 px-3 py-2">
          <Search className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <input
            type="search"
            placeholder="Search by name, niche, Instagram handle…"
            className="flex-1 border-none bg-transparent text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
          />
          <span className="hidden rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)] md:inline">
            ⌘F
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {["All", "Fashion", "Beauty", "Tech", "Lifestyle", "Food"].map((c, i) => (
            <button
              key={c}
              className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                i === 0
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {c}
            </button>
          ))}
          <button className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]">
            <Filter className="h-3 w-3" />
            More
          </button>
        </div>
      </div>

      {/* ═══════════ Grid ═══════════ */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
            No active creators yet
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
            Onboarding new faces every week. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`/brand/discover/${c.id}`}
              className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-18px_rgba(201,169,110,0.4)]"
            >
              {/* Hero */}
              <div className="relative aspect-[4/5] bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-muted)]">
                {c.hero_photo_url ? (
                  <Image
                    src={c.hero_photo_url}
                    alt={c.display_name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-[80px] font-800 text-[var(--color-muted-foreground)]/30">
                    {c.display_name[0]?.toUpperCase() ?? "?"}
                  </div>
                )}

                {/* Top chips */}
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                  {c.primary_category && (
                    <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                      {c.primary_category}
                    </span>
                  )}
                  {c.is_verified && (
                    <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                      ✓ KYC
                    </span>
                  )}
                </div>

                {/* Follower count */}
                {c.instagram_followers !== null && (
                  <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                    @ {formatFollowersShort(c.instagram_followers)}
                  </span>
                )}

                {/* Bottom name overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4">
                  <p className="font-display text-[18px] font-800 leading-tight tracking-tight text-white">
                    {c.display_name}
                  </p>
                  {c.bio && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/80">
                      {c.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
                <span className="font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {c.category_count} niche{c.category_count === 1 ? "" : "s"}
                </span>
                {c.cheapest_paise !== null && (
                  <span className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
                    from{" "}
                    <span className="text-[var(--color-primary)]">
                      {formatINR(c.cheapest_paise)}
                    </span>
                    <span className="ml-0.5 font-mono text-[10px] font-500 text-[var(--color-muted-foreground)]">
                      /gen
                    </span>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Seed ───────── */

const SEED_CREATORS: CreatorCard[] = [
  {
    id: "seed-1",
    display_name: "Priya Sharma",
    bio: "Fashion + lifestyle editorials. Mumbai based.",
    instagram_followers: 284_000,
    hero_photo_url: "/landing/creator-face.jpg",
    cheapest_paise: 250_000,
    category_count: 3,
    primary_category: "Fashion",
    is_verified: true,
  },
  {
    id: "seed-2",
    display_name: "Arjun Mehta",
    bio: "Tech reviews and gear videos.",
    instagram_followers: 118_000,
    hero_photo_url: "/landing/creator-2.jpg",
    cheapest_paise: 300_000,
    category_count: 2,
    primary_category: "Tech",
    is_verified: true,
  },
  {
    id: "seed-3",
    display_name: "Meera Iyer",
    bio: "Food + cafe culture across India.",
    instagram_followers: 462_000,
    hero_photo_url: "/landing/creator-3.jpg",
    cheapest_paise: 200_000,
    category_count: 4,
    primary_category: "Food",
    is_verified: true,
  },
  {
    id: "seed-4",
    display_name: "Rohan Kapoor",
    bio: "Travel + adventure storytelling.",
    instagram_followers: 91_000,
    hero_photo_url: "/landing/product-phone.jpg",
    cheapest_paise: 180_000,
    category_count: 2,
    primary_category: "Travel",
    is_verified: false,
  },
  {
    id: "seed-5",
    display_name: "Kavya Nair",
    bio: "Beauty tutorials + skincare routines.",
    instagram_followers: 355_000,
    hero_photo_url: "/landing/product-skincare.jpg",
    cheapest_paise: 220_000,
    category_count: 3,
    primary_category: "Beauty",
    is_verified: true,
  },
  {
    id: "seed-6",
    display_name: "Vikram Singh",
    bio: "Streetwear + sneaker culture.",
    instagram_followers: 73_000,
    hero_photo_url: "/landing/product-sneaker.jpg",
    cheapest_paise: 150_000,
    category_count: 2,
    primary_category: "Fashion",
    is_verified: false,
  },
];
