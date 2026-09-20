/**
 * Funnel — presentational pieces.
 *
 * All server components (no client JS at all): bars are divs with an inline
 * width/height percentage, the window switcher is a set of plain links. The
 * Control Centre has no chart library and this page does not add one.
 *
 * Everything here speaks the cc-* visual language from [ccSlug]/cc.css —
 * no Tailwind, no dashboard components.
 */

import React from "react";

/* ── Formatting ───────────────────────────────────────────────────────── */

export function fmtINR(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-IN");
}

/**
 * A rate off a tiny denominator is noise, not a measurement: "100%" from one
 * user reads like a fact and is not one. Below MIN_DENOMINATOR we refuse to
 * print a percentage and show the raw fraction instead.
 */
export const MIN_DENOMINATOR = 5;

export function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  if (numerator >= denominator) return "100%";
  const v = (numerator / denominator) * 100;
  // Floor, never round. Rounding printed "100%" for anything above 99.5% —
  // so a step that lost a creator showed a perfect conversion right next to a
  // "Dropped −1" cell computed from the raw counts, and the table contradicted
  // itself. Only an exact numerator === denominator earns "100%".
  if (v === 0) return "0%";
  if (v >= 10) return `${Math.floor(v)}%`;
  return `${Math.max(Math.floor(v * 10) / 10, 0.1)}%`;
}

/* ── KPI tile ─────────────────────────────────────────────────────────── */

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "ok" | "warn" | "bad" | "info";
}) {
  const colour =
    tone === "ok"
      ? "var(--cc-ok)"
      : tone === "warn"
        ? "var(--cc-warn)"
        : tone === "bad"
          ? "var(--cc-bad)"
          : tone === "info"
            ? "var(--cc-info)"
            : "var(--cc-fg)";
  return (
    <div className="cc-kpi">
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value" style={{ color: colour }}>
        {value}
      </span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}

/* ── Window switcher ──────────────────────────────────────────────────── */

export const WINDOW_KEYS = ["today", "7d", "30d", "all"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];

const WINDOW_LABEL: Record<WindowKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

export function WindowSwitcher({
  basePath,
  active,
}: {
  basePath: string;
  active: WindowKey;
}) {
  return (
    <div className="cc-row" style={{ gap: 6 }}>
      {WINDOW_KEYS.map((k) => (
        <a
          key={k}
          href={`${basePath}?w=${k}`}
          className="cc-btn"
          style={
            k === active
              ? {
                  padding: "4px 11px",
                  fontSize: 11.5,
                  background: "var(--cc-bg-3)",
                  borderColor: "var(--cc-accent)",
                  color: "var(--cc-accent)",
                }
              : { padding: "4px 11px", fontSize: 11.5 }
          }
        >
          {WINDOW_LABEL[k]}
        </a>
      ))}
    </div>
  );
}

/* ── Stacked signup bars ──────────────────────────────────────────────── */

export interface Bucket {
  /** Axis label, e.g. "09:00" or "14 Sep" or "w/c 08 Sep". */
  label: string;
  /** Long form used in the hover title. */
  title: string;
  creator: number;
  brand: number;
  other: number;
}

const SERIES: Array<{ key: keyof Pick<Bucket, "creator" | "brand" | "other">; label: string; colour: string }> = [
  { key: "creator", label: "Creators", colour: "var(--cc-accent)" },
  { key: "brand", label: "Brands", colour: "var(--cc-info)" },
  { key: "other", label: "Other", colour: "var(--cc-fg-dim)" },
];

export function SignupBars({ buckets }: { buckets: Bucket[] }) {
  const totals = buckets.map((b) => b.creator + b.brand + b.other);
  const max = totals.reduce((m, t) => (t > m ? t : m), 0);
  const grand = totals.reduce((s, t) => s + t, 0);

  // Don't paint a label under every column when there are dozens — pick a
  // stride that keeps roughly a dozen readable ticks.
  const stride = Math.max(1, Math.ceil(buckets.length / 12));

  if (grand === 0) {
    return (
      <div className="cc-table-empty" style={{ padding: 28 }}>
        No signups in this window.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: buckets.length > 40 ? 1 : 3,
          height: 140,
          padding: "0 2px",
          borderBottom: "1px solid var(--cc-border)",
        }}
      >
        {buckets.map((b, i) => {
          const total = b.creator + b.brand + b.other;
          const colHeight = max === 0 ? 0 : Math.round((total / max) * 128);
          return (
            <div
              key={`${b.label}-${i}`}
              title={`${b.title} — ${total} signup${total === 1 ? "" : "s"} (${b.creator} creator, ${b.brand} brand${b.other ? `, ${b.other} other` : ""})`}
              style={{
                flex: 1,
                minWidth: 3,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                height: "100%",
              }}
            >
              <div
                style={{
                  height: total === 0 ? 1 : Math.max(colHeight, 3),
                  display: "flex",
                  flexDirection: "column-reverse",
                  background: total === 0 ? "var(--cc-border)" : "transparent",
                  borderRadius: 1,
                  overflow: "hidden",
                }}
              >
                {SERIES.map((s) => {
                  const v = b[s.key];
                  if (v <= 0) return null;
                  return (
                    <div
                      key={s.key}
                      style={{
                        height: `${(v / total) * 100}%`,
                        background: s.colour,
                        minHeight: 2,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: buckets.length > 40 ? 1 : 3,
          padding: "6px 2px 0",
        }}
      >
        {buckets.map((b, i) => (
          <div
            key={`lab-${b.label}-${i}`}
            className="cc-mono-cell"
            style={{
              flex: 1,
              minWidth: 3,
              fontSize: 9.5,
              color: "var(--cc-fg-dim)",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {i % stride === 0 ? b.label : ""}
          </div>
        ))}
      </div>

      <div className="cc-row" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {SERIES.map((s) => {
          const n = buckets.reduce((sum, b) => sum + b[s.key], 0);
          if (s.key === "other" && n === 0) return null;
          return (
            <span
              key={s.key}
              className="cc-mono-cell"
              style={{ fontSize: 11, color: "var(--cc-fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ width: 9, height: 9, background: s.colour, borderRadius: 2, display: "inline-block" }} />
              {s.label} {fmtNum(n)}
            </span>
          );
        })}
        <span className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-dim)", marginLeft: "auto" }}>
          {fmtNum(grand)} total · peak {fmtNum(max)}
        </span>
      </div>
    </div>
  );
}

/* ── Funnel ───────────────────────────────────────────────────────────── */

export interface FunnelStep {
  label: string;
  count: number;
  /** Plain-English definition of the step, shown under the label. */
  definition: string;
}

/**
 * Each step counts cohort members who have EVER reached it — the steps are
 * not forced to be nested subsets, because in this product they genuinely
 * are not (a brand can send a collab request without being verified). That
 * means a later step can out-count an earlier one; when it does we say so
 * rather than printing a conversion rate above 100%.
 */
export function FunnelTable({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.count ?? 0;

  return (
    <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
      <table className="cc-table">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Step</th>
            <th style={{ width: 72 }}>Count</th>
            <th style={{ width: 190 }}>Share of signups</th>
            <th style={{ width: 150 }}>From previous step</th>
            <th style={{ width: 96 }}>Dropped</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const prev = i === 0 ? null : steps[i - 1].count;
            const width = top === 0 ? 0 : Math.round((s.count / top) * 100);

            let conv: React.ReactNode;
            let dropped: React.ReactNode = <span className="cc-dim">—</span>;

            if (prev === null) {
              conv = <span className="cc-dim">baseline</span>;
            } else if (prev === 0) {
              conv = <span className="cc-dim">no one reached the previous step</span>;
            } else if (s.count > prev) {
              // Not a subset — worth surfacing, not worth a fake percentage.
              conv = (
                <span className="cc-pill cc-pill-warn" title="This step out-counts the one before it, so these are not nested subsets — read the counts, not a rate.">
                  +{fmtNum(s.count - prev)} vs prev
                </span>
              );
            } else if (prev < MIN_DENOMINATOR) {
              conv = (
                <span
                  className="cc-mono-cell"
                  style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}
                  title={`Only ${prev} people reached the previous step — too few to express as a rate.`}
                >
                  {fmtNum(s.count)} of {fmtNum(prev)} <span className="cc-dim">· n too small</span>
                </span>
              );
              dropped = (
                <span className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                  {fmtNum(prev - s.count)}
                </span>
              );
            } else {
              const rate = s.count / prev;
              conv = (
                <span
                  className={`cc-pill ${rate >= 0.8 ? "cc-pill-ok" : rate >= 0.4 ? "cc-pill-warn" : "cc-pill-bad"}`}
                >
                  {pct(s.count, prev)}
                </span>
              );
              dropped = (
                <span className="cc-mono-cell" style={{ fontSize: 11.5, color: prev - s.count > 0 ? "var(--cc-bad)" : "var(--cc-fg-dim)" }}>
                  {prev - s.count > 0 ? `−${fmtNum(prev - s.count)}` : "0"}
                </span>
              );
            }

            return (
              <tr key={s.label}>
                <td className="cc-mono-cell" style={{ color: "var(--cc-fg-dim)", fontSize: 11.5 }}>
                  {i + 1}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "var(--cc-fg-dim)", marginTop: 2 }}>{s.definition}</div>
                </td>
                <td className="cc-mono-cell" style={{ fontSize: 15, fontWeight: 700 }}>
                  {fmtNum(s.count)}
                </td>
                <td>
                  <div
                    style={{
                      height: 8,
                      background: "var(--cc-bg-3)",
                      borderRadius: 2,
                      overflow: "hidden",
                      border: "1px solid var(--cc-border)",
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: "100%",
                        background: i === 0 ? "var(--cc-fg-dim)" : "var(--cc-accent)",
                      }}
                    />
                  </div>
                  <div className="cc-mono-cell" style={{ fontSize: 10.5, color: "var(--cc-fg-dim)", marginTop: 3 }}>
                    {top >= MIN_DENOMINATOR ? pct(s.count, top) : `${fmtNum(s.count)} of ${fmtNum(top)}`}
                  </div>
                </td>
                <td>{conv}</td>
                <td>{dropped}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Breakdown table (attribution) ────────────────────────────────────── */

export interface BreakdownRow {
  label: string;
  count: number;
  /** Secondary text under the label, e.g. the raw referrer or utm medium. */
  detail?: string;
  /** True for the "not recorded" bucket — rendered dimmed, still counted. */
  unrecorded?: boolean;
}

export function Breakdown({
  rows,
  total,
  emptyText,
  labelHeader,
}: {
  rows: BreakdownRow[];
  total: number;
  emptyText: string;
  labelHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="cc-table-empty" style={{ padding: 24 }}>
        {emptyText}
      </div>
    );
  }
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);

  return (
    <table className="cc-table">
      <thead>
        <tr>
          <th>{labelHeader}</th>
          <th style={{ width: 62 }}>Signups</th>
          <th style={{ width: 170 }}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.label}-${r.detail ?? ""}`}>
            <td style={{ color: r.unrecorded ? "var(--cc-fg-dim)" : "var(--cc-fg)" }}>
              <span style={{ fontWeight: r.unrecorded ? 400 : 600 }}>{r.label}</span>
              {r.detail && (
                <div className="cc-mono-cell" style={{ fontSize: 10.5, color: "var(--cc-fg-dim)", marginTop: 2, wordBreak: "break-all" }}>
                  {r.detail}
                </div>
              )}
            </td>
            <td className="cc-mono-cell" style={{ fontWeight: 700 }}>
              {fmtNum(r.count)}
            </td>
            <td>
              <div
                style={{
                  height: 7,
                  background: "var(--cc-bg-3)",
                  borderRadius: 2,
                  overflow: "hidden",
                  border: "1px solid var(--cc-border)",
                }}
              >
                <div
                  style={{
                    width: `${max === 0 ? 0 : Math.round((r.count / max) * 100)}%`,
                    height: "100%",
                    background: r.unrecorded ? "var(--cc-fg-dim)" : "var(--cc-accent)",
                  }}
                />
              </div>
              <div className="cc-mono-cell" style={{ fontSize: 10.5, color: "var(--cc-fg-dim)", marginTop: 3 }}>
                {total >= MIN_DENOMINATOR ? pct(r.count, total) : `${fmtNum(r.count)} of ${fmtNum(total)}`}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Small note strip ─────────────────────────────────────────────────── */

export function Note({ tone, children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const bg = tone === "warn" ? "rgba(209,139,26,0.08)" : "rgba(77,138,214,0.07)";
  const bd = tone === "warn" ? "rgba(209,139,26,0.32)" : "rgba(77,138,214,0.28)";
  const fg = tone === "warn" ? "var(--cc-warn)" : "var(--cc-info)";
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${bd}`,
        borderRadius: 4,
        padding: "8px 11px",
        fontSize: 11.5,
        color: fg,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
