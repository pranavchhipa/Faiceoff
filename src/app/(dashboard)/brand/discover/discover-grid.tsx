"use client";

/**
 * /brand/discover — Discover Creators (dark editorial)
 *
 * Ported from Claude Design "Discover Creators.html" bundle. Phone-width is
 * lost on this surface (it's a desktop-first browse experience) but mobile
 * still gets a proper UX via a slide-up filter sheet.
 *
 * Filters (all client-side, in-memory):
 *   - Categories: multi-select chip strip (desktop scrolls horizontally,
 *     mobile lives in the sheet)
 *   - Followers range: single-select (Under 50K / 50K-150K / 150K-500K / 500K+)
 *   - Price range: single-select (Under ₹5K / ₹5-10K / ₹10-20K / ₹20K+)
 *
 * Sort: Most popular (followers desc default) / Lowest price / Largest reach / Newest
 *
 * Saved creators: localStorage only (client). Server-side persistence is a
 * follow-up — would need a `brand_saved_creators` table.
 *
 * Card click → /brand/discover/[creatorId] (existing detail route, unchanged).
 *
 * Styles are inlined in a single <style> block scoped under .fco-discover-v2
 * so they don't pollute the rest of the dashboard layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ChevronDown,
  Heart,
  Search,
  SlidersHorizontal,
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
}

/* ───────── Format helpers ───────── */

function formatFollowers(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
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

// Compared against `instagram_followers` (number or null — null fails all ranges).
const FOLLOWER_RANGES: RangeOption[] = [
  { id: "r1", label: "Under 50K",    test: (f) => f !== null && f < 50_000 },
  { id: "r2", label: "50K – 150K",   test: (f) => f !== null && f >= 50_000 && f < 150_000 },
  { id: "r3", label: "150K – 500K",  test: (f) => f !== null && f >= 150_000 && f < 500_000 },
  { id: "r4", label: "500K +",       test: (f) => f !== null && f >= 500_000 },
];

// Compared against `cheapest_paise` (paise; null fails all ranges).
const PRICE_RANGES: RangeOption[] = [
  { id: "p1", label: "Under ₹5,000",      test: (p) => p !== null && p < 500_000 },
  { id: "p2", label: "₹5,000 – ₹10,000",  test: (p) => p !== null && p >= 500_000 && p < 1_000_000 },
  { id: "p3", label: "₹10,000 – ₹20,000", test: (p) => p !== null && p >= 1_000_000 && p < 2_000_000 },
  { id: "p4", label: "₹20,000 +",         test: (p) => p !== null && p >= 2_000_000 },
];

type SortKey = "popular" | "price-low" | "followers-high" | "newest";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "popular",        label: "Most popular" },
  { id: "price-low",      label: "Lowest price" },
  { id: "followers-high", label: "Largest reach" },
  { id: "newest",         label: "Newest" },
];

/* ───────── Faiceoff verified seal — defined once, referenced via <use> ───────── */

function FaSealDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="faSealShine" cx="34" cy="28" r="58" gradientUnits="userSpaceOnUse">
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

function Seal({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <use href="#faSealDiscover" />
    </svg>
  );
}

/* ───────── Dropdown ───────── */

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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div className="dd-wrap" ref={ref}>
      <button
        type="button"
        className={`dd-trigger ${selected ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="lbl">{label}</span>
        {selected && <span className="val">{selected.label}</span>}
        <span className="chev">
          <ChevronDown size={12} strokeWidth={2.5} />
        </span>
      </button>
      {open && (
        <div className={`dd-menu align-${align}`} role="menu">
          {allowClear && selected && (
            <button
              type="button"
              className="dd-item"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              style={{ color: "var(--muted)", fontSize: "12.5px" }}
            >
              <span>Clear {label.toLowerCase()}</span>
              <span style={{ color: "var(--dim)" }}>
                <X size={11} strokeWidth={2.5} />
              </span>
            </button>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`dd-item ${selected?.id === o.id ? "selected" : ""}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              role="menuitem"
            >
              <span>{o.label}</span>
              {selected?.id === o.id && (
                <span className="tk">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
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
    <header className="ph">
      <div>
        <h1 className="ph-title">Discover Creators</h1>
        <div className="ph-sub">
          <span className="count">{count}</span>
          <span>verified {count === 1 ? "face" : "faces"}</span>
          <span className="sep" />
          <span>{categoryCount} categories</span>
          <span className="sep" />
          <span>Updated today</span>
        </div>
      </div>
      <div className="ph-actions">
        <Dropdown
          label="Sort"
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(id) => onSortChange((id ?? "popular") as SortKey)}
          allowClear={false}
        />
      </div>
    </header>
  );
}

/* ───────── Desktop filter bar ───────── */

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
    <div className="fb">
      <div className="fb-inner">
        <div className="fb-cats">
          <button
            type="button"
            className={`cat-chip ${selectedCats.size === 0 ? "active" : ""}`}
            onClick={() => onToggleCat("__all__")}
          >
            All categories
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-chip ${selectedCats.has(c) ? "active" : ""}`}
              onClick={() => onToggleCat(c)}
            >
              {c}
              {selectedCats.has(c) && (
                <span className="x">
                  <X size={10} strokeWidth={2.5} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="fb-right">
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

  const followerLabel = FOLLOWER_RANGES.find((r) => r.id === followerRange)?.label;
  const priceLabel = PRICE_RANGES.find((r) => r.id === priceRange)?.label;

  return (
    <div className="af">
      <span className="af-label">Filters · {total}</span>
      {Array.from(selectedCats).map((c) => (
        <span key={c} className="af-chip">
          {c}
          <button type="button" onClick={() => onRemoveCat(c)} aria-label={`Remove ${c}`}>
            <X size={10} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      {followerRange && (
        <span className="af-chip">
          {followerLabel} followers
          <button type="button" onClick={onClearFollower} aria-label="Clear followers filter">
            <X size={10} strokeWidth={2.5} />
          </button>
        </span>
      )}
      {priceRange && (
        <span className="af-chip">
          {priceLabel}
          <button type="button" onClick={onClearPrice} aria-label="Clear price filter">
            <X size={10} strokeWidth={2.5} />
          </button>
        </span>
      )}
      <button type="button" className="af-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}

/* ───────── Mobile toolbar (filter button + sort) ───────── */

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
    <div className="mb-toolbar">
      <button type="button" className="mb-filter-btn" onClick={onOpenSheet}>
        <SlidersHorizontal size={14} strokeWidth={2} />
        <span>Filters</span>
        {activeCount > 0 && <span className="badge">{activeCount}</span>}
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
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Filters">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">Filters</div>
          <button
            type="button"
            className="sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
        <div className="sheet-body">
          <div className="sheet-section">
            <span className="sheet-lbl">Category</span>
            <div className="sheet-chips">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cat-chip ${selectedCats.has(c) ? "active" : ""}`}
                  onClick={() => onToggleCat(c)}
                >
                  {c}
                  {selectedCats.has(c) && (
                    <span className="x">
                      <X size={10} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-section">
            <span className="sheet-lbl">Followers</span>
            <div className="sheet-chips">
              {FOLLOWER_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`cat-chip ${followerRange === r.id ? "active" : ""}`}
                  onClick={() =>
                    onFollowerChange(followerRange === r.id ? null : r.id)
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-section">
            <span className="sheet-lbl">Price</span>
            <div className="sheet-chips">
              {PRICE_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`cat-chip ${priceRange === r.id ? "active" : ""}`}
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
        <div className="sheet-foot">
          <button type="button" className="reset" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="apply" onClick={onClose}>
            Show {applyCount} creator{applyCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────── Card ───────── */

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
      className="card"
      aria-label={`View ${c.display_name}'s profile`}
    >
      <div className="card-img">
        {c.hero_photo_url ? (
          <Image
            src={c.hero_photo_url}
            alt={c.display_name}
            fill
            sizes="(max-width: 480px) 50vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
            className="card-img-el"
          />
        ) : (
          <div className="card-img-fallback">
            {c.display_name[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <button
          type="button"
          className={`card-save ${saved ? "saved" : ""}`}
          onClick={onSaveClick}
          aria-label={saved ? "Remove from saved" : "Save creator"}
        >
          <Heart size={16} strokeWidth={2} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-body">
        <div className="card-name-row">
          <span className="card-name">{c.display_name}</span>
          {c.is_verified && <Seal size={16} />}
        </div>
        {c.instagram_handle && (
          <div className="card-handle">@{c.instagram_handle}</div>
        )}
        {vibe.length > 0 && (
          <div className="card-vibe">
            {vibe.map((v, i) => (
              <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {i > 0 && <span className="vd">·</span>}
                <span>{v}</span>
              </span>
            ))}
          </div>
        )}
        {c.instagram_followers !== null && c.instagram_followers > 0 && (
          <div className="card-stats">
            <span className="fw">{formatFollowers(c.instagram_followers)}</span>
            <span>followers</span>
          </div>
        )}
        <div className="card-foot">
          <div className="card-price">
            {c.cheapest_paise !== null ? (
              <>
                <span className="lbl">From</span>
                <span className="amt">{formatINR(c.cheapest_paise)}</span>
              </>
            ) : (
              <span className="lbl">Custom briefing</span>
            )}
          </div>
          <span className="card-cta">
            View <ArrowRight size={13} strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ───────── Skeleton + Empty ───────── */

function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel-img" />
      <div className="skel-body">
        <div className="skel-line w-60" />
        <div className="skel-line w-40" />
        <div className="skel-line w-80" style={{ marginTop: 14 }} />
      </div>
    </div>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Search size={20} strokeWidth={2} />
      </div>
      <h2 className="empty-title">No matches yet</h2>
      <p className="empty-sub">
        Try widening your filters, or browse all verified creators across
        categories.
      </p>
      <button type="button" className="empty-btn" onClick={onReset}>
        Reset filters <ArrowRight size={13} strokeWidth={2.4} />
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

  // Load saved creators from localStorage on mount (client-only, never SSR).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("fco.saved_creators");
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setSavedSet(new Set(arr));
      }
    } catch {
      /* localStorage unavailable — silently fall back to in-memory only */
    }
  }, []);

  // Persist saved set on change.
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
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

    // Sort
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
        // No created_at on the card shape (yet) — fall back to ID order so the
        // sort option doesn't appear broken. Wire to creator.created_at later.
        arr.sort((a, b) => b.id.localeCompare(a.id));
        break;
      default:
        // "popular" — proxy: followers desc, then categories count desc as tiebreaker
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
    <div className="fco-discover-v2">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <FaSealDefs />

      <main className="page">
        <PageHeader
          count={filtered.length}
          categoryCount={allCategories.length}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      </main>

      <FilterBar
        cats={allCategories}
        selectedCats={selectedCats}
        onToggleCat={toggleCat}
        followerRange={followerRange}
        onFollowerChange={setFollowerRange}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
      />

      <main className="page">
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

        <div className="grid-wrap">
          {creators.length === 0 ? (
            <div className="grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Empty onReset={clearAll} />
          ) : (
            <div className="grid">
              {filtered.map((c) => (
                <CreatorCardCmp
                  key={c.id}
                  c={c}
                  saved={savedSet.has(c.id)}
                  onToggleSave={toggleSave}
                />
              ))}
            </div>
          )}
        </div>
      </main>

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

/* ───────── Page-scoped CSS ─────────
   Every selector is anchored under .fco-discover-v2 so this block stays
   isolated from the rest of the dashboard layout. The design originally set
   body bg / film grain at the document level — we move both to the wrapper. */
const PAGE_CSS = `
.fco-discover-v2 {
  --bg: #0a0908;
  --elev: #14110f;
  --overlay: #1a1612;
  --raised: #211c17;
  --text: #f5ebd6;
  --muted: #a89570;
  --dim: #6e6457;
  --hair: #2a2520;
  --hair-soft: #1f1b17;
  --accent: #e8825d;
  --accent-deep: #c96a47;
  --accent-soft: rgba(232, 130, 93, 0.12);
  --gold: #d4a557;
  --danger: #d96b6b;
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-label: 'Plus Jakarta Sans', system-ui, sans-serif;
  --filter-h: 64px;

  position: relative;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 14.5px;
  line-height: 1.5;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.fco-discover-v2 *, .fco-discover-v2 *::before, .fco-discover-v2 *::after {
  box-sizing: border-box;
}

.fco-discover-v2 ::selection { background: var(--accent); color: var(--bg); }
.fco-discover-v2 button { font: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; }

/* Page-scoped film grain (does NOT leak — fixed to viewport while page mounted) */
.fco-discover-v2::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}

/* ── Page container ── */
.fco-discover-v2 .page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ── Page header ── */
.fco-discover-v2 .ph {
  padding: 40px 0 24px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.fco-discover-v2 .ph-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 44px;
  letter-spacing: -0.035em;
  line-height: 1;
  margin: 0 0 12px;
  color: var(--text);
}
.fco-discover-v2 .ph-sub {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 14px;
}
.fco-discover-v2 .ph-sub .count { color: var(--text); font-weight: 600; }
.fco-discover-v2 .ph-sub .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--dim); }
.fco-discover-v2 .ph-actions { display: flex; align-items: center; gap: 8px; }

/* ── Filter bar (desktop sticky) ── */
.fco-discover-v2 .fb {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(10, 9, 8, 0.92);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  border-bottom: 1px solid var(--hair-soft);
  border-top: 1px solid var(--hair-soft);
  padding: 0 24px;
}
.fco-discover-v2 .fb-inner {
  max-width: 1392px;
  margin: 0 auto;
  height: var(--filter-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.fco-discover-v2 .fb-cats {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 24px), transparent);
  padding: 0 8px;
}
.fco-discover-v2 .fb-cats::-webkit-scrollbar { display: none; }
.fco-discover-v2 .cat-chip {
  flex-shrink: 0;
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--hair);
  border-radius: 999px;
  padding: 8px 14px;
  transition: all 180ms ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fco-discover-v2 .cat-chip:hover { border-color: var(--muted); background: var(--elev); }
.fco-discover-v2 .cat-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--text);
}
.fco-discover-v2 .cat-chip .x { opacity: 0.7; display: inline-flex; align-items: center; }
.fco-discover-v2 .fb-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* ── Dropdown ── */
.fco-discover-v2 .dd-wrap { position: relative; }
.fco-discover-v2 .dd-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px 8px 14px;
  border: 1px solid var(--hair);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: border-color 160ms ease;
  background: var(--bg);
  white-space: nowrap;
  color: var(--text);
}
.fco-discover-v2 .dd-trigger:hover { border-color: var(--muted); }
.fco-discover-v2 .dd-trigger.active {
  border-color: var(--accent);
  color: var(--text);
  background: var(--accent-soft);
}
.fco-discover-v2 .dd-trigger .lbl {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dim);
}
.fco-discover-v2 .dd-trigger.active .lbl { color: var(--accent); }
.fco-discover-v2 .dd-trigger .val { color: var(--text); }
.fco-discover-v2 .dd-trigger .chev { color: var(--dim); transition: transform 200ms ease; display: inline-flex; }
.fco-discover-v2 .dd-trigger[aria-expanded="true"] .chev { transform: rotate(180deg); }
.fco-discover-v2 .dd-menu {
  position: absolute;
  top: calc(100% + 6px);
  min-width: 220px;
  background: var(--elev);
  border: 1px solid var(--hair);
  border-radius: 12px;
  padding: 6px;
  z-index: 60;
  box-shadow: 0 14px 40px -10px rgba(0,0,0,0.6);
  animation: fco-pop 180ms cubic-bezier(.2,.7,.2,1);
}
.fco-discover-v2 .dd-menu.align-right { right: 0; }
.fco-discover-v2 .dd-menu.align-left { left: 0; }
@keyframes fco-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fco-discover-v2 .dd-item {
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 140ms ease;
}
.fco-discover-v2 .dd-item:hover { background: var(--overlay); }
.fco-discover-v2 .dd-item.selected { background: var(--accent-soft); color: var(--accent); }
.fco-discover-v2 .dd-item .tk { display: inline-flex; }

/* ── Active filters strip ── */
.fco-discover-v2 .af {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0 6px;
  flex-wrap: wrap;
}
.fco-discover-v2 .af-label {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dim);
  margin-right: 4px;
}
.fco-discover-v2 .af-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 11px;
  background: var(--accent-soft);
  border: 1px solid rgba(232, 130, 93, 0.3);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
}
.fco-discover-v2 .af-chip button {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(232, 130, 93, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  transition: background 140ms ease;
}
.fco-discover-v2 .af-chip button:hover { background: rgba(232, 130, 93, 0.32); }
.fco-discover-v2 .af-clear {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  padding: 4px 8px;
  margin-left: 4px;
}
.fco-discover-v2 .af-clear:hover { color: var(--text); }

/* ── Mobile toolbar ── */
.fco-discover-v2 .mb-toolbar {
  display: none;
  gap: 8px;
  padding: 4px 0 14px;
  align-items: center;
  justify-content: space-between;
}
.fco-discover-v2 .mb-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--hair);
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 500;
  background: var(--bg);
  color: var(--text);
  position: relative;
}
.fco-discover-v2 .mb-filter-btn .badge {
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
  font-size: 11px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ── Grid ── */
.fco-discover-v2 .grid-wrap { padding: 28px 0 80px; }
.fco-discover-v2 .grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 1200px) {
  .fco-discover-v2 .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .fco-discover-v2 .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
}
@media (max-width: 480px) {
  .fco-discover-v2 .grid { gap: 12px; }
}

/* ── Card ── */
.fco-discover-v2 .card {
  position: relative;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 16px;
  overflow: hidden;
  transition: transform 280ms cubic-bezier(.2,.7,.2,1), border-color 280ms ease, box-shadow 280ms ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
}
.fco-discover-v2 .card:hover {
  transform: translateY(-3px);
  border-color: var(--hair);
  box-shadow: 0 24px 48px -16px rgba(0,0,0,0.6);
}
.fco-discover-v2 .card-img {
  position: relative;
  aspect-ratio: 4 / 5;
  background: var(--overlay);
  overflow: hidden;
}
.fco-discover-v2 .card-img .card-img-el {
  object-fit: cover;
  transition: transform 520ms cubic-bezier(.2,.7,.2,1), filter 320ms ease;
  filter: saturate(0.93) contrast(1.02);
  display: block;
}
.fco-discover-v2 .card:hover .card-img .card-img-el {
  transform: scale(1.045);
  filter: saturate(1) contrast(1.05);
}
.fco-discover-v2 .card-img-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 80px;
  color: rgba(168, 149, 112, 0.2);
}
.fco-discover-v2 .card-img::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 65%, rgba(10, 9, 8, 0.55));
  pointer-events: none;
}
.fco-discover-v2 .card-save {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(10, 9, 8, 0.45);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  border: 1px solid rgba(245, 235, 214, 0.12);
  transition: all 200ms ease;
  z-index: 2;
}
.fco-discover-v2 .card-save:hover { background: rgba(10, 9, 8, 0.7); transform: scale(1.06); }
.fco-discover-v2 .card-save.saved {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
.fco-discover-v2 .card-body {
  padding: 16px 16px 18px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.fco-discover-v2 .card-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.fco-discover-v2 .card-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fco-discover-v2 .card-handle {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--muted);
  margin-top: 2px;
}
.fco-discover-v2 .card-vibe {
  margin-top: 10px;
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fco-discover-v2 .card-vibe .vd { color: var(--dim); }
.fco-discover-v2 .card-stats {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--dim);
}
.fco-discover-v2 .card-stats .fw { color: var(--text); font-weight: 600; }
.fco-discover-v2 .card-foot {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hair-soft);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.fco-discover-v2 .card-price { display: flex; align-items: baseline; gap: 6px; }
.fco-discover-v2 .card-price .lbl {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--dim);
}
.fco-discover-v2 .card-price .amt {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.02em;
  color: var(--text);
}
.fco-discover-v2 .card-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  transition: transform 220ms ease;
}
.fco-discover-v2 .card:hover .card-cta { transform: translateX(3px); }

/* ── Empty state ── */
.fco-discover-v2 .empty {
  padding: 80px 24px;
  text-align: center;
  border: 1px dashed var(--hair);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(232,130,93,0.02), transparent 60%);
}
.fco-discover-v2 .empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--elev);
  border: 1px solid var(--hair);
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.fco-discover-v2 .empty-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: var(--text);
}
.fco-discover-v2 .empty-sub {
  color: var(--muted);
  font-size: 14px;
  margin: 0 auto 22px;
  max-width: 380px;
}
.fco-discover-v2 .empty-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  background: var(--accent);
  color: var(--bg);
  border-radius: 10px;
  font-weight: 600;
  font-size: 13.5px;
  transition: transform 180ms ease, background 180ms ease;
}
.fco-discover-v2 .empty-btn:hover { background: #ec8e6a; transform: translateY(-1px); }

/* ── Skeleton ── */
.fco-discover-v2 .skel-card {
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 16px;
  overflow: hidden;
}
.fco-discover-v2 .skel-img {
  aspect-ratio: 4/5;
  background: linear-gradient(110deg, var(--overlay) 30%, var(--raised) 50%, var(--overlay) 70%);
  background-size: 200% 100%;
  animation: fco-shimmer 1.4s linear infinite;
}
.fco-discover-v2 .skel-body { padding: 16px; }
.fco-discover-v2 .skel-line {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(110deg, var(--overlay) 30%, var(--raised) 50%, var(--overlay) 70%);
  background-size: 200% 100%;
  animation: fco-shimmer 1.4s linear infinite;
  margin-bottom: 8px;
}
.fco-discover-v2 .skel-line.w-60 { width: 60%; }
.fco-discover-v2 .skel-line.w-40 { width: 40%; }
.fco-discover-v2 .skel-line.w-80 { width: 80%; }
@keyframes fco-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* ── Mobile sheet ── */
.fco-discover-v2 .sheet-back {
  position: fixed;
  inset: 0;
  background: rgba(10, 9, 8, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 100;
  animation: fco-fade 200ms ease;
}
@keyframes fco-fade { from { opacity: 0; } to { opacity: 1; } }
.fco-discover-v2 .sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 101;
  background: var(--elev);
  border-top: 1px solid var(--hair);
  border-radius: 22px 22px 0 0;
  max-height: 88vh;
  overflow-y: auto;
  animation: fco-slideup 280ms cubic-bezier(.2,.7,.2,1);
  padding-bottom: env(safe-area-inset-bottom, 16px);
  color: var(--text);
}
@keyframes fco-slideup {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.fco-discover-v2 .sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--hair);
  border-radius: 999px;
  margin: 10px auto 0;
}
.fco-discover-v2 .sheet-head {
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--hair-soft);
}
.fco-discover-v2 .sheet-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.02em;
}
.fco-discover-v2 .sheet-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.fco-discover-v2 .sheet-body { padding: 6px 22px 18px; }
.fco-discover-v2 .sheet-section { padding: 16px 0; border-bottom: 1px solid var(--hair-soft); }
.fco-discover-v2 .sheet-section:last-of-type { border-bottom: none; }
.fco-discover-v2 .sheet-lbl {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dim);
  margin-bottom: 12px;
  display: block;
}
.fco-discover-v2 .sheet-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.fco-discover-v2 .sheet-foot {
  position: sticky;
  bottom: 0;
  background: var(--elev);
  padding: 14px 22px 16px;
  border-top: 1px solid var(--hair-soft);
  display: flex;
  gap: 10px;
}
.fco-discover-v2 .sheet-foot .reset {
  flex-shrink: 0;
  padding: 13px 18px;
  border: 1px solid var(--hair);
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}
.fco-discover-v2 .sheet-foot .apply {
  flex: 1;
  padding: 13px 18px;
  background: var(--accent);
  color: var(--bg);
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
}

/* ── Responsive — mobile gets sheet + condensed page header ── */
@media (max-width: 900px) {
  .fco-discover-v2 { --filter-h: 56px; }
  .fco-discover-v2 .page { padding: 0 16px; }
  .fco-discover-v2 .fb { display: none; }
  .fco-discover-v2 .mb-toolbar { display: flex; }
  .fco-discover-v2 .ph {
    padding: 22px 0 18px;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .fco-discover-v2 .ph-title { font-size: 32px; }
  .fco-discover-v2 .ph-sub { font-size: 13px; }
  .fco-discover-v2 .grid-wrap { padding: 16px 0 60px; }
  .fco-discover-v2 .card-name { font-size: 15.5px; }
  .fco-discover-v2 .card-price .amt { font-size: 15.5px; }
  .fco-discover-v2 .card-body { padding: 12px 12px 14px; }
}
@media (min-width: 901px) {
  .fco-discover-v2 .mb-toolbar { display: none !important; }
}
`;
