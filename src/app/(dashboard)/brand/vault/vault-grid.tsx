"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Check,
  CheckCircle2,
  Loader2,
  Square,
  CheckSquare,
  Calendar,
  User,
  ShieldCheck,
  Package,
  Sparkles,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

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

function statusBadgeClass(status: string): string {
  if (status === "approved") {
    return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
  }
  if (status === "rejected") {
    return "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30";
  }
  if (
    status === "ready_for_approval" ||
    status === "ready_for_brand_review" ||
    status === "pending"
  ) {
    return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30";
  }
  return "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] ring-1 ring-[var(--color-border)]";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    ready_for_approval: "Awaiting creator",
    ready_for_brand_review: "Your review",
    generating: "Generating",
    compliance_check: "Compliance check",
    output_check: "Quality check",
    draft: "Draft",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

async function downloadBlob(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch {
    // Fallback: open in new tab so user can right-click save
    window.open(url, "_blank");
  }
}

/* ─────────────────── Lightbox modal ─────────────────── */

function VaultLightbox({
  item,
  open,
  onClose,
}: {
  item: VaultItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!item) return null;

  const brief = item.brief ?? {};

  async function handleDownload(format: "original" | "pdf" | "docx") {
    if (!item) return;
    setDownloading(format);
    try {
      const url = `/api/vault/${item.id}/download?format=${format}`;
      await downloadBlob(
        url,
        `faiceoff-${item.id}.${format === "original" ? "zip" : format}`,
      );
    } finally {
      setDownloading(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative grid w-full max-w-[1100px] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl md:grid-cols-[1.4fr_1fr]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Image */}
            <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--color-secondary)] md:aspect-auto md:min-h-[560px]">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async"
                  src={item.image_url}
                  alt={brief.product_name ?? "Licensed generation"}
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImageIcon className="size-16 text-[var(--color-muted-foreground)]" />
              )}

              {/* Status chip overlay */}
              <span
                className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-700 backdrop-blur-md ${statusBadgeClass(item.status)}`}
              >
                {item.status === "approved" && (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {statusLabel(item.status)}
              </span>
            </div>

            {/* Sidebar */}
            <div className="flex max-h-[80vh] flex-col overflow-y-auto p-5 sm:p-6">
              <div className="mb-4">
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                  Licensed asset · {formatDate(item.created_at)}
                </p>
                <h3 className="mt-1 font-display text-[22px] font-800 leading-tight tracking-tight text-[var(--color-foreground)]">
                  {brief.product_name ?? "Licensed image"}
                </h3>
                {item.creator_name && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                    <User className="h-3 w-3" />
                    With{" "}
                    <span className="font-700 text-[var(--color-foreground)]">
                      {item.creator_name}
                    </span>
                  </p>
                )}
              </div>

              {/* Brief details */}
              <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4 text-[13px]">
                <DetailRow icon={Package} label="Product" value={brief.product_name} />
                <DetailRow icon={Sparkles} label="Scene" value={brief.scene} />
                <DetailRow icon={Sparkles} label="Mood" value={brief.mood} />
                <DetailRow icon={ShieldCheck} label="Scope" value={brief.scope} />
                <DetailRow icon={Calendar} label="Issued" value={formatDate(item.created_at)} />
              </div>

              {/* Download buttons */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload("original")}
                  disabled={!!downloading}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "original" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download pack (ZIP + cert)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload("pdf")}
                    disabled={!!downloading}
                    className="flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:opacity-50"
                  >
                    {downloading === "pdf" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    PDF report
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload("docx")}
                    disabled={!!downloading}
                    className="flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:opacity-50"
                  >
                    {downloading === "docx" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    DOCX report
                  </button>
                </div>
              </div>

              {/* License link */}
              {item.license_id && (
                <Link
                  href={`/brand/licenses/${item.license_id}`}
                  onClick={onClose}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 px-3 py-2 text-[12px] font-700 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/12"
                >
                  <ExternalLink className="h-3 w-3" />
                  View licence certificate
                </Link>
              )}

              <p className="mt-auto pt-4 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                ID · {item.id.slice(0, 8)}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | undefined | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-right text-[12px] font-600 text-[var(--color-foreground)]">
        {value}
      </span>
    </div>
  );
}

/* ─────────────────── Main grid ─────────────────── */

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

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const activeStatus = searchParams.get("status") ?? "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ── Fetch ── */
  const fetchVault = useCallback(
    async (p: number, status: string, q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(pageSize),
        });
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
    [pageSize],
  );

  /* ── Filter pill click ── */
  function handleFilterChange(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (status) params.set("status", status);
    else params.delete("status");
    router.push(`?${params.toString()}`);
    fetchVault(1, status, searchValue);
    setSelectedIds(new Set());
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
    setSelectedIds(new Set());
  }

  /* ── Selection ── */
  function toggleSelect(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(items.filter((i) => i.image_url).map((i) => i.id)));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDownload() {
    if (selectedIds.size === 0) {
      toast.error("Select at least one image");
      return;
    }
    setBulkDownloading(true);
    try {
      const res = await fetch("/api/vault/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Bulk download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faiceoff-vault-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selectedIds.size} image${selectedIds.size !== 1 ? "s" : ""}`);
      exitSelectMode();
    } catch (err) {
      console.error("[bulk download]", err);
      toast.error("Bulk download failed");
    } finally {
      setBulkDownloading(false);
    }
  }

  // ── Status counts (visual hint, derived from current page only) ─────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
    return counts;
  }, [items]);

  return (
    <div>
      {/* ═══ Toolbar: filters + search + select-mode ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-10 mb-5 flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/90 p-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between"
      >
        {/* Filter pills */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {STATUS_FILTERS.map((f) => {
            const active = activeStatus === f.value;
            const count = f.value ? statusCounts[f.value] : items.length;
            return (
              <button
                key={f.value}
                onClick={() => handleFilterChange(f.value)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-all ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_2px_8px_-2px_rgba(201,169,110,0.45)]"
                    : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]/70 hover:text-[var(--color-foreground)]"
                }`}
              >
                {f.label}
                {count != null && count > 0 && (
                  <span
                    className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-700 ${
                      active
                        ? "bg-[var(--color-primary-foreground)]/15 text-[var(--color-primary-foreground)]"
                        : "bg-[var(--color-card)] text-[var(--color-foreground)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64 sm:shrink-0">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search briefs, products, creators…"
            className="h-9 w-full rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-secondary)]/50 pl-9 pr-9 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/40 focus:bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15"
          />
          {searchValue && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Select toggle */}
        <button
          type="button"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border px-3 py-2 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
            selectMode
              ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
          }`}
        >
          {selectMode ? (
            <>
              <X className="h-3 w-3" />
              Cancel
            </>
          ) : (
            <>
              <CheckSquare className="h-3 w-3" />
              Select
            </>
          )}
        </button>
      </motion.div>

      {/* ═══ Selection action bar ═══ */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-5 overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                    {selectedIds.size} selected
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    Pick images, then bulk download as ZIP
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={handleBulkDownload}
                  disabled={selectedIds.size === 0 || bulkDownloading}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-3.5 py-1.5 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
                >
                  {bulkDownloading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Download {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Loading overlay ═══ */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      )}

      {/* ═══ Empty state ═══ */}
      {!loading && items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] py-20 text-center"
        >
          <div className="mb-5 flex size-20 items-center justify-center rounded-full bg-[var(--color-primary)]/12 ring-1 ring-[var(--color-primary)]/20">
            <ImageIcon className="size-8 text-[var(--color-primary)]" />
          </div>
          <h3 className="mb-2 font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
            {searchValue || activeStatus
              ? "No images found"
              : "Your library is empty"}
          </h3>
          <p className="mx-auto mb-6 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
            {searchValue || activeStatus
              ? "Try a different search or clear the filter."
              : "Generated, approved images appear here. Start a collab to fill your library."}
          </p>
          {!searchValue && !activeStatus && (
            <Link
              href="/brand/discover"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Discover creators &amp; generate
            </Link>
          )}
          {(searchValue || activeStatus) && (
            <button
              type="button"
              onClick={() => {
                handleSearchChange("");
                handleFilterChange("");
              }}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </motion.div>
      )}

      {/* ═══ Grid ═══ */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => {
              const selected = selectedIds.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                  className={`group relative overflow-hidden rounded-2xl border bg-[var(--color-card)] transition-all ${
                    selected
                      ? "border-[var(--color-primary)]/60 shadow-[0_0_0_2px_rgba(201,169,110,0.35)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.4)]"
                  }`}
                >
                  {/* Image */}
                  <div
                    className="relative aspect-square cursor-pointer overflow-hidden bg-[var(--color-secondary)]"
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(item.id);
                        return;
                      }
                      setSelectedItem(item);
                      setModalOpen(true);
                    }}
                  >
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.brief?.product_name ?? "Licensed generation"}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="size-10 text-[var(--color-muted-foreground)]" />
                      </div>
                    )}

                    {/* Top-right status chip */}
                    <span
                      className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-700 backdrop-blur-md ${statusBadgeClass(item.status)}`}
                    >
                      {item.status === "approved" && (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      )}
                      {statusLabel(item.status)}
                    </span>

                    {/* Selection checkbox (top-left, always visible in select mode) */}
                    {selectMode && (
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(item.id, e)}
                        className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md transition-all"
                        aria-label={selected ? "Deselect" : "Select"}
                      >
                        {selected ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-md ring-1 ring-white/40">
                            <Square className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                    )}

                    {/* Hover overlay (only when NOT in select mode) */}
                    {!selectMode && (
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <div className="pointer-events-auto p-3">
                          {item.creator_name && (
                            <p className="mb-2 inline-flex items-center gap-1 truncate text-[11px] font-600 text-white/90">
                              <User className="h-3 w-3" />
                              {item.creator_name}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                                setModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-wider text-white backdrop-blur-md transition-colors hover:bg-white/25"
                            >
                              <Eye className="size-3" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadBlob(
                                  `/api/vault/${item.id}/download?format=original`,
                                  `faiceoff-${item.id}.zip`,
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-1 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary-foreground)] shadow-[0_2px_8px_-2px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
                            >
                              <Download className="size-3" />
                              Pack
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer: title + creator */}
                  <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                    <p className="truncate text-[12px] font-700 text-[var(--color-foreground)]">
                      {item.brief?.product_name ?? "Licensed image"}
                    </p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--color-muted-foreground)]">
                      <span className="truncate font-mono uppercase tracking-wider">
                        {item.creator_name ?? "—"}
                      </span>
                      <span className="shrink-0 font-mono">
                        {formatDate(item.created_at)}
                      </span>
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ Pagination ═══ */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => handlePage(page - 1)}
            className="inline-flex items-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <div className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2 font-mono text-[11px] font-700 uppercase tracking-wider text-[var(--color-foreground)]">
            Page {page} <span className="text-[var(--color-muted-foreground)]">of</span>{" "}
            {totalPages}
          </div>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => handlePage(page + 1)}
            className="inline-flex items-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ═══ Lightbox ═══ */}
      <VaultLightbox
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
