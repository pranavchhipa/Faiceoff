// ─────────────────────────────────────────────────────────────────────────────
// /brand/credits — credit pack purchase page (server component)
// Task E21 — Chunk E
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import { getActivePacks } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CreditsPackGrid } from "./credits-pack-grid";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PackGridSkeleton() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--color-neutral-200)]" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-full bg-[var(--color-neutral-100)]" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]"
          />
        ))}
      </div>
    </div>
  );
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function CreditsPageInner() {
  // Fetch packs + current credits balance in parallel
  const [packs, creditsRemaining] = await Promise.all([
    getActivePacks().catch(() => []),
    (async () => {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = createAdminClient() as any;
        const { data: brand } = await admin
          .from("brands")
          .select("credits_remaining")
          .eq("user_id", user.id)
          .maybeSingle();

        return (brand?.credits_remaining as number | null) ?? 0;
      } catch {
        return 0;
      }
    })(),
  ]);

  return <CreditsPackGrid packs={packs} creditsRemaining={creditsRemaining} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditsPage() {
  return (
    <div className="max-w-7xl">
      <Suspense fallback={<PackGridSkeleton />}>
        <CreditsPageInner />
      </Suspense>
    </div>
  );
}

export const dynamic = "force-dynamic";
