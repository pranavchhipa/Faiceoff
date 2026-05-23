import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { DEMO_CATEGORIES } from "@/lib/profile/demo-prompts";
import type { PublicCreatorCard } from "@/lib/profile/public-creators";

function compact(n: number | null): string | null {
  if (n === null || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/**
 * CreatorCard — directory/category grid tile. Dark editorial to match the
 * public profile aesthetic. Links to /creators/<slug>.
 */
export function CreatorCard({ c }: { c: PublicCreatorCard }) {
  const followers = compact(c.followers);
  const cover = c.cover_image_url ?? c.avatar_url;

  return (
    <Link
      href={`/creators/${c.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-sm border border-[#2a2520] bg-[#0d0c0a] transition hover:border-[#3a3530]"
    >
      {/* Cover */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[#1a1612]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`${c.display_name} — AI creator on Faiceoff`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-800 text-[#3a3530]">
            {c.display_name[0]?.toUpperCase()}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Badges */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {c.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[8.5px] font-700 uppercase tracking-wider text-emerald-300 backdrop-blur-md ring-1 ring-white/10">
              <CheckCircle2 className="h-2.5 w-2.5" /> Verified
            </span>
          )}
          {c.is_live && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[8.5px] font-700 uppercase tracking-wider text-white backdrop-blur-md ring-1 ring-white/10">
              <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" /> Open
            </span>
          )}
        </div>

        {/* Name + meta over the gradient */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="font-display text-[16px] font-800 leading-tight tracking-tight text-[#f5ebd6]">
            {c.display_name}
          </div>
          {followers && (
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[#d9c9aa]">
              {followers} followers
            </div>
          )}
        </div>
      </div>

      {/* Category chips */}
      {c.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2.5">
          {c.categories.slice(0, 3).map((key) => {
            const def = DEMO_CATEGORIES[key];
            if (!def) return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-[#2a2520] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#a89570]"
              >
                {def.emoji} {def.label.split(" & ")[0]}
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
}
