/**
 * /brand/sessions — Brand session (generation) history
 *
 * Server-component list of every generation the brand has launched. Newest
 * first, paginated 24 per page. Each card shows status pill, creator name,
 * brief preview, and links to /brand/sessions/[id].
 */

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  Plus,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Hourglass,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 24;

type GenerationStatus =
  | "pending"
  | "processing"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "needs_admin_review";

interface SessionRow {
  id: string;
  status: GenerationStatus | string;
  image_url: string | null;
  cost_paise: number | null;
  created_at: string;
  brief_summary: string;
  creator_name: string;
}

function formatINR(paise: number | null): string {
  if (paise === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusMeta(status: string): {
  label: string;
  icon: React.ReactNode;
  bg: string;
  fg: string;
} {
  switch (status) {
    case "pending":
    case "processing":
      return {
        label: "Generating",
        icon: <Loader2 className="size-3 animate-spin" />,
        bg: "var(--color-lilac)",
        fg: "var(--color-ink)",
      };
    case "awaiting_approval":
      return {
        label: "Awaiting approval",
        icon: <Hourglass className="size-3" />,
        bg: "var(--color-ocean)",
        fg: "var(--color-ink)",
      };
    case "approved":
      return {
        label: "Approved",
        icon: <CheckCircle2 className="size-3" />,
        bg: "var(--color-mint)",
        fg: "#15803d",
      };
    case "rejected":
      return {
        label: "Rejected",
        icon: <XCircle className="size-3" />,
        bg: "var(--color-blush)",
        fg: "#b91c1c",
      };
    case "failed":
      return {
        label: "Failed",
        icon: <XCircle className="size-3" />,
        bg: "var(--color-blush)",
        fg: "#b91c1c",
      };
    case "needs_admin_review":
      return {
        label: "Under review",
        icon: <AlertCircle className="size-3" />,
        bg: "var(--color-blush)",
        fg: "#b45309",
      };
    default:
      return {
        label: status,
        icon: <Sparkles className="size-3" />,
        bg: "var(--color-neutral-100)",
        fg: "var(--color-neutral-500)",
      };
  }
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function BrandSessionsPage({ searchParams }: PageProps) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brand) redirect("/brand-setup");

  // ── Pagination ─────────────────────────────────────────────────────────────
  const sp = await searchParams;
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // ── Fetch generations ──────────────────────────────────────────────────────
  const { data: gens, count } = await admin
    .from("generations")
    .select(
      "id, status, image_url, cost_paise, created_at, structured_brief, creator_id",
      { count: "exact" },
    )
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  const total = (count as number | null) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Resolve creator display names in one batch
  const creatorIds = Array.from(
    new Set(((gens ?? []) as Array<{ creator_id: string }>).map((g) => g.creator_id)),
  );

  const nameByCreator = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: cRows } = await admin
      .from("creators")
      .select("id, users!inner ( display_name )")
      .in("id", creatorIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cRows ?? []) as any[]) {
      nameByCreator.set(c.id as string, c.users?.display_name ?? "Creator");
    }
  }

  const rows: SessionRow[] = ((gens ?? []) as Array<{
    id: string;
    status: string;
    image_url: string | null;
    cost_paise: number | null;
    created_at: string;
    structured_brief: Record<string, unknown> | null;
    creator_id: string;
  }>).map((g) => {
    const brief = g.structured_brief ?? {};
    const product = (brief.product as string | undefined)?.trim() ?? "";
    const scene = (brief.scene as string | undefined)?.trim() ?? "";
    const summary = [product, scene].filter(Boolean).join(" · ") || "Untitled brief";
    return {
      id: g.id,
      status: g.status,
      image_url: g.image_url,
      cost_paise: g.cost_paise,
      created_at: g.created_at,
      brief_summary: summary,
      creator_name: nameByCreator.get(g.creator_id) ?? "Creator",
    };
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-ink)]">
            Sessions
          </h1>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            {total === 0
              ? "Your generations will appear here."
              : `${total} total · showing ${from + 1}–${Math.min(from + PAGE_SIZE, total)}`}
          </p>
        </div>
        <Link
          href="/brand/discover"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-4 py-2.5 text-sm font-600 text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" />
          New generation
        </Link>
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-white p-12 text-center">
          <Sparkles className="mx-auto mb-3 size-10 text-[var(--color-neutral-400)]" />
          <p className="text-base font-700 text-[var(--color-ink)]">
            No sessions yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            Browse creators and launch your first generation.
          </p>
          <Link
            href="/brand/discover"
            className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-4 py-2.5 text-sm font-600 text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" />
            Browse creators
          </Link>
        </div>
      )}

      {/* Grid */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((s) => {
              const meta = statusMeta(s.status);
              return (
                <Link
                  key={s.id}
                  href={`/brand/sessions/${s.id}`}
                  className="group rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/15 bg-white overflow-hidden hover:border-[var(--color-outline-variant)]/35 hover:shadow-[var(--shadow-card)] transition-all"
                >
                  {/* Preview */}
                  <div className="relative aspect-square bg-[var(--color-neutral-100)]">
                    {s.image_url ? (
                      <Image
                        src={s.image_url}
                        alt={s.brief_summary}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {s.status === "pending" || s.status === "processing" ? (
                          <Loader2 className="size-8 animate-spin text-[var(--color-neutral-400)]" />
                        ) : (
                          <Sparkles className="size-8 text-[var(--color-neutral-400)]" />
                        )}
                      </div>
                    )}
                    <span
                      className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider"
                      style={{ backgroundColor: meta.bg, color: meta.fg }}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-1.5">
                    <p className="text-sm font-600 text-[var(--color-ink)] line-clamp-2 min-h-[2.5rem]">
                      {s.brief_summary}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--color-neutral-500)] truncate">
                        {s.creator_name}
                      </span>
                      <span className="shrink-0 font-600 text-[var(--color-ink)]">
                        {formatINR(s.cost_paise)}
                      </span>
                    </div>
                    <p className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-500)]">
                      {formatRelative(s.created_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={`/brand/sessions?page=${page - 1}`}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-outline-variant)]/25 bg-white px-3 py-2 text-xs font-600 text-[var(--color-ink)] hover:border-[var(--color-outline-variant)]/45 transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  Prev
                </Link>
              )}
              <span className="text-xs font-600 text-[var(--color-neutral-500)]">
                Page {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/brand/sessions?page=${page + 1}`}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-outline-variant)]/25 bg-white px-3 py-2 text-xs font-600 text-[var(--color-ink)] hover:border-[var(--color-outline-variant)]/45 transition-colors"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
