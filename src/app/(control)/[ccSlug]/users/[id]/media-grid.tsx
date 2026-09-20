"use client";

/**
 * Generic thumbnail grid + lightbox for the per-user drill-down.
 *
 * Used for two things that are NOT generations and so can't reuse
 * generations-grid.tsx:
 *   • creator reference photos (private "reference-photos" bucket — the
 *     server hands us an already-signed, short-lived URL)
 *   • creator demo Style Previews (public R2 URLs)
 *
 * Items carry their own caption + pill so the same component can label a
 * "primary" face reference and a "failed" demo sample without branching here.
 * A missing url renders a placeholder tile rather than disappearing, because
 * "this row exists but has no image" is itself the thing an operator needs to
 * see (a failed demo, or a signed-URL that could not be minted).
 */

import { useState, useEffect } from "react";

export interface MediaItem {
  /** Stable key — row id. */
  id: string;
  /** Displayable URL. Null when there is no image or signing failed. */
  url: string | null;
  /** Short caption under the tile. */
  caption: string;
  /** Optional badge text rendered top-left over the tile. */
  badge?: string | null;
  /** cc-pill-* class for the badge. */
  badgeClass?: string;
}

export default function MediaGrid({
  items,
  emptyText = "Nothing here.",
  minTile = 110,
}: {
  items: MediaItem[];
  emptyText?: string;
  minTile?: number;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // Only tiles that actually have an image participate in the lightbox.
  const viewable = items.filter((i) => !!i.url);

  useEffect(() => {
    if (openIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIdx(null);
      if (e.key === "ArrowRight") setOpenIdx((i) => (i === null ? 0 : Math.min(viewable.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpenIdx((i) => (i === null ? 0 : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, viewable.length]);

  if (items.length === 0) {
    return <p className="cc-table-empty" style={{ padding: 20, margin: 0 }}>{emptyText}</p>;
  }

  const open = openIdx !== null ? viewable[openIdx] : null;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${minTile}px, 1fr))`,
          gap: 8,
        }}
      >
        {items.map((item) => {
          const viewableIdx = item.url ? viewable.findIndex((v) => v.id === item.id) : -1;
          return (
            <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                onClick={() => viewableIdx >= 0 && setOpenIdx(viewableIdx)}
                disabled={viewableIdx < 0}
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  background: "var(--cc-bg)",
                  border: "1px solid var(--cc-border)",
                  borderRadius: 4,
                  overflow: "hidden",
                  padding: 0,
                  cursor: viewableIdx >= 0 ? "zoom-in" : "default",
                }}
                title={viewableIdx >= 0 ? "Click to zoom · arrows to navigate · Esc to close" : "No image"}
              >
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--cc-fg-dim)",
                      fontSize: 10,
                    }}
                  >
                    no image
                  </div>
                )}
                {item.badge && (
                  <span
                    className={`cc-pill ${item.badgeClass ?? "cc-pill-neutral"}`}
                    style={{ position: "absolute", left: 4, top: 4, fontSize: 8.5 }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
              <p
                className="cc-mono-cell"
                style={{
                  margin: 0,
                  fontSize: 9.5,
                  color: "var(--cc-fg-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={item.caption}
              >
                {item.caption}
              </p>
            </div>
          );
        })}
      </div>

      {open && open.url && (
        <div
          onClick={() => setOpenIdx(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 32,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: 1400,
              maxHeight: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.url}
              alt=""
              style={{
                maxHeight: "85vh",
                maxWidth: "100%",
                objectFit: "contain",
                borderRadius: 4,
                boxShadow: "0 24px 64px -8px rgba(0,0,0,0.7)",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                color: "var(--cc-fg-muted)",
                fontFamily: "var(--cc-mono)",
                fontSize: 11.5,
              }}
            >
              <span>
                {open.badge && (
                  <span className={`cc-pill ${open.badgeClass ?? "cc-pill-neutral"}`} style={{ marginRight: 8 }}>
                    {open.badge}
                  </span>
                )}
                {open.caption} · {(openIdx ?? 0) + 1} / {viewable.length}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a
                  href={open.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cc-btn"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  Open original ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpenIdx(null)}
                  className="cc-btn"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  Close (Esc)
                </button>
              </span>
            </div>
            <p
              style={{
                margin: 0,
                textAlign: "center",
                color: "var(--cc-fg-dim)",
                fontFamily: "var(--cc-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
            >
              ← / → to navigate · Esc to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}
