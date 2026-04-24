"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Search,
  Download,
  FileText,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── Types ── */

export interface VaultItem {
  id: string;
  generation_id: string;
  image_url: string | null;
  brief: Record<string, string> | null;
  status: string;
  created_at: string;
  license_id: string | null;
  download_count_jsonb: Record<string, number> | null;
  creator_name: string | null;
}

interface VaultGridProps {
  initialItems: VaultItem[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
}

/* ── Helpers ── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Approved", value: "approved" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
] as const;

const statusPillColors: Record<string, string> = {
  approved: "bg-[var(--color-mint)] text-green-700",
  pending: "bg-[var(--color-lilac)] text-[var(--color-ink)]",
  rejected: "bg-[var(--color-blush)] text-red-700",
  ready_for_approval: "bg-[var(--color-lilac)] text-[var(--color-ink)]",
  generating: "bg-[var(--color-ocean)] text-[var(--color-ink)]",
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    ready_for_approval: "Awaiting Approval",
    generating: "Generating",
    compliance_check: "Compliance Check",
    output_check: "Output Check",
    draft: "Draft",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

function triggerDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── Modal ── */

function VaultItemModal({
  item,
  open,
  onClose,
}: {
  item: VaultItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;

  const brief = item.brief ?? {};

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-[var(--radius-card)] border-[var(--color-neutral-200)] p-0 overflow-hidden">
        {/* Image */}
        <div className="relative bg-[var(--color-neutral-100)] w-full h-72 sm:h-96 overflow-hidden">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt="Licensed generation"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ImageIcon className="size-16 text-[var(--color-neutral-300)]" />
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-700 text-[var(--color-ink)]">
              Licensed Image
            </DialogTitle>
          </DialogHeader>

          {/* Brief details */}
          <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
            {brief.product_name && (
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Product</p>
                <p className="font-600 text-[var(--color-ink)]">{brief.product_name}</p>
              </div>
            )}
            {item.creator_name && (
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Creator</p>
                <p className="font-600 text-[var(--color-ink)]">{item.creator_name}</p>
              </div>
            )}
            {brief.scene && (
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Scene</p>
                <p className="text-[var(--color-ink)]">{brief.scene}</p>
              </div>
            )}
            {brief.mood && (
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Mood</p>
                <p className="text-[var(--color-ink)]">{brief.mood}</p>
              </div>
            )}
            {brief.scope && (
              <div>
                <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Scope</p>
                <p className="text-[var(--color-ink)]">{brief.scope}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Status</p>
              <span className={`inline-flex rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-600 ${statusPillColors[item.status] ?? "bg-[var(--color-neutral-100)] text-[var(--color-ink)]"}`}>
                {statusLabel(item.status)}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-0.5">Created</p>
              <p className="text-[var(--color-ink)]">{formatDate(item.created_at)}</p>
            </div>
          </div>

          {/* Download buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              onClick={() => triggerDownload(`/api/vault/${item.id}/download?format=original`)}
              className="rounded-[var(--radius-button)] bg-[var(--color-ink)] font-600 text-white hover:opacity-80 text-xs"
            >
              <Download className="size-3.5" />
              Original (ZIP)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerDownload(`/api/vault/${item.id}/download?format=pdf`)}
              className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] text-xs"
            >
              <FileText className="size-3.5" />
              PDF Package
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerDownload(`/api/vault/${item.id}/download?format=docx`)}
              className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] text-xs"
            >
              <FileText className="size-3.5" />
              DOCX Report
            </Button>
          </div>

          {/* View license */}
          {item.license_id && (
            <Link
              href={`/brand/licenses/${item.license_id}`}
              className="inline-flex items-center gap-1.5 text-sm font-600 text-[var(--color-accent-gold)] hover:underline"
              onClick={onClose}
            >
              <ExternalLink className="size-3.5" />
              View License
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Component ── */

export default function VaultGrid({
  initialItems,
  initialTotal,
  initialPage,
  pageSize,
}: VaultGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<VaultItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Search
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active filter
  const activeStatus = searchParams.get("status") ?? "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ── Fetch ── */
  const fetchVault = useCallback(
    async (p: number, status: string, q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        const res = await fetch(`/api/vault?${params}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setPage(data.page ?? 1);
        }
      } catch (err) {
        console.error("Vault fetch error:", err);
      }
      setLoading(false);
    },
    [pageSize]
  );

  /* ── Filter pill click → update URL + refetch ── */
  function handleFilterChange(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (status) params.set("status", status);
    else params.delete("status");
    router.push(`?${params.toString()}`);
    fetchVault(1, status, searchValue);
  }

  /* ── Debounced search ── */
  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      if (value) params.set("q", value);
      else params.delete("q");
      router.push(`?${params.toString()}`);
      fetchVault(1, activeStatus, value);
    }, 300);
  }

  /* ── Pagination ── */
  function handlePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
    fetchVault(newPage, activeStatus, searchValue);
  }

  return (
    <div>
      {/* Filter pills + search row */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-[var(--color-neutral-200)] py-3 mb-6 -mx-5 px-5 lg:-mx-8 lg:px-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-600 transition-all ${
                activeStatus === f.value
                  ? "bg-[var(--color-ink)] text-white shadow-sm"
                  : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-neutral-400)]" />
          <Input
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search images..."
            className="rounded-[var(--radius-pill)] pl-9 pr-9 h-9 text-sm border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] focus:border-[var(--color-accent-gold)] focus:ring-[var(--color-accent-gold)]/20"
          />
          {searchValue && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)] hover:text-[var(--color-ink)]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-200)] border-t-[var(--color-accent-gold)]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="mb-5 flex size-20 items-center justify-center rounded-full bg-[var(--color-ocean)]">
            <ImageIcon className="size-8 text-[var(--color-ink)]" />
          </div>
          <h3 className="text-lg font-700 text-[var(--color-ink)] mb-2">
            {searchValue || activeStatus ? "No images found" : "Your vault is empty"}
          </h3>
          <p className="text-sm text-[var(--color-neutral-500)] max-w-sm mb-5">
            {searchValue || activeStatus
              ? "Try adjusting your search or filters."
              : "Your generated images will appear here. Generate your first image to get started."}
          </p>
          {!searchValue && !activeStatus && (
            <Link href="/brand/discover">
              <Button className="rounded-[var(--radius-button)] bg-[var(--color-ink)] font-600 text-white hover:opacity-80">
                Discover creators &amp; generate →
              </Button>
            </Link>
          )}
        </motion.div>
      )}

      {/* Grid */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="group relative aspect-square cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] shadow-[var(--shadow-soft)]"
                onClick={() => {
                  setSelectedItem(item);
                  setModalOpen(true);
                }}
              >
                {/* Image */}
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.brief?.product_name ?? "Licensed generation"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="size-10 text-[var(--color-neutral-300)]" />
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col justify-between p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-t from-black/70 via-transparent to-transparent">
                  {/* Top: status pill */}
                  <div className="flex justify-end">
                    <span
                      className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-700 ${
                        statusPillColors[item.status] ?? "bg-white/20 text-white"
                      }`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  {/* Bottom: creator + actions */}
                  <div>
                    {item.creator_name && (
                      <p className="text-xs font-600 text-white/90 mb-2 truncate">
                        {item.creator_name}
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        className="flex items-center gap-1 rounded-md bg-white/20 px-2 py-1 text-[10px] font-600 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerDownload(`/api/vault/${item.id}/download?format=original`);
                        }}
                      >
                        <Download className="size-3" />
                        Download
                      </button>
                      {item.license_id && (
                        <Link
                          href={`/brand/licenses/${item.license_id}`}
                          className="flex items-center gap-1 rounded-md bg-white/20 px-2 py-1 text-[10px] font-600 text-white backdrop-blur-sm hover:bg-white/30 transition-colors no-underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="size-3" />
                          License
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePage(page - 1)}
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-sm font-600 text-[var(--color-neutral-500)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => handlePage(page + 1)}
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Modal */}
      <VaultItemModal
        item={selectedItem}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedItem(null);
        }}
      />
    </div>
  );
}
