import { Suspense } from "react";
import { motion } from "framer-motion";
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
  q: string
): Promise<VaultApiResponse> {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set("status", status);
    if (q) params.set("q", q);

    // Server-side: use absolute URL (falls back to relative for client)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/auth/v1", "") ?? "http://localhost:3000";
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

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-ink)]">
          Your vault
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          {data.total} licensed image{data.total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Client grid handles filters, search, pagination, modal */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-200)] border-t-[var(--color-accent-gold)]" />
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
    </div>
  );
}
