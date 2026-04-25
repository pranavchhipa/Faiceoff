import { Suspense } from "react";
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
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6 sm:mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-foreground)]">
          Your generation
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)] font-mono">
          {id.slice(0, 8)}…
        </p>
      </div>

      {/* Client poller */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          </div>
        }
      >
        <SessionPoller
          generationId={id}
          initialStatus={initialStatus}
        />
      </Suspense>
    </div>
  );
}
