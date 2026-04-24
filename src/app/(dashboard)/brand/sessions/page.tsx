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
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Loader2,
  Plus,
  Sparkles,
  XCircle,
  Megaphone,
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
  classes: string;
} {
  switch (status) {
    case "pending":
    case "processing":
      return {
        label: "Generating",
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        classes: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
      };
    case "awaiting_approval":
      return {
        label: "Awaiting",
        icon: <Hourglass className="h-3 w-3" />,
        classes: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
      };
    case "approved":
      return {
        label: "Approved",
        icon: <CheckCircle2 className="h-3 w-3" />,
        classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
      };
    case "rejected":
      return {
        label: "Rejected",
        icon: <XCircle className="h-3 w-3" />,
        classes: "bg-rose-500/15 text-rose-500 dark:text-rose-300",
      };
    case "failed":
      return {
        label: "Failed",
        icon: <XCircle className="h-3 w-3" />,
        classes: "bg-rose-500/15 text-rose-500 dark:text-rose-300",
      };
    case "needs_admin_review":
      return {
        label: "Under review",
        icon: <AlertCircle className="h-3 w-3" />,
        classes: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
      };
    default:
      return {
        label: status,
        icon: <Sparkles className="h-3 w-3" />,
        classes: "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
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

  const creatorIds = Array.from(
    new Set(
      ((gens ?? []) as Array<{ creator_id: string }>).map((g) => g.creator_id),
    ),
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

  const rows: SessionRow[] = (
    (gens ?? []) as Array<{
      id: string;
      status: string;
      image_url: string | null;
      cost_paise: number | null;
      created_at: string;
      structured_brief: Record<string, unknown> | null;
      creator_id: string;
    }>
  ).map((g) => {
    const brief = g.structured_brief ?? {};
    const product = (brief.product as string | undefined)?.trim() ?? "";
    const scene = (brief.scene as string | undefined)?.trim() ?? "";
    const summary =
      [product, scene].filter(Boolean).join(" · ") || "Untitled brief";
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
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Megaphone className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Every generation audit-logged · refundable if stuck
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Sessions
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            {total === 0
              ? "Your generations will appear here the moment they queue up."
              : (
                <>
                  <span className="font-600 text-[var(--color-foreground)]">
                    {total.toLocaleString("en-IN")}
                  </span>{" "}
                  total · showing {from + 1}–{Math.min(from + PAGE_SIZE, total)}
                </>
              )}
          </p>
        </div>
        <Link
          href="/brand/discover"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          New generation
        </Link>
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10">
            <Sparkles className="h-6 w-6 text-[var(--color-primary)]" />
          </div>
          <h3 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
            No sessions yet.
          </h3>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--color-muted-foreground)]">
            Browse creators, pick a niche, and launch your first generation.
            Delivery averages 47s.
          </p>
          <Link
            href="/brand/discover"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            <Plus className="h-4 w-4" />
            Browse creators
          </Link>
        </div>
      )}

      {/* ═══════════ Grid ═══════════ */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((s) => {
              const meta = statusMeta(s.status);
              return (
                <Link
                  key={s.id}
                  href={`/brand/sessions/${s.id}`}
                  className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-18px_rgba(201,169,110,0.4)]"
                >
                  {/* Preview */}
                  <div className="relative aspect-square bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-muted)]">
                    {s.image_url ? (
                      <Image
                        src={s.image_url}
                        alt={s.brief_summary}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        {s.status === "pending" || s.status === "processing" ? (
                          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-muted-foreground)]" />
                        ) : (
                          <Sparkles className="h-8 w-8 text-[var(--color-muted-foreground)]/50" />
                        )}
                      </div>
                    )}
                    <span
                      className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider backdrop-blur-md ${meta.classes}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="space-y-1.5 p-4">
                    <p className="line-clamp-2 min-h-[2.5rem] text-[13px] font-600 text-[var(--color-foreground)]">
                      {s.brief_summary}
                    </p>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="truncate text-[var(--color-muted-foreground)]">
                        {s.creator_name}
                      </span>
                      <span className="shrink-0 font-mono font-700 text-[var(--color-primary)]">
                        {formatINR(s.cost_paise)}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
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
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Link>
              )}
              <span className="font-mono text-[11px] font-600 text-[var(--color-muted-foreground)]">
                Page {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/brand/sessions?page=${page + 1}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
