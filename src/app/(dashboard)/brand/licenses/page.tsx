import { Suspense } from "react";
import LicensesList, { type LicenseItem } from "./licenses-list";

/* ── Types ── */

interface LicensesApiResponse {
  items: LicenseItem[];
  total: number;
  page: number;
  pageSize: number;
}

/* ── Server fetch ── */

async function fetchLicenses(
  page: number,
  pageSize: number,
  status: string
): Promise<LicensesApiResponse> {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set("status", status);

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/auth/v1", "") ??
      "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/licenses/list?${params}`, {
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
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function BrandLicensesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 20;
  const status = sp.status ?? "";

  const data = await fetchLicenses(page, pageSize, status);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-ink)]">
          Your licenses
        </h1>
        <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
          {data.total} license{data.total !== 1 ? "s" : ""} — 12-month terms, automatically tracked.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-200)] border-t-[var(--color-accent-gold)]" />
          </div>
        }
      >
        <LicensesList
          initialItems={data.items}
          initialTotal={data.total}
          initialPage={data.page}
          pageSize={pageSize}
        />
      </Suspense>
    </div>
  );
}
