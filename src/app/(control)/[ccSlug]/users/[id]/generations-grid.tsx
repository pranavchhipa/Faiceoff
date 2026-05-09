"use client";

import { useState, useEffect } from "react";

interface Gen {
  id: string;
  status: string;
  image_url: string | null;
  created_at: string;
}

function statusPill(status: string): string {
  if (["approved", "active", "success", "completed"].includes(status)) return "cc-pill-ok";
  if (["rejected", "failed", "discarded"].includes(status)) return "cc-pill-bad";
  if (
    [
      "pending",
      "ready_for_brand_review",
      "ready_for_approval",
      "compliance_check",
      "generating",
      "output_check",
      "draft",
    ].includes(status)
  )
    return "cc-pill-warn";
  return "cc-pill-neutral";
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function GenerationsGrid({ generations }: { generations: Gen[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // Esc + arrow keys
  useEffect(() => {
    if (openIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIdx(null);
      if (e.key === "ArrowRight") setOpenIdx((i) => (i === null ? 0 : Math.min(generations.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpenIdx((i) => (i === null ? 0 : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, generations.length]);

  if (generations.length === 0) {
    return <p className="cc-table-empty" style={{ padding: 24 }}>No generations.</p>;
  }

  const open = openIdx !== null ? generations[openIdx] : null;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        {generations.map((g, i) => (
          <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              type="button"
              onClick={() => g.image_url && setOpenIdx(i)}
              disabled={!g.image_url}
              style={{
                position: "relative",
                aspectRatio: "1",
                background: "var(--cc-bg)",
                border: "1px solid var(--cc-border)",
                borderRadius: 4,
                overflow: "hidden",
                padding: 0,
                cursor: g.image_url ? "zoom-in" : "default",
              }}
              title={g.image_url ? "Click to zoom · arrows to navigate · Esc to close" : ""}
            >
              {g.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.image_url}
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
              <span
                className={`cc-pill ${statusPill(g.status)}`}
                style={{ position: "absolute", left: 4, top: 4, fontSize: 8.5 }}
              >
                {g.status}
              </span>
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
              title={g.id}
            >
              {g.id.slice(0, 8)}… · {relativeFrom(g.created_at)}
            </p>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {open && open.image_url && (
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
              maxWidth: "1400px",
              maxHeight: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.image_url}
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
                <span className={`cc-pill ${statusPill(open.status)}`} style={{ marginRight: 8 }}>
                  {open.status}
                </span>
                {open.id} · {relativeFrom(open.created_at)} · {(openIdx ?? 0) + 1} / {generations.length}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a
                  href={open.image_url}
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
            <p style={{ margin: 0, textAlign: "center", color: "var(--cc-fg-dim)", fontFamily: "var(--cc-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
              ← / → to navigate · Esc to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}
