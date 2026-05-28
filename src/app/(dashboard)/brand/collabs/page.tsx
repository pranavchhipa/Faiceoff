"use client";

/**
 * /brand/collabs — "Your collabs" (dark editorial)
 *
 * Redesigned in the same Claude Design aesthetic as the creator profile +
 * brand discover. Data layer unchanged — still fetches /api/collabs and
 * splits into active vs past. Visual / layout / motion all rewritten.
 *
 * Sections (top to bottom):
 *   - Page header (title + count subtitle + Start new collab CTA)
 *   - Pending requests nudge (only if any are pending/accepted)
 *   - 4-stat tile strip (Active / Completed / Images / Total spent)
 *   - Active section — 2-col card grid
 *   - Past section — compact row list
 *
 * Styles are inlined in a single <style> block scoped under .fco-collabs-v2.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileImage,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";

/* ───────── Types ───────── */

interface Collab {
  id: string;
  name: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  final_images_target: number | null;
  approved_count: number;
  gen_credits_total: number | null;
  gen_credits_used: number;
  counterpart_name: string;
  counterpart_avatar_url: string | null;
  product_image_url: string | null;
  is_legacy: boolean;
  created_at: string;
}

/* ───────── Format helpers ───────── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/* ───────── Status + tier meta (dark editorial palette) ───────── */

const STATUS_META: Record<
  string,
  { label: string; dot: string; tint: string }
> = {
  active:    { label: "Active",    dot: "#5fb37a", tint: "rgba(95, 179, 122, 0.14)" },
  completed: { label: "Completed", dot: "#e8825d", tint: "rgba(232, 130, 93, 0.14)" },
  paused:    { label: "Paused",    dot: "#d4a557", tint: "rgba(212, 165, 87, 0.14)" },
};

const TIER_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }> }
> = {
  frame:   { label: "Frame",   icon: ImageIcon },
  feature: { label: "Feature", icon: Zap },
  cover:   { label: "Cover",   icon: Sparkles },
};

/* ───────── Faiceoff verified seal (defs + usage) ───────── */

function FaSealDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="faSealCollabs" cx="34" cy="28" r="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#f0c34a" />
          <stop offset="0.85" stopColor="#a87a2a" />
          <stop offset="1" stopColor="#7a5418" />
        </radialGradient>
        <symbol id="faSealCollabsSym" viewBox="0 0 100 100">
          <g fill="url(#faSealCollabs)">
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

function Seal({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <use href="#faSealCollabsSym" />
    </svg>
  );
}

/* ───────── Page ───────── */

export default function BrandCollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collabs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { collabs: [], pending_payments: [] }))
      .then((d) => {
        setCollabs(d.collabs ?? []);
        const reqs = (d.pending_payments ?? []) as { status: string }[];
        setPendingRequestCount(
          reqs.filter((r) => r.status === "pending" || r.status === "accepted")
            .length,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const active = collabs.filter((c) => c.status === "active");
  const past = collabs.filter((c) => c.status !== "active");

  // Aggregate stats
  const totalApproved = collabs.reduce(
    (s, c) => s + (c.approved_count ?? 0),
    0,
  );
  const totalImagesTarget = collabs.reduce(
    (s, c) => s + (c.final_images_target ?? 0),
    0,
  );
  const totalSpentPaise = collabs.reduce(
    (s, c) => s + (c.package_price_paise ?? 0),
    0,
  );

  return (
    <div className="fco-collabs-v2">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <FaSealDefs />

      <main className="page">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="ph">
          <div className="ph-left">
            <div className="eyebrow">
              <Megaphone size={11} strokeWidth={2.2} />
              Collabs
            </div>
            <h1 className="ph-title">Your collabs</h1>
            <p className="ph-sub">
              Live workspaces with creators you&apos;ve paid. Each one bundles
              Studio, Chat, and Vault.
            </p>
          </div>
          <Link href="/brand/discover" className="cta-primary">
            <Plus size={14} strokeWidth={2.4} />
            Start new collab
          </Link>
        </header>

        {/* ── Pending requests nudge ───────────────────────────────── */}
        {!loading && pendingRequestCount > 0 && (
          <Link href="/brand/requests" className="nudge">
            <span className="nudge-icon">
              <Send size={15} strokeWidth={2} />
            </span>
            <div className="nudge-body">
              <div className="nudge-title">
                {pendingRequestCount}{" "}
                {pendingRequestCount === 1 ? "request" : "requests"} in progress
              </div>
              <div className="nudge-sub">
                Track replies + payment status on the Requests page.
              </div>
            </div>
            <span className="nudge-cta">
              View requests <ArrowRight size={13} strokeWidth={2.4} />
            </span>
          </Link>
        )}

        {/* ── Stats strip ──────────────────────────────────────────── */}
        {!loading && collabs.length > 0 && (
          <div className="stats">
            <StatTile
              icon={Zap}
              label="Active"
              value={active.length.toString()}
              accent={active.length > 0}
            />
            <StatTile
              icon={CheckCircle2}
              label="Completed"
              value={past.length.toString()}
            />
            <StatTile
              icon={ImageIcon}
              label="Images"
              value={`${totalApproved}/${totalImagesTarget || 0}`}
              sub="approved"
            />
            <StatTile
              icon={Megaphone}
              label="Total spent"
              value={formatINR(totalSpentPaise)}
            />
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────── */}
        {loading && (
          <>
            <div className="stats">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stat-skel" />
              ))}
            </div>
            <div className="section-head">
              <span className="section-skel" />
            </div>
            <div className="cards">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-skel" />
              ))}
            </div>
          </>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {!loading && collabs.length === 0 && (
          <EmptyState pendingRequests={pendingRequestCount} />
        )}

        {/* ── Active section ───────────────────────────────────────── */}
        {!loading && active.length > 0 && (
          <section className="section">
            <div className="section-head">
              <span className="section-label active">Active</span>
              <span className="section-count">{active.length}</span>
            </div>
            <div className="cards">
              {active.map((c) => (
                <CollabCard key={c.id} collab={c} />
              ))}
            </div>
          </section>
        )}

        {/* ── Past section ─────────────────────────────────────────── */}
        {!loading && past.length > 0 && (
          <section className="section">
            <div className="section-head">
              <span className="section-label past">Past</span>
              <span className="section-count">{past.length}</span>
            </div>
            <div className="rows">
              {past.map((c) => (
                <CollabRow key={c.id} collab={c} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ───────── Stat tile ───────── */

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "stat-accent" : ""}`}>
      <div className="stat-head">
        <span className="stat-icon">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ───────── Collab card (active — large) ───────── */

function CollabCard({ collab }: { collab: Collab }) {
  const status = STATUS_META[collab.status] ?? STATUS_META.active;
  const tier = collab.package_tier ? TIER_META[collab.package_tier] : null;
  const TierIcon = tier?.icon;

  const progress =
    collab.final_images_target && collab.final_images_target > 0
      ? Math.round((collab.approved_count / collab.final_images_target) * 100)
      : null;

  const creditsLeft =
    collab.gen_credits_total != null
      ? collab.gen_credits_total - collab.gen_credits_used
      : null;

  return (
    <Link href={`/brand/collabs/${collab.id}`} className="card">
      {/* Product image (left) */}
      <div className="card-img">
        {collab.product_image_url ? (
          <Image
            src={collab.product_image_url}
            alt={collab.name}
            fill
            sizes="160px"
            className="card-img-el"
            unoptimized
          />
        ) : (
          <div className="card-img-fallback">
            <FileImage size={26} strokeWidth={1.5} />
          </div>
        )}
        <span
          className="status-pill"
          style={{ background: status.tint, borderColor: status.dot }}
        >
          <span
            className="status-dot"
            style={{ background: status.dot }}
            aria-hidden
          />
          {status.label}
        </span>
      </div>

      {/* Content (right) */}
      <div className="card-body">
        <div className="card-top">
          <div className="card-title-row">
            <h3 className="card-title">{collab.name}</h3>
            {tier && TierIcon && (
              <span className="tier-pill">
                <TierIcon size={10} strokeWidth={2.2} />
                {tier.label}
              </span>
            )}
          </div>
          <div className="counterpart">
            {collab.counterpart_avatar_url ? (
              <Image
                src={collab.counterpart_avatar_url}
                alt=""
                width={18}
                height={18}
                className="counterpart-avatar"
                unoptimized
              />
            ) : (
              <span className="counterpart-fallback">
                {collab.counterpart_name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="counterpart-name">
              with {collab.counterpart_name}
            </span>
            <Seal size={12} />
          </div>
        </div>

        <div className="card-bottom">
          {progress !== null && (
            <>
              <div className="progress-row">
                <span className="progress-text">
                  <strong>{collab.approved_count}</strong>/
                  {collab.final_images_target} approved
                </span>
                {creditsLeft !== null && (
                  <span className="credits-left">
                    <Zap size={10} strokeWidth={2.2} />
                    {creditsLeft} credits left
                  </span>
                )}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </>
          )}
          <div className="open-cta">
            Open workspace <ArrowRight size={12} strokeWidth={2.4} />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ───────── Collab row (past — compact) ───────── */

function CollabRow({ collab }: { collab: Collab }) {
  const status = STATUS_META[collab.status] ?? STATUS_META.completed;

  return (
    <Link href={`/brand/collabs/${collab.id}`} className="row">
      <div className="row-img">
        {collab.product_image_url ? (
          <Image
            src={collab.product_image_url}
            alt={collab.name}
            fill
            sizes="56px"
            className="row-img-el"
            unoptimized
          />
        ) : (
          <div className="row-img-fallback">
            <FileImage size={14} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="row-body">
        <div className="row-name">{collab.name}</div>
        <div className="row-meta">
          <span style={{ color: status.dot, fontWeight: 600 }}>
            {status.label}
          </span>
          <span className="row-sep">·</span>
          <span>with {collab.counterpart_name}</span>
          <span className="row-sep">·</span>
          <span>
            {collab.approved_count}/{collab.final_images_target ?? 0} images
          </span>
        </div>
      </div>
      <ArrowRight className="row-arrow" size={14} strokeWidth={2} />
    </Link>
  );
}

/* ───────── Empty state ───────── */

function EmptyState({ pendingRequests }: { pendingRequests: number }) {
  const hasPending = pendingRequests > 0;
  return (
    <div className="empty">
      <div className="empty-icon">
        <Megaphone size={22} strokeWidth={1.8} />
      </div>
      <h2 className="empty-title">No active collabs yet</h2>
      <p className="empty-sub">
        {hasPending
          ? "Once a creator accepts your request and you pay, the collab lands here."
          : "Discover a creator and send a collab request to get started."}
      </p>
      <Link
        href={hasPending ? "/brand/requests" : "/brand/discover"}
        className="empty-cta"
      >
        {hasPending ? "View requests" : "Discover creators"}
        <ArrowRight size={13} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

/* ───────── Page-scoped CSS ─────────
   All selectors prefixed with .fco-collabs-v2 so the dark editorial styles
   don't leak into the surrounding dashboard chrome (sidebar / topbar). */
const PAGE_CSS = `
.fco-collabs-v2 {
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
  --success: #5fb37a;
  --gold: #d4a557;
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-label: 'Plus Jakarta Sans', system-ui, sans-serif;

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
.fco-collabs-v2 *, .fco-collabs-v2 *::before, .fco-collabs-v2 *::after { box-sizing: border-box; }
.fco-collabs-v2 ::selection { background: var(--accent); color: var(--bg); }

/* Page-scoped film grain */
.fco-collabs-v2::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.045;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}

.fco-collabs-v2 .page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

/* ── Page header ── */
.fco-collabs-v2 .ph {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 28px;
}
.fco-collabs-v2 .ph-left { min-width: 0; flex: 1; }
.fco-collabs-v2 .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 8px;
}
.fco-collabs-v2 .ph-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 44px;
  letter-spacing: -0.035em;
  line-height: 1;
  margin: 0 0 12px;
  color: var(--text);
}
.fco-collabs-v2 .ph-sub {
  color: var(--muted);
  font-size: 14px;
  max-width: 520px;
  margin: 0;
}
.fco-collabs-v2 .cta-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--accent);
  color: #1a0f08;
  border-radius: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13.5px;
  letter-spacing: -0.01em;
  text-decoration: none;
  flex-shrink: 0;
  transition: transform 200ms cubic-bezier(.2,.7,.2,1), background 200ms ease, box-shadow 200ms ease;
  box-shadow: 0 8px 24px -8px rgba(232, 130, 93, 0.45);
}
.fco-collabs-v2 .cta-primary:hover {
  background: #ec8e6a;
  transform: translateY(-1px);
  box-shadow: 0 12px 30px -8px rgba(232, 130, 93, 0.55);
}

/* ── Pending requests nudge ── */
.fco-collabs-v2 .nudge {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: var(--accent-soft);
  border: 1px solid rgba(232, 130, 93, 0.3);
  border-radius: 14px;
  margin-bottom: 24px;
  text-decoration: none;
  color: var(--text);
  transition: background 180ms ease, border-color 180ms ease;
}
.fco-collabs-v2 .nudge:hover {
  background: rgba(232, 130, 93, 0.18);
  border-color: var(--accent);
}
.fco-collabs-v2 .nudge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(232, 130, 93, 0.22);
  color: var(--accent);
  flex-shrink: 0;
}
.fco-collabs-v2 .nudge-body { flex: 1; min-width: 0; }
.fco-collabs-v2 .nudge-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
  letter-spacing: -0.01em;
}
.fco-collabs-v2 .nudge-sub {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--muted);
}
.fco-collabs-v2 .nudge-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  flex-shrink: 0;
}

/* ── Stats strip ── */
.fco-collabs-v2 .stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 36px;
}
@media (max-width: 700px) {
  .fco-collabs-v2 .stats { grid-template-columns: repeat(2, 1fr); }
}
.fco-collabs-v2 .stat {
  padding: 16px;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 14px;
  transition: border-color 200ms ease;
}
.fco-collabs-v2 .stat:hover { border-color: var(--hair); }
.fco-collabs-v2 .stat-accent {
  border-color: rgba(95, 179, 122, 0.3);
  background: linear-gradient(180deg, rgba(95, 179, 122, 0.06), var(--elev) 70%);
}
.fco-collabs-v2 .stat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.fco-collabs-v2 .stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--overlay);
  border: 1px solid var(--hair);
  color: var(--muted);
}
.fco-collabs-v2 .stat-accent .stat-icon {
  background: rgba(95, 179, 122, 0.15);
  border-color: rgba(95, 179, 122, 0.3);
  color: var(--success);
}
.fco-collabs-v2 .stat-label {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dim);
}
.fco-collabs-v2 .stat-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 26px;
  letter-spacing: -0.025em;
  color: var(--text);
  line-height: 1;
}
.fco-collabs-v2 .stat-sub {
  margin-top: 4px;
  font-family: var(--font-label);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--dim);
}

/* ── Section ── */
.fco-collabs-v2 .section { margin-top: 8px; margin-bottom: 32px; }
.fco-collabs-v2 .section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.fco-collabs-v2 .section-label {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.fco-collabs-v2 .section-label.active { color: var(--success); }
.fco-collabs-v2 .section-label.past { color: var(--muted); }
.fco-collabs-v2 .section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--overlay);
  border: 1px solid var(--hair);
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text);
}

/* ── Cards grid (active) ── */
.fco-collabs-v2 .cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
@media (max-width: 900px) {
  .fco-collabs-v2 .cards { grid-template-columns: 1fr; }
}

/* ── Active card ── */
.fco-collabs-v2 .card {
  display: flex;
  gap: 0;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 280ms cubic-bezier(.2,.7,.2,1), border-color 280ms ease, box-shadow 280ms ease;
}
.fco-collabs-v2 .card:hover {
  transform: translateY(-2px);
  border-color: var(--hair);
  box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.55);
}
.fco-collabs-v2 .card-img {
  position: relative;
  width: 160px;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  background: var(--overlay);
}
@media (max-width: 480px) {
  .fco-collabs-v2 .card-img { width: 120px; }
}
.fco-collabs-v2 .card-img-el {
  object-fit: cover;
  display: block;
  transition: transform 520ms cubic-bezier(.2,.7,.2,1), filter 320ms ease;
  filter: saturate(0.94) contrast(1.02);
}
.fco-collabs-v2 .card:hover .card-img-el {
  transform: scale(1.04);
  filter: saturate(1) contrast(1.05);
}
.fco-collabs-v2 .card-img-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dim);
}
.fco-collabs-v2 .status-pill {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid;
  border-radius: 999px;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.fco-collabs-v2 .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

.fco-collabs-v2 .card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 18px;
  gap: 14px;
}
.fco-collabs-v2 .card-top { min-width: 0; }
.fco-collabs-v2 .card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.fco-collabs-v2 .card-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.fco-collabs-v2 .tier-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--accent-soft);
  border: 1px solid rgba(232, 130, 93, 0.3);
  border-radius: 999px;
  font-family: var(--font-label);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  flex-shrink: 0;
  white-space: nowrap;
}
.fco-collabs-v2 .counterpart {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--muted);
  min-width: 0;
}
.fco-collabs-v2 .counterpart-avatar {
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.fco-collabs-v2 .counterpart-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--overlay);
  border: 1px solid var(--hair);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 9.5px;
  color: var(--text);
  flex-shrink: 0;
}
.fco-collabs-v2 .counterpart-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fco-collabs-v2 .card-bottom { min-width: 0; }
.fco-collabs-v2 .progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-family: var(--font-label);
  font-size: 11px;
  color: var(--dim);
}
.fco-collabs-v2 .progress-text strong {
  color: var(--text);
  font-weight: 700;
}
.fco-collabs-v2 .credits-left {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-weight: 600;
}
.fco-collabs-v2 .progress-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--overlay);
  overflow: hidden;
  margin-bottom: 10px;
}
.fco-collabs-v2 .progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-deep));
  border-radius: 999px;
  transition: width 360ms cubic-bezier(.2,.7,.2,1);
}
.fco-collabs-v2 .open-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  transition: transform 220ms ease;
}
.fco-collabs-v2 .card:hover .open-cta { transform: translateX(3px); }

/* ── Past rows ── */
.fco-collabs-v2 .rows {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 700px) {
  .fco-collabs-v2 .rows { grid-template-columns: 1fr; }
}
.fco-collabs-v2 .row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: border-color 200ms ease, background 200ms ease;
}
.fco-collabs-v2 .row:hover {
  border-color: var(--hair);
  background: var(--overlay);
}
.fco-collabs-v2 .row-img {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--overlay);
  flex-shrink: 0;
}
.fco-collabs-v2 .row-img-el { object-fit: cover; display: block; }
.fco-collabs-v2 .row-img-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dim);
}
.fco-collabs-v2 .row-body { flex: 1; min-width: 0; }
.fco-collabs-v2 .row-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.fco-collabs-v2 .row-meta {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fco-collabs-v2 .row-sep { color: var(--dim); }
.fco-collabs-v2 .row-arrow {
  color: var(--dim);
  flex-shrink: 0;
  transition: transform 200ms ease, color 200ms ease;
}
.fco-collabs-v2 .row:hover .row-arrow {
  color: var(--text);
  transform: translateX(2px);
}

/* ── Empty state ── */
.fco-collabs-v2 .empty {
  padding: 72px 24px;
  text-align: center;
  border: 1px dashed var(--hair);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(232, 130, 93, 0.025), transparent 60%);
}
.fco-collabs-v2 .empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--elev);
  border: 1px solid var(--hair);
  margin: 0 auto 20px;
  color: var(--muted);
}
.fco-collabs-v2 .empty-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.02em;
  margin: 0 0 10px;
  color: var(--text);
}
.fco-collabs-v2 .empty-sub {
  color: var(--muted);
  font-size: 14px;
  margin: 0 auto 24px;
  max-width: 420px;
}
.fco-collabs-v2 .empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: var(--accent);
  color: #1a0f08;
  border-radius: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13.5px;
  text-decoration: none;
  transition: transform 180ms ease, background 180ms ease;
}
.fco-collabs-v2 .empty-cta:hover {
  background: #ec8e6a;
  transform: translateY(-1px);
}

/* ── Skeletons ── */
.fco-collabs-v2 .stat-skel {
  height: 96px;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 14px;
  position: relative;
  overflow: hidden;
}
.fco-collabs-v2 .stat-skel::after,
.fco-collabs-v2 .card-skel::after,
.fco-collabs-v2 .section-skel::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(168, 149, 112, 0.06) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: fco-collabs-shimmer 1.6s linear infinite;
}
.fco-collabs-v2 .section-skel {
  display: inline-block;
  height: 14px;
  width: 120px;
  border-radius: 4px;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  position: relative;
  overflow: hidden;
}
.fco-collabs-v2 .card-skel {
  height: 192px;
  background: var(--elev);
  border: 1px solid var(--hair-soft);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
}
@keyframes fco-collabs-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* ── Responsive ── */
@media (max-width: 700px) {
  .fco-collabs-v2 .page { padding: 22px 16px 60px; }
  .fco-collabs-v2 .ph { gap: 16px; }
  .fco-collabs-v2 .ph-title { font-size: 32px; }
  .fco-collabs-v2 .cta-primary { padding: 11px 16px; font-size: 12.5px; }
  .fco-collabs-v2 .stat-value { font-size: 22px; }
}
`;
