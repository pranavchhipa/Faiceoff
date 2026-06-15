/**
 * "Needs you" — unified action inbox for the Control Centre.
 *
 * One screen that aggregates EVERY pending operator action so a non-technical
 * operator can handle the whole platform from a single place. It does NOT add
 * new actions — each section previews the few most-recent pending items for a
 * queue and links straight to that queue's detail/page where the real
 * approve / pay / resolve / reply lives.
 *
 * Sections are ordered by urgency: brand verifications, creator verifications,
 * payouts, disputes (money + onboarding blockers first), then support tickets,
 * then stuck generations (moderation). Counts come from getPendingCounts();
 * each section runs ONE lightweight limit-5 preview query, all in parallel.
 *
 * Empty queues are shown ("Nothing pending") rather than hidden — the operator
 * should be able to see, at a glance, that a queue is clear.
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { getPendingCounts } from "@/lib/cc/overview";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

const PREVIEW_LIMIT = 5;

function relativeFrom(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

function truncate(text: string | null | undefined, n: number): string {
  if (!text) return "—";
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// ─── Row shapes for the preview queries ──────────────────────────────────────

interface BrandVerRow {
  id: string;
  brand_id: string;
  status: string;
  company_name: string | null;
  submitted_at: string | null;
}
interface CreatorVerRow {
  id: string;
  creator_id: string;
  status: string;
  submitted_at: string | null;
}
interface PayoutRow {
  id: string;
  creator_id: string | null;
  net_amount_paise: number | null;
  status: string;
  requested_at: string | null;
}
interface DisputeRow {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
}
interface TicketRow {
  id: string;
  user_id: string;
  role: string;
  subject: string;
  status: string;
  priority: string;
  has_unread_for_operator: boolean;
  updated_at: string;
}
interface StuckGenRow {
  id: string;
  status: string;
  brand_id: string;
  created_at: string;
}

export default async function InboxPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "inbox.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const stuckBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Counts (section headers) + all preview queries in parallel. Limit 5 each.
  const [
    pending,
    brandVerRes,
    creatorVerRes,
    payoutRes,
    disputeRes,
    ticketRes,
    stuckRes,
  ] = await Promise.all([
    getPendingCounts(),
    admin
      .from("brand_verifications")
      .select("id, brand_id, status, company_name, submitted_at")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(PREVIEW_LIMIT),
    admin
      .from("creator_verifications")
      .select("id, creator_id, status, submitted_at")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(PREVIEW_LIMIT),
    admin
      .from("creator_payouts")
      .select("id, creator_id, net_amount_paise, status, requested_at")
      .in("status", ["requested", "processing"])
      .order("requested_at", { ascending: true, nullsFirst: false })
      .limit(PREVIEW_LIMIT),
    admin
      .from("disputes")
      .select("id, status, reason, created_at")
      .in("status", ["open", "investigating"])
      .order("created_at", { ascending: false })
      .limit(PREVIEW_LIMIT),
    admin
      .from("support_tickets")
      .select("id, user_id, role, subject, status, priority, has_unread_for_operator, updated_at")
      .in("status", ["open", "in_progress", "waiting_on_user"])
      .order("updated_at", { ascending: false })
      .limit(PREVIEW_LIMIT),
    admin
      .from("generations")
      .select("id, status, brand_id, created_at")
      .in("status", ["draft", "compliance_check", "generating", "output_check"])
      .lt("created_at", stuckBefore)
      .order("created_at", { ascending: true })
      .limit(PREVIEW_LIMIT),
  ]);

  const brandVers = (brandVerRes.data ?? []) as BrandVerRow[];
  const creatorVers = (creatorVerRes.data ?? []) as CreatorVerRow[];
  const payouts = (payoutRes.data ?? []) as PayoutRow[];
  const disputes = (disputeRes.data ?? []) as DisputeRow[];
  const tickets = (ticketRes.data ?? []) as TicketRow[];
  const stuck = (stuckRes.data ?? []) as StuckGenRow[];

  // Hydrate names cheaply: brands.company_name + creators(user:users(display_name)).
  const brandIds = brandVers.map((v) => v.brand_id);
  const creatorIds = [
    ...creatorVers.map((v) => v.creator_id),
    ...payouts.map((p) => p.creator_id).filter((x): x is string => Boolean(x)),
  ];
  const ticketUserIds = tickets.map((t) => t.user_id);

  const [brandsRes, creatorsRes, usersRes] = await Promise.all([
    brandIds.length
      ? admin.from("brands").select("id, company_name").in("id", brandIds)
      : Promise.resolve({ data: [] }),
    creatorIds.length
      ? admin
          .from("creators")
          .select("id, user:users(display_name)")
          .in("id", Array.from(new Set(creatorIds)))
      : Promise.resolve({ data: [] }),
    ticketUserIds.length
      ? admin.from("users").select("id, display_name, email").in("id", ticketUserIds)
      : Promise.resolve({ data: [] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brandName = new Map<string, string>(
    ((brandsRes.data ?? []) as any[]).map((b) => [b.id, b.company_name ?? "Brand"]),
  );
  const creatorName = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((creatorsRes.data ?? []) as any[]).map((c) => [
      c.id,
      c.user?.display_name ?? "Creator",
    ]),
  );
  const userName = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((usersRes.data ?? []) as any[]).map((u) => [
      u.id,
      u.display_name ?? u.email ?? "User",
    ]),
  );

  const allClear = pending.total === 0;

  return (
    <>
      <PageHeader
        title="Needs you"
        subtitle="Everything pending across the platform — click any item to act on it"
      />

      <div className="cc-stack">
        {/* One-line summary banner */}
        <div
          className="cc-card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderColor: allClear ? "var(--cc-ok)" : "var(--cc-accent)",
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: allClear ? "var(--cc-ok)" : "var(--cc-accent)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {allClear ? "✓" : pending.total}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {allClear
              ? "You're all caught up ✓"
              : `You have ${pending.total} thing${pending.total === 1 ? "" : "s"} to handle`}
          </span>
        </div>

        {/* ── Brand verifications ─────────────────────────────────────── */}
        <Section
          title="Brand verifications"
          blurb="Brands waiting on GST / PAN review before they can collaborate"
          count={pending.brandVerify}
          seeAllHref={`/${ccSlug}/brand-verifications`}
          tone="bad"
        >
          {brandVers.map((v) => (
            <PreviewRow
              key={v.id}
              href={`/${ccSlug}/brand-verifications/${v.id}`}
              primary={v.company_name ?? brandName.get(v.brand_id) ?? "Brand"}
              meta={`submitted ${relativeFrom(v.submitted_at)}`}
              pillText="pending"
              pillClass="cc-pill-warn"
            />
          ))}
        </Section>

        {/* ── Creator verifications ───────────────────────────────────── */}
        <Section
          title="Creator verifications"
          blurb="Creators waiting on KYC review before they earn the gold tick + payouts"
          count={pending.creatorVerify}
          seeAllHref={`/${ccSlug}/verifications`}
          tone="bad"
        >
          {creatorVers.map((v) => (
            <PreviewRow
              key={v.id}
              href={`/${ccSlug}/verifications/${v.id}`}
              primary={creatorName.get(v.creator_id) ?? "Creator"}
              meta={`submitted ${relativeFrom(v.submitted_at)}`}
              pillText="pending"
              pillClass="cc-pill-warn"
            />
          ))}
        </Section>

        {/* ── Payouts ─────────────────────────────────────────────────── */}
        <Section
          title="Payouts to disburse"
          blurb="Creators waiting on a manual RazorpayX transfer, then mark paid"
          count={pending.payouts}
          seeAllHref={`/${ccSlug}/payouts`}
          tone="bad"
        >
          {payouts.map((p) => (
            <PreviewRow
              key={p.id}
              href={`/${ccSlug}/payouts`}
              primary={(p.creator_id && creatorName.get(p.creator_id)) || "Creator"}
              meta={`requested ${relativeFrom(p.requested_at)}`}
              right={fmt(p.net_amount_paise)}
              pillText={p.status}
              pillClass="cc-pill-warn"
            />
          ))}
        </Section>

        {/* ── Disputes ────────────────────────────────────────────────── */}
        <Section
          title="Disputes"
          blurb="Open complaints to investigate and resolve (refund or no action)"
          count={pending.disputes}
          seeAllHref={`/${ccSlug}/disputes`}
          tone="bad"
        >
          {disputes.map((d) => (
            <PreviewRow
              key={d.id}
              href={`/${ccSlug}/disputes/${d.id}`}
              primary={truncate(d.reason, 70)}
              meta={`raised ${relativeFrom(d.created_at)}`}
              pillText={d.status.replace("_", " ")}
              pillClass={d.status === "open" ? "cc-pill-bad" : "cc-pill-warn"}
            />
          ))}
        </Section>

        {/* ── Support tickets ─────────────────────────────────────────── */}
        <Section
          title="Support tickets"
          blurb="Creator + brand requests waiting on a reply or resolution"
          count={pending.tickets}
          seeAllHref={`/${ccSlug}/tickets`}
          tone="warn"
        >
          {tickets.map((t) => (
            <PreviewRow
              key={t.id}
              href={`/${ccSlug}/tickets/${t.id}`}
              primary={t.subject}
              meta={`${t.role} · ${userName.get(t.user_id) ?? "—"} · ${relativeFrom(t.updated_at)}`}
              dot={t.has_unread_for_operator}
              pillText={t.status.replace(/_/g, " ")}
              pillClass={
                t.status === "open"
                  ? "cc-pill-bad"
                  : t.status === "in_progress"
                    ? "cc-pill-warn"
                    : "cc-pill-info"
              }
            />
          ))}
        </Section>

        {/* ── Stuck generations (moderation) ──────────────────────────── */}
        <Section
          title="Stuck generations"
          blurb="Pipeline jobs wedged >24h — retry or force-discard from Moderation"
          count={pending.stuckGens}
          seeAllHref={`/${ccSlug}/moderation`}
          tone="warn"
        >
          {stuck.map((g) => (
            <PreviewRow
              key={g.id}
              href={`/${ccSlug}/moderation`}
              primary={`${brandName.get(g.brand_id) ?? "Brand"} · gen ${g.id.slice(0, 8)}…`}
              meta={`stuck since ${relativeFrom(g.created_at)}`}
              pillText={g.status}
              pillClass="cc-pill-warn"
            />
          ))}
        </Section>
      </div>
    </>
  );
}

// ─── Section wrapper: heading + count + preview rows + "see all" ─────────────

function Section({
  title,
  blurb,
  count,
  seeAllHref,
  tone,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  seeAllHref: string;
  tone: "bad" | "warn";
  children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children : [children];
  const hasItems = count > 0 && childArray.some(Boolean);
  const badgeColor = count === 0 ? "var(--cc-ok)" : tone === "bad" ? "var(--cc-bad)" : "var(--cc-warn)";

  return (
    <div className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header: title + count + see-all */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid var(--cc-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{title}</h3>
          <span
            className="cc-pill"
            style={{
              background: count === 0 ? "rgba(31,170,106,0.12)" : "var(--cc-bg-3)",
              color: badgeColor,
              border: "1px solid var(--cc-border)",
            }}
          >
            {count}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--cc-fg-dim)" }}>{blurb}</span>
        </div>
        <Link
          href={seeAllHref}
          className="cc-btn"
          style={{ fontSize: 11.5, whiteSpace: "nowrap" }}
        >
          See all {count} →
        </Link>
      </div>

      {/* Body: preview rows, or "Nothing pending" */}
      {hasItems ? (
        <div>{children}</div>
      ) : (
        <div
          style={{
            padding: "16px",
            fontSize: 12.5,
            color: "var(--cc-fg-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "var(--cc-ok)" }}>✓</span> Nothing pending — this queue is clear.
        </div>
      )}
    </div>
  );
}

// ─── Single clickable preview row ────────────────────────────────────────────

function PreviewRow({
  href,
  primary,
  meta,
  right,
  pillText,
  pillClass,
  dot,
}: {
  href: string;
  primary: string;
  meta: string;
  right?: string;
  pillText: string;
  pillClass: string;
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      className="cc-inbox-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: "1px solid var(--cc-border)",
        textDecoration: "none",
        color: "var(--cc-fg)",
      }}
    >
      {dot && (
        <span
          style={{
            flexShrink: 0,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--cc-bad)",
          }}
        />
      )}
      <span className={`cc-pill ${pillClass}`} style={{ flexShrink: 0 }}>
        {pillText}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {primary}
        </span>
        <span style={{ fontSize: 11, color: "var(--cc-fg-dim)" }}>{meta}</span>
      </span>
      {right && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--cc-accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {right}
        </span>
      )}
      <span style={{ flexShrink: 0, color: "var(--cc-fg-dim)", fontSize: 13 }}>→</span>
    </Link>
  );
}
