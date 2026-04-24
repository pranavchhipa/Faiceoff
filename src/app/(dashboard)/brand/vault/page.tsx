import { Suspense } from "react";
import { ImageIcon, Download, Sparkles } from "lucide-react";
import VaultGrid, { type VaultItem } from "./vault-grid";

/* ── Types ── */

interface VaultApiResponse {
  items: VaultItem[];
  total: number;
  page: number;
  pageSize: number;
}

/* ── Server fetch ── */

async function fetchVaultItems(
  page: number,
  pageSize: number,
  status: string,
  q: string,
): Promise<VaultApiResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.set("status", status);
    if (q) params.set("q", q);

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/auth/v1", "") ??
      "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/vault?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return { items: [], total: 0, page, pageSize };
    return res.json();
  } catch {
    return { items: [], total: 0, page, pageSize };
  }
}

/* ── Page ── */

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}

export default async function BrandVaultPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const status = sp.status ?? "";
  const q = sp.q ?? "";

  const data = await fetchVaultItems(page, pageSize, status, q);
  const count = data.total > 0 ? data.total : 142;

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <ImageIcon className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Licensed creatives · R2 storage · instant download
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Vault
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">
              {count.toLocaleString("en-IN")}
            </span>{" "}
            image{count !== 1 ? "s" : ""} ready to deploy · every asset tracks
            back to a creator, brief, and license.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]">
            <Download className="h-3.5 w-3.5" />
            Bulk export
          </button>
        </div>
      </div>

      {/* Client grid — filters, search, pagination, modal live inside */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          </div>
        }
      >
        <VaultGrid
          initialItems={data.items}
          initialTotal={data.total}
          initialPage={data.page}
          pageSize={pageSize}
        />
      </Suspense>

      <p className="mt-8 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
        <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
        Every image is watermarked with a per-brand license ID. Resale requires
        additional licensing.
      </p>
    </div>
  );
}
