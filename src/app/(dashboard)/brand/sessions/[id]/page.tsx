import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SessionPoller from "./session-poller";

/* ── Types ── */

interface GenerationStatus {
  id: string;
  status: string;
  image_url: string | null;
  structured_brief: Record<string, string> | null;
  assembled_prompt: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Server fetch ── */

async function fetchGeneration(id: string): Promise<GenerationStatus | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/auth/v1", "") ??
      "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/generations/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const g = data.generation;
    return {
      id: g.id,
      status: g.status,
      image_url: g.image_url ?? null,
      structured_brief: g.structured_brief ?? null,
      assembled_prompt: g.assembled_prompt ?? null,
      created_at: g.created_at,
      updated_at: g.updated_at,
    };
  } catch {
    return null;
  }
}

/* ── Page ── */

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BrandSessionPage({ params }: PageProps) {
  const { id } = await params;
  const initialStatus = await fetchGeneration(id);

  return (
    <div className="w-full max-w-6xl">
      {/* Compact header — left-aligned, breadcrumb style */}
      <div className="mb-5 flex items-center gap-3 sm:mb-6">
        <Link
          href="/brand/sessions"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
          aria-label="Back to sessions"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-700 leading-tight tracking-tight text-[var(--color-foreground)] sm:text-xl">
            Generation session
          </h1>
          <p className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)] sm:text-xs">
            {id}
          </p>
        </div>
      </div>

      {/* Client poller */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          </div>
        }
      >
        <SessionPoller generationId={id} initialStatus={initialStatus} />
      </Suspense>
    </div>
  );
}
