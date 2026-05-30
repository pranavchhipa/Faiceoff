"use client";

/**
 * /brand/discover — Discover Creators
 *
 * Visual language matches the rest of the dashboard (brand/dashboard,
 * brand/requests, brand/collabs) — canonical `var(--color-*)` tokens,
 * Tailwind utilities, framer-motion fade-up entries. The custom
 * `.fco-discover-v2` namespace + film-grain overlay are gone; the page now
 * sits flush with the dashboard chrome.
 *
 * Filters (all client-side, in-memory):
 *   - Categories: multi-select chip strip (desktop scrolls horizontally,
 *     mobile lives in the slide-up sheet)
 *   - Followers range: single-select
 *   - Price range: single-select
 *
 * Sort: Most popular / Lowest price / Largest reach / Newest
 *
 * Saved creators: optimistic toggle backed by /api/brand/saved (migration
 * 00064) with localStorage mirror for offline-first paint.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Heart,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";

/* ───────── Types ───────── */

export interface CreatorCard {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_followers: number | null;
  instagram_handle: string | null;
  hero_photo_url: string | null;
  cheapest_paise: number | null;
  category_count: number;
  primary_category: string | null;
  categories: string[];
  is_verified: boolean;
  /** Free-text creator city. Drives the location pin overlay on cards. */
  city: string | null;
  /** ISO timestamp creator joined — powers Newest sort + "New" badge (last 14d). */
  created_at: string | null;
}

/** Returns true if the creator joined within the last 14 days. */
function isNewCreator(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 14 * 24 * 60 * 60 * 1000;
}

/* ───────── Format helpers ───────── */

function formatFollowers(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
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

/* ───────── Filter / sort definitions ───────── */

interface RangeOption {
  id: string;
  label: string;
  test: (value: number | null) => boolean;
}

const FOLLOWER_RANGES: RangeOption[] = [
  { id: "r1", label: "Under 50K", test: (f) => f !== null && f < 50_000 },
  {
    id: "r2",
    label: "50K – 150K",
    test: (f) => f !== null && f >= 50_000 && f < 150_000,
  },
  {
    id: "r3",
    label: "150K – 500K",
    test: (f) => f !== null && f >= 150_000 && f < 500_000,
  },
  { id: "r4", label: "500K +", test: (f) => f !== null && f >= 500_000 },
];

const PRICE_RANGES: RangeOption[] = [
  {
    id: "p1",
    label: "Under ₹5,000",
    test: (p) => p !== null && p < 500_000,
  },
  {
    id: "p2",
    label: "₹5,000 – ₹10,000",
    test: (p) => p !== null && p >= 500_000 && p < 1_000_000,
  },
  {
    id: "p3",
    label: "₹10,000 – ₹20,000",
    test: (p) => p !== null && p >= 1_000_000 && p < 2_000_000,
  },
  { id: "p4", label: "₹20,000 +", test: (p) => p !== null && p >= 2_000_000 },
];

type SortKey = "popular" | "price-low" | "followers-high" | "newest";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "popular", label: "Most popular" },
  { id: "price-low", label: "Lowest price" },
  { id: "followers-high", label: "Largest reach" },
  { id: "newest", label: "Newest" },
];

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Faiceoff verified seal ───────── */

function FaSealDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <radialGradient
          id="faSealShine"
          cx="34"
          cy="28"
          r="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#f0c34a" />
          <stop offset="0.85" stopColor="#a87a2a" />
          <stop offset="1" stopColor="#7a5418" />
        </radialGradient>
        <symbol id="faSealDiscover" viewBox="0 0 100 100">
          <g fill="url(#faSealShine)">
            <circle cx="50" cy="50" r="36" />
            <circle cx="50" cy="14" r="9" />
            <circle cx="75.46" cy="24.54" r="9" />
            <circle cx="86" cy="50" r="9" />
            <circle cx="75.46" cy="75.46" r="9" />
            <circle cx="50" cy="86" r="9" />
            <circle cx="24.54" cy="75.46" r="9" />
            <circle cx="14" cy="50" r="9" />
            <circle cx="24.54" cy="24.54" r="9" />
          </g>
          <ellipse
            cx="36"
            cy="25"
            rx="11"
            ry="4.5"
            fill="#ffffff"
            opacity="0.45"
            transform="rotate(-32 36 25)"
          />
          <path
            d="M 34 51 L 45 62 L 67 39"
            fill="none"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}

function Seal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <use href="#faSealDiscover" />
    </svg>
  );
}

/* ───────── Dropdown (canonical-tokened) ───────── */

interface DropdownOption<T extends string> {
  id: T;
  label: string;
}

function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  allowClear = true,
  align = "right",
}: {
  label: string;
  value: T | null;
  options: ReadonlyArray<DropdownOption<T>>;
  onChange: (id: T | null) => void;
  allowClear?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border px-3 py-2 text-[12px] font-600 transition-colors ${
          selected
            ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8 text-[var(--color-foreground)]"
            : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
        }`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
        {selected && (
          <span className="text-[12px] font-600">{selected.label}</span>
        )}
        <ChevronDown
          className={`h-3 w-3 text-[var(--color-muted-foreground)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          {allowClear && selected && (
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-[12px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span>Clear {label.toLowerCase()}</span>
              <X className="h-3 w-3" />
            </button>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-[12.5px] transition-colors hover:bg-[var(--color-secondary)] ${
                selected?.id === o.id
                  ? "bg-[var(--color-primary)]/8 font-700 text-[var(--color-primary)]"
                  : "text-[var(--color-foreground)]"
              }`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              role="menuitem"
            >
              <span>{o.label}</span>
              {selected?.id === o.id && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Page header ───────── */

function PageHeader({
  count,
  categoryCount,
  sortBy,
  onSortChange,
}: {
  count: number;
  categoryCount: number;
  sortBy: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <motion.header
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Users className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
          Discover creators
        </p>
        <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] lg:text-[40px]">
          Discover creators
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-muted-foreground)] lg:text-[14px]">
          <span className="font-600 text-[var(--color-foreground)]">
            {count}
          </span>
          <span>verified {count === 1 ? "face" : "faces"}</span>
          <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
          <span>{categoryCount} categories</span>
          <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
          <span>Updated today</span>
        </p>
      </div>
      <div>
        <Dropdown
          label="Sort"
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(id) => onSortChange((id ?? "popular") as SortKey)}
          allowClear={false}
        />
      </div>
    </motion.header>
  );
}

/* ───────── Desktop filter bar (sticky chip strip + dropdowns) ───────── */

function FilterBar({
  cats,
  selectedCats,
  onToggleCat,
  followerRange,
  onFollowerChange,
  priceRange,
  onPriceChange,
}: {
  cats: string[];
  selectedCats: Set<string>;
  onToggleCat: (c: string) => void;
  followerRange: string | null;
  onFollowerChange: (id: string | null) => void;
  priceRange: string | null;
  onPriceChange: (id: string | null) => void;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-4 hidden border-y border-[var(--color-border)] bg-[var(--color-background)]/85 px-4 backdrop-blur-md lg:-mx-8 lg:block lg:px-8">
      <div className="mx-auto flex max-w-6xl items-center gap-3 py-3">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className={`shrink-0 rounded-[var(--radius-pill)] border px-3.5 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
              selectedCats.size === 0
                ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }`}
            onClick={() => onToggleCat("__all__")}
          >
            All categories
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3.5 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                selectedCats.has(c)
                  ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
              onClick={() => onToggleCat(c)}
            >
              {c}
              {selectedCats.has(c) && <X className="h-2.5 w-2.5" />}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Dropdown
            label="Followers"
            value={followerRange}
            options={FOLLOWER_RANGES}
            onChange={onFollowerChange}
          />
          <Dropdown
            label="Price"
            value={priceRange}
            options={PRICE_RANGES}
            onChange={onPriceChange}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────── Active filter chips strip ───────── */

function ActiveFilters({
  selectedCats,
  followerRange,
  priceRange,
  onRemoveCat,
  onClearFollower,
  onClearPrice,
  onClearAll,
}: {
  selectedCats: Set<string>;
  followerRange: string | null;
  priceRange: string | null;
  onRemoveCat: (c: string) => void;
  onClearFollower: () => void;
  onClearPrice: () => void;
  onClearAll: () => void;
}) {
  const total =
    selectedCats.size + (followerRange ? 1 : 0) + (priceRange ? 1 : 0);
  if (total === 0) return null;

  const followerLabel = FOLLOWER_RANGES.find((r) => r.id === followerRange)
    ?.label;
  const priceLabel = PRICE_RANGES.find((r) => r.id === priceRange)?.label;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        Filters · {total}
      </span>
      {Array.from(selectedCats).map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-3 pr-1 text-[11px] font-600 text-[var(--color-foreground)]"
        >
          {c}
          <button
            type="button"
            onClick={() => onRemoveCat(c)}
            aria-label={`Remove ${c}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {followerRange && (
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-3 pr-1 text-[11px] font-600 text-[var(--color-foreground)]">
          {followerLabel} followers
          <button
            type="button"
            onClick={onClearFollower}
            aria-label="Clear followers filter"
            className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
      {priceRange && (
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-3 pr-1 text-[11px] font-600 text-[var(--color-foreground)]">
          {priceLabel}
          <button
            type="button"
            onClick={onClearPrice}
            aria-label="Clear price filter"
            className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
      <button
        type="button"
        className="font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)] transition-opacity hover:opacity-80"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  );
}

/* ───────── Mobile toolbar ───────── */

function MobileToolbar({
  activeCount,
  onOpenSheet,
  sortBy,
  onSortChange,
}: {
  activeCount: number;
  onOpenSheet: () => void;
  sortBy: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 lg:hidden">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
        onClick={onOpenSheet}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 font-mono text-[9px] font-700 text-[var(--color-primary-foreground)]">
            {activeCount}
          </span>
        )}
      </button>
      <Dropdown
        label="Sort"
        value={sortBy}
        options={SORT_OPTIONS}
        onChange={(id) => onSortChange((id ?? "popular") as SortKey)}
        allowClear={false}
        align="right"
      />
    </div>
  );
}

/* ───────── Mobile filter sheet (slide-up bottom sheet) ───────── */

function FilterSheet({
  open,
  onClose,
  cats,
  selectedCats,
  onToggleCat,
  followerRange,
  onFollowerChange,
  priceRange,
  onPriceChange,
  onReset,
  applyCount,
}: {
  open: boolean;
  onClose: () => void;
  cats: string[];
  selectedCats: Set<string>;
  onToggleCat: (c: string) => void;
  followerRange: string | null;
  onFollowerChange: (id: string | null) => void;
  priceRange: string | null;
  onPriceChange: (id: string | null) => void;
  onReset: () => void;
  applyCount: number;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-3xl border-t border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.45)] lg:hidden"
        role="dialog"
        aria-label="Filters"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--color-border)]" />
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <p className="font-display text-[16px] font-800 text-[var(--color-foreground)]">
            Filters
          </p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-border)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Category
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                    selectedCats.has(c)
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                  onClick={() => onToggleCat(c)}
                >
                  {c}
                  {selectedCats.has(c) && <X className="h-2.5 w-2.5" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Followers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOWER_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                    followerRange === r.id
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                  onClick={() =>
                    onFollowerChange(followerRange === r.id ? null : r.id)
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Price
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                    priceRange === r.id
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                  }`}
                  onClick={() =>
                    onPriceChange(priceRange === r.id ? null : r.id)
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            className="flex-1 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 text-[13px] font-700 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
            onClick={onReset}
          >
            Reset
          </button>
          <button
            type="button"
            className="flex-[2] rounded-[var(--radius-button)] bg-[var(--color-primary)] py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
            onClick={onClose}
          >
            Show {applyCount} creator{applyCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────── Creator card ───────── */

function CreatorCardCmp({
  c,
  saved,
  onToggleSave,
}: {
  c: CreatorCard;
  saved: boolean;
  onToggleSave: (id: string) => void;
}) {
  const onSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSave(c.id);
  };

  const vibe =
    c.categories.length > 0
      ? c.categories.slice(0, 3)
      : c.primary_category
        ? [c.primary_category]
        : [];

  return (
    <Link
      href={`/brand/discover/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_16px_36px_-16px_rgba(201,169,110,0.25)]"
      aria-label={`View ${c.display_name}'s profile`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[var(--color-secondary)]">
        {c.hero_photo_url ? (
          <Image
            src={c.hero_photo_url}
            alt={c.display_name}
            fill
            sizes="(max-width: 480px) 50vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-[44px] font-800 text-[var(--color-muted-foreground)]/40">
            {c.display_name[0]?.toUpperCase() ?? "?"}
          </div>
        )}

        {/* "New" badge — top-left */}
        {isNewCreator(c.created_at) && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]">
            New
          </span>
        )}

        {/* Save heart — top-right */}
        <button
          type="button"
          className={`absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition-all ${
            saved
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-2px_rgba(201,169,110,0.5)]"
              : "bg-black/40 text-white hover:bg-black/60"
          }`}
          onClick={onSaveClick}
          aria-label={saved ? "Remove from saved" : "Save creator"}
        >
          <Heart
            className="h-4 w-4"
            fill={saved ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>

        {/* Location pin — bottom-left */}
        {c.city && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
            <MapPin className="h-2.5 w-2.5" />
            {c.city}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
            {c.display_name}
          </span>
          {c.is_verified && <Seal size={14} />}
        </div>

        {c.instagram_handle && (
          <p className="-mt-1.5 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
            @{c.instagram_handle}
          </p>
        )}

        {vibe.length > 0 && (
          <p className="line-clamp-1 text-[11.5px] font-600 uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {vibe.map((v, i) => (
              <span key={v}>
                {i > 0 && (
                  <span className="mx-1.5 text-[var(--color-border)]">·</span>
                )}
                <span>{v}</span>
              </span>
            ))}
          </p>
        )}

        {c.instagram_followers !== null && c.instagram_followers > 0 && (
          <p className="text-[11.5px] text-[var(--color-muted-foreground)]">
            <span className="font-700 text-[var(--color-foreground)]">
              {formatFollowers(c.instagram_followers)}
            </span>{" "}
            followers
          </p>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border)] pt-3">
          <div className="min-w-0">
            {c.cheapest_paise !== null ? (
              <>
                <p className="font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  From
                </p>
                <p className="font-display text-[15px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                  {formatINR(c.cheapest_paise)}
                </p>
              </>
            ) : (
              <p className="font-mono text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Custom briefing
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)] transition-transform group-hover:translate-x-0.5">
            View
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ───────── Skeleton + Empty ───────── */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="aspect-[3/4] w-full animate-pulse rounded-t-2xl bg-[var(--color-secondary)]" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--color-secondary)]" />
        <div className="h-2.5 w-2/5 animate-pulse rounded bg-[var(--color-secondary)]" />
        <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-[var(--color-secondary)]" />
      </div>
    </div>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
        <Search className="h-6 w-6" />
      </div>
      <p className="font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
        No matches yet
      </p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        Try widening your filters, or browse all verified creators across
        categories.
      </p>
      <button
        type="button"
        className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition-transform hover:-translate-y-0.5"
        onClick={onReset}
      >
        Reset filters
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ───────── Main grid ───────── */

interface Props {
  creators: CreatorCard[];
}

export function DiscoverGrid({ creators }: Props) {
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [followerRange, setFollowerRange] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("popular");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());

  // Offline-first hydrate: localStorage paints instantly on mount, then the
  // server fetch reconciles (cross-device sync). Server wins on conflict.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("fco.saved_creators");
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setSavedSet(new Set(arr));
      }
    } catch {
      /* localStorage unavailable */
    }

    const controller = new AbortController();
    fetch("/api/brand/saved", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.creator_ids)) return;
        setSavedSet(new Set(d.creator_ids as string[]));
      })
      .catch(() => {
        /* network failure — keep the localStorage view */
      });
    return () => controller.abort();
  }, []);

  // Persist saved set on change (localStorage stays the offline cache).
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "fco.saved_creators",
        JSON.stringify(Array.from(savedSet)),
      );
    } catch {
      /* ignore */
    }
  }, [savedSet]);

  // Build category list from actual creator data so we never show a chip
  // the brand can't filter on.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of creators) for (const cat of c.categories) set.add(cat);
    return Array.from(set).sort();
  }, [creators]);

  const toggleCat = useCallback((c: string) => {
    setSelectedCats((prev) => {
      if (c === "__all__") return new Set();
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedCats(new Set());
    setFollowerRange(null);
    setPriceRange(null);
  }, []);

  const toggleSave = useCallback((id: string) => {
    // Optimistic: flip local state, fire server mutation, roll back on fail.
    setSavedSet((prev) => {
      const next = new Set(prev);
      const willBeSaved = !next.has(id);
      if (willBeSaved) next.add(id);
      else next.delete(id);

      void fetch(`/api/brand/saved/${encodeURIComponent(id)}`, {
        method: willBeSaved ? "POST" : "DELETE",
      })
        .then((r) => {
          if (r.ok) return;
          setSavedSet((curr) => {
            const fixed = new Set(curr);
            if (willBeSaved) fixed.delete(id);
            else fixed.add(id);
            return fixed;
          });
        })
        .catch(() => {
          /* network — keep optimistic; reconcile on next load */
        });

      return next;
    });
  }, []);

  // Filter + sort
  const filtered = useMemo(() => {
    let arr = creators.slice();

    if (selectedCats.size > 0) {
      arr = arr.filter((c) => c.categories.some((cat) => selectedCats.has(cat)));
    }
    if (followerRange) {
      const r = FOLLOWER_RANGES.find((rr) => rr.id === followerRange);
      if (r) arr = arr.filter((c) => r.test(c.instagram_followers));
    }
    if (priceRange) {
      const r = PRICE_RANGES.find((rr) => rr.id === priceRange);
      if (r) arr = arr.filter((c) => r.test(c.cheapest_paise));
    }

    switch (sortBy) {
      case "price-low":
        arr.sort(
          (a, b) =>
            (a.cheapest_paise ?? Number.MAX_SAFE_INTEGER) -
            (b.cheapest_paise ?? Number.MAX_SAFE_INTEGER),
        );
        break;
      case "followers-high":
        arr.sort(
          (a, b) => (b.instagram_followers ?? 0) - (a.instagram_followers ?? 0),
        );
        break;
      case "newest":
        arr.sort((a, b) => {
          const at = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bt - at;
        });
        break;
      default:
        // "popular" — followers desc, then categories count desc as tiebreaker
        arr.sort((a, b) => {
          const af = a.instagram_followers ?? 0;
          const bf = b.instagram_followers ?? 0;
          if (af !== bf) return bf - af;
          return b.category_count - a.category_count;
        });
    }

    return arr;
  }, [creators, selectedCats, followerRange, priceRange, sortBy]);

  const activeCount =
    selectedCats.size + (followerRange ? 1 : 0) + (priceRange ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">
      <FaSealDefs />

      <PageHeader
        count={filtered.length}
        categoryCount={allCategories.length}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <FilterBar
        cats={allCategories}
        selectedCats={selectedCats}
        onToggleCat={toggleCat}
        followerRange={followerRange}
        onFollowerChange={setFollowerRange}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
      />

      <MobileToolbar
        activeCount={activeCount}
        onOpenSheet={() => setSheetOpen(true)}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <ActiveFilters
        selectedCats={selectedCats}
        followerRange={followerRange}
        priceRange={priceRange}
        onRemoveCat={toggleCat}
        onClearFollower={() => setFollowerRange(null)}
        onClearPrice={() => setPriceRange(null)}
        onClearAll={clearAll}
      />

      {creators.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty onReset={clearAll} />
      ) : (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.4,
            delay: 0.05,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4"
        >
          {filtered.map((c) => (
            <CreatorCardCmp
              key={c.id}
              c={c}
              saved={savedSet.has(c.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </motion.div>
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        cats={allCategories}
        selectedCats={selectedCats}
        onToggleCat={toggleCat}
        followerRange={followerRange}
        onFollowerChange={setFollowerRange}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
        onReset={clearAll}
        applyCount={filtered.length}
      />
    </div>
  );
}
