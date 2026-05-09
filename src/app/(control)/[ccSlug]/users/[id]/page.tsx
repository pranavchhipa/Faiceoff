/**
 * Per-user drill-down — full activity for one user (creator OR brand).
 *
 * Owner-only deep view. Shows everything a user is doing: profile, role-
 * specific stats, money flow, all generations they're tied to, all chat
 * conversations + recent messages, and the audit log of platform actions
 * scoped to them.
 *
 * All queries are read-only and parallel. Designed for quick scan, not
 * exhaustive paging — defaults: 100 generations, 50 messages, 200 audit.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth, PageHeader } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorRow {
  id: string;
  user_id: string;
  is_active: boolean;
  kyc_status: string | null;
  instagram_handle: string | null;
  bio: string | null;
  onboarding_step: number | null;
  dpdp_consent_at: string | null;
  created_at: string;
}

interface BrandRow {
  id: string;
  user_id: string;
  company_name: string | null;
  website_url: string | null;
  gst_number: string | null;
  industry: string | null;
  is_verified: boolean | null;
  credits_remaining: number | null;
  credits_lifetime_purchased: number | null;
  wallet_balance_paise: number | null;
  wallet_reserved_paise: number | null;
  created_at: string;
}

interface GenRow {
  id: string;
  status: string;
  image_url: string | null;
  cost_paise: number | null;
  retry_count: number | null;
  created_at: string;
  collab_session_id: string | null;
}

interface CollabRow {
  id: string;
  name: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  approved_count: number;
  final_images_target: number | null;
  created_at: string;
}

interface LicenseRow {
  id: string;
  generation_id: string;
  scope: string;
  amount_paid_paise: number;
  creator_share_paise: number;
  platform_share_paise: number;
  status: string;
  issued_at: string;
}

interface PayoutRow {
  id: string;
  amount_paise: number;
  status: string;
  created_at: string;
}

interface TopupRow {
  id: string;
  amount_paise: number;
  status: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  brand_id: string;
  creator_id: string;
  last_message_at: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string | null;
  attachment_url: string | null;
  created_at: string;
}

interface ApprovalRow {
  id: string;
  generation_id: string;
  status: string;
  feedback: string | null;
  expires_at: string;
  created_at: string;
}

interface RequestRow {
  id: string;
  brand_id: string;
  creator_id: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  product_name: string | null;
  expires_at: string;
  created_at: string;
}

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusPill(status: string): string {
  if (["approved", "active", "success", "completed", "paid", "delivered"].includes(status)) return "cc-pill-ok";
  if (["rejected", "failed", "discarded", "expired", "declined", "revoked"].includes(status)) return "cc-pill-bad";
  if (["pending", "ready_for_brand_review", "ready_for_approval", "compliance_check", "generating", "output_check", "draft", "processing", "requested", "investigating"].includes(status)) return "cc-pill-warn";
  return "cc-pill-neutral";
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[cc/users/[id]] query failed", err);
    return fallback;
  }
}

export default async function UserDrillDownPage({ params }: Props) {
  const { ccSlug, id: userId } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({
    action: "users.drilldown",
    sessionId: session?.id ?? null,
    targetType: "user",
    targetId: userId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Resolve user + role-specific row in parallel.
  const [userRes, creatorRes, brandRes] = await Promise.all([
    admin
      .from("users")
      .select("id, display_name, email, phone, role, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("creators")
      .select("id, user_id, is_active, kyc_status, instagram_handle, bio, onboarding_step, dpdp_consent_at, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("brands")
      .select("id, user_id, company_name, website_url, gst_number, industry, is_verified, credits_remaining, credits_lifetime_purchased, wallet_balance_paise, wallet_reserved_paise, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const user = userRes.data as UserRow | null;
  const creator = creatorRes.data as CreatorRow | null;
  const brand = brandRes.data as BrandRow | null;

  if (!user) notFound();

  // 2. Activity queries — gated by role
  const [
    generations,
    collabs,
    licenses,
    payouts,
    topups,
    conversations,
    approvalsForCreator,
    requestsForCreator,
    requestsForBrand,
    auditEntries,
  ] = await Promise.all([
    // Generations the user is tied to (as creator OR brand)
    safe(async () => {
      const { data } = await admin
        .from("generations")
        .select("id, status, image_url, cost_paise, retry_count, created_at, collab_session_id")
        .or([
          creator ? `creator_id.eq.${creator.id}` : "",
          brand ? `brand_id.eq.${brand.id}` : "",
        ].filter(Boolean).join(","))
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as GenRow[];
    }, [] as GenRow[]),

    // Collab sessions
    safe(async () => {
      const { data } = await admin
        .from("collab_sessions")
        .select("id, name, status, package_tier, package_price_paise, approved_count, final_images_target, created_at")
        .or([
          creator ? `creator_id.eq.${creator.id}` : "",
          brand ? `brand_id.eq.${brand.id}` : "",
        ].filter(Boolean).join(","))
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as CollabRow[];
    }, [] as CollabRow[]),

    // Licences
    safe(async () => {
      const { data } = await admin
        .from("licenses")
        .select("id, generation_id, scope, amount_paid_paise, creator_share_paise, platform_share_paise, status, issued_at")
        .or([
          creator ? `creator_id.eq.${creator.id}` : "",
          brand ? `brand_id.eq.${brand.id}` : "",
        ].filter(Boolean).join(","))
        .order("issued_at", { ascending: false })
        .limit(100);
      return (data ?? []) as LicenseRow[];
    }, [] as LicenseRow[]),

    // Creator payouts
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("creator_payouts")
        .select("id, amount_paise, status, created_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as PayoutRow[];
    }, [] as PayoutRow[]),

    // Brand top-ups
    safe(async () => {
      if (!brand) return [];
      const { data } = await admin
        .from("credit_top_ups")
        .select("id, amount_paise, status, created_at")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as TopupRow[];
    }, [] as TopupRow[]),

    // Chat conversations the user participates in
    safe(async () => {
      const orFilters = [
        creator ? `creator_id.eq.${creator.id}` : "",
        brand ? `brand_id.eq.${brand.id}` : "",
      ].filter(Boolean).join(",");
      if (!orFilters) return [];
      const { data } = await admin
        .from("conversations")
        .select("id, brand_id, creator_id, last_message_at, created_at")
        .or(orFilters)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(20);
      return (data ?? []) as ConversationRow[];
    }, [] as ConversationRow[]),

    // Approval queue for creator (pending decisions on their face)
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("approvals")
        .select("id, generation_id, status, feedback, expires_at, created_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as ApprovalRow[];
    }, [] as ApprovalRow[]),

    // Collab requests sent to creator
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("collab_requests")
        .select("id, brand_id, creator_id, status, package_tier, package_price_paise, product_name, expires_at, created_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as RequestRow[];
    }, [] as RequestRow[]),

    // Collab requests sent by brand
    safe(async () => {
      if (!brand) return [];
      const { data } = await admin
        .from("collab_requests")
        .select("id, brand_id, creator_id, status, package_tier, package_price_paise, product_name, expires_at, created_at")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as RequestRow[];
    }, [] as RequestRow[]),

    // Owner-audit-log entries scoped to this user
    safe(async () => {
      const { data } = await admin
        .from("owner_audit_log")
        .select("id, action, target_type, target_id, ip, created_at")
        .or(`target_id.eq.${userId},and(target_type.eq.user,target_id.eq.${userId})`)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Array<{ id: string; action: string; target_type: string | null; target_id: string | null; ip: string | null; created_at: string }>;
    }, []),
  ]);

  // 3. Hydrate recent messages for the active conversations
  const conversationIds = conversations.map((c) => c.id);
  const recentMessages = conversationIds.length > 0
    ? await safe(async () => {
        const { data } = await admin
          .from("conversation_messages")
          .select("id, conversation_id, sender_user_id, sender_role, body, attachment_url, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(50);
        return (data ?? []) as MessageRow[];
      }, [] as MessageRow[])
    : [];

  // 4. Aggregate KPIs
  const lifetimeEarnedPaise = licenses.reduce((s, l) => s + (l.creator_share_paise ?? 0), 0);
  const lifetimeSpentPaise = brand ? licenses.reduce((s, l) => s + (l.amount_paid_paise ?? 0), 0) : 0;
  const totalPayoutsPaise = payouts.filter((p) => p.status === "success").reduce((s, p) => s + p.amount_paise, 0);
  const totalTopupsPaise = topups.filter((t) => t.status === "success").reduce((s, t) => s + t.amount_paise, 0);
  const approvedCount = generations.filter((g) => g.status === "approved").length;
  const rejectedCount = generations.filter((g) => g.status === "rejected").length;
  const failedCount = generations.filter((g) => g.status === "failed").length;
  const activeCollabs = collabs.filter((c) => c.status === "active").length;

  const isCreator = !!creator;
  const isBrand = !!brand;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link
          href={`/${ccSlug}/users`}
          style={{ fontSize: 11, color: "var(--cc-fg-muted)", textDecoration: "none", fontFamily: "var(--cc-mono)", letterSpacing: "0.08em" }}
        >
          ← Back to users
        </Link>
      </div>

      <PageHeader
        title={user.display_name ?? user.email ?? userId.slice(0, 8)}
        subtitle={`${user.role} · joined ${relativeFrom(user.created_at)} · ${user.email ?? "no email"}${user.phone ? ` · ${user.phone}` : ""}`}
      />

      <div className="cc-stack">
        {/* PROFILE BLOCK */}
        <div className="cc-grid cc-grid-3">
          <div className="cc-card">
            <p className="cc-card-title">Identity</p>
            <KV label="User ID" value={user.id} mono />
            <KV label="Display name" value={user.display_name ?? "—"} />
            <KV label="Email" value={user.email ?? "—"} mono />
            <KV label="Phone" value={user.phone ?? "—"} mono />
            <KV label="Role" value={user.role} />
            <KV label="Created" value={new Date(user.created_at).toISOString().slice(0, 16).replace("T", " ")} mono />
          </div>

          {isCreator && (
            <div className="cc-card">
              <p className="cc-card-title">Creator profile</p>
              <KV label="Creator ID" value={creator!.id} mono />
              <KV label="Active" value={creator!.is_active ? "yes" : "no"} pill={creator!.is_active ? "ok" : "neutral"} />
              <KV label="KYC" value={creator!.kyc_status ?? "—"} pill={creator!.kyc_status === "approved" ? "ok" : creator!.kyc_status === "rejected" ? "bad" : "warn"} />
              <KV label="Instagram" value={creator!.instagram_handle ?? "—"} mono />
              <KV label="Onboarding" value={creator!.onboarding_step != null ? `step ${creator!.onboarding_step}` : "—"} mono />
              <KV label="DPDP consent" value={creator!.dpdp_consent_at ? relativeFrom(creator!.dpdp_consent_at) : "—"} mono />
            </div>
          )}

          {isBrand && (
            <div className="cc-card">
              <p className="cc-card-title">Brand profile</p>
              <KV label="Brand ID" value={brand!.id} mono />
              <KV label="Company" value={brand!.company_name ?? "—"} />
              <KV label="Website" value={brand!.website_url ?? "—"} mono />
              <KV label="GSTIN" value={brand!.gst_number ?? "—"} mono />
              <KV label="Industry" value={brand!.industry ?? "—"} />
              <KV label="Verified" value={brand!.is_verified ? "yes" : "no"} pill={brand!.is_verified ? "ok" : "warn"} />
            </div>
          )}

          {/* Activity summary */}
          <div className="cc-card">
            <p className="cc-card-title">Activity summary</p>
            <KV label="Generations" value={String(generations.length)} mono />
            <KV label="Approved / rejected" value={`${approvedCount} / ${rejectedCount}`} mono />
            <KV label="Failed" value={String(failedCount)} mono />
            <KV label="Active collabs" value={String(activeCollabs)} mono />
            <KV label="Licences" value={String(licenses.length)} mono />
            <KV label="Conversations" value={String(conversations.length)} mono />
          </div>
        </div>

        {/* MONEY KPIS */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Money</p>
          <div className="cc-grid cc-grid-4">
            {isCreator && (
              <>
                <Kpi label="Lifetime earned" value={fmt(lifetimeEarnedPaise)} sub="creator share of all licences" />
                <Kpi label="Paid out" value={fmt(totalPayoutsPaise)} sub={`${payouts.filter((p) => p.status === "success").length} successful payouts`} />
                <Kpi label="In escrow" value={fmt(lifetimeEarnedPaise - totalPayoutsPaise)} sub="not yet withdrawn" />
                <Kpi label="Lifetime gens" value={String(generations.length)} sub="approved + pending + failed" />
              </>
            )}
            {isBrand && (
              <>
                <Kpi label="Lifetime spent" value={fmt(lifetimeSpentPaise)} sub="across approved licences" />
                <Kpi label="Top-ups paid" value={fmt(totalTopupsPaise)} sub={`${topups.filter((t) => t.status === "success").length} successful`} />
                <Kpi label="Wallet balance" value={fmt(brand!.wallet_balance_paise)} sub={`${fmt(brand!.wallet_reserved_paise)} reserved`} />
                <Kpi label="Credits remaining" value={String(brand!.credits_remaining ?? 0)} sub={`of ${(brand!.credits_lifetime_purchased ?? 0).toLocaleString("en-IN")} ever`} />
              </>
            )}
            {!isCreator && !isBrand && (
              <div className="cc-kpi" style={{ gridColumn: "span 4" }}>
                <span className="cc-kpi-sub">Admin user — no creator or brand profile.</span>
              </div>
            )}
          </div>
        </div>

        {/* COLLABS */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Collabs ({collabs.length})</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 80 }}>Tier</th>
                  <th style={{ width: 100 }}>Price</th>
                  <th style={{ width: 110 }}>Approved</th>
                  <th style={{ width: 110 }}>Created</th>
                  <th style={{ width: 90 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {collabs.length === 0 ? (
                  <tr><td colSpan={7} className="cc-table-empty">No collabs.</td></tr>
                ) : collabs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className={`cc-pill ${statusPill(c.status)}`}>{c.status}</span></td>
                    <td className="cc-mono-cell">{c.package_tier ?? "—"}</td>
                    <td className="cc-mono-cell">{fmt(c.package_price_paise)}</td>
                    <td className="cc-mono-cell">{c.approved_count}{c.final_images_target ? ` / ${c.final_images_target}` : ""}</td>
                    <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>{relativeFrom(c.created_at)}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11 }}>
                      <Link href={`/${ccSlug}/collabs?status=${c.status}`} className="cc-btn" style={{ padding: "2px 8px", fontSize: 11 }}>open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GENERATIONS WITH THUMBNAILS */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Generations ({generations.length}, last 100)</p>
          <div className="cc-card" style={{ padding: 12 }}>
            {generations.length === 0 ? (
              <p className="cc-table-empty" style={{ padding: 24 }}>No generations.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                {generations.map((g) => (
                  <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      style={{
                        position: "relative",
                        aspectRatio: "1",
                        background: "var(--cc-bg)",
                        border: "1px solid var(--cc-border)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      {g.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                        style={{
                          position: "absolute",
                          left: 4,
                          top: 4,
                          fontSize: 8.5,
                        }}
                      >
                        {g.status}
                      </span>
                    </div>
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
            )}
          </div>
        </div>

        {/* CONVERSATIONS + RECENT MESSAGES */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Chats — {conversations.length} thread{conversations.length === 1 ? "" : "s"} · last 50 messages
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>When</th>
                  <th style={{ width: 80 }}>From</th>
                  <th style={{ width: 110 }}>Conversation</th>
                  <th>Body</th>
                  <th style={{ width: 70 }}>Image?</th>
                </tr>
              </thead>
              <tbody>
                {recentMessages.length === 0 ? (
                  <tr><td colSpan={5} className="cc-table-empty">No chat messages.</td></tr>
                ) : recentMessages.map((m) => (
                  <tr key={m.id}>
                    <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                      {new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td>
                      <span className={`cc-pill ${m.sender_role === "brand" ? "cc-pill-info" : "cc-pill-neutral"}`}>{m.sender_role}</span>
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11 }}>{m.conversation_id.slice(0, 8)}…</td>
                    <td style={{ fontSize: 12, color: "var(--cc-fg)", maxWidth: 480 }}>
                      {m.body
                        ? m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body
                        : <span className="cc-dim">[no text]</span>}
                    </td>
                    <td>
                      {m.attachment_url ? (
                        <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="cc-pill cc-pill-info">view</a>
                      ) : <span className="cc-dim">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CREATOR-ONLY: APPROVALS + REQUESTS */}
        {isCreator && (
          <>
            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Approval queue ({approvalsForCreator.length})</p>
              <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Approval id</th>
                      <th style={{ width: 110 }}>Gen id</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th>Feedback</th>
                      <th style={{ width: 110 }}>Expires</th>
                      <th style={{ width: 110 }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalsForCreator.length === 0 ? (
                      <tr><td colSpan={6} className="cc-table-empty">No approval activity.</td></tr>
                    ) : approvalsForCreator.map((a) => (
                      <tr key={a.id}>
                        <td className="cc-mono-cell" style={{ fontSize: 11 }}>{a.id.slice(0, 8)}…</td>
                        <td className="cc-mono-cell" style={{ fontSize: 11 }}>{a.generation_id.slice(0, 8)}…</td>
                        <td><span className={`cc-pill ${statusPill(a.status)}`}>{a.status}</span></td>
                        <td style={{ fontSize: 12, color: "var(--cc-fg-muted)" }}>{a.feedback ?? "—"}</td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(a.expires_at)}</td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Incoming requests ({requestsForCreator.length})</p>
              <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th style={{ width: 80 }}>Tier</th>
                      <th style={{ width: 100 }}>Price</th>
                      <th style={{ width: 110 }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsForCreator.length === 0 ? (
                      <tr><td colSpan={5} className="cc-table-empty">No requests.</td></tr>
                    ) : requestsForCreator.map((r) => (
                      <tr key={r.id}>
                        <td>{r.product_name ?? "—"}</td>
                        <td><span className={`cc-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                        <td className="cc-mono-cell">{r.package_tier ?? "—"}</td>
                        <td className="cc-mono-cell">{fmt(r.package_price_paise)}</td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Payouts ({payouts.length})</p>
              <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Payout id</th>
                      <th style={{ width: 130 }}>Amount</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.length === 0 ? (
                      <tr><td colSpan={4} className="cc-table-empty">No payouts yet.</td></tr>
                    ) : payouts.map((p) => (
                      <tr key={p.id}>
                        <td className="cc-mono-cell" style={{ fontSize: 11 }}>{p.id.slice(0, 8)}…</td>
                        <td className="cc-mono-cell">{fmt(p.amount_paise)}</td>
                        <td><span className={`cc-pill ${statusPill(p.status)}`}>{p.status}</span></td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* BRAND-ONLY: REQUESTS + TOP-UPS */}
        {isBrand && (
          <>
            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Outgoing requests ({requestsForBrand.length})</p>
              <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th style={{ width: 80 }}>Tier</th>
                      <th style={{ width: 100 }}>Price</th>
                      <th style={{ width: 110 }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsForBrand.length === 0 ? (
                      <tr><td colSpan={5} className="cc-table-empty">No requests.</td></tr>
                    ) : requestsForBrand.map((r) => (
                      <tr key={r.id}>
                        <td>{r.product_name ?? "—"}</td>
                        <td><span className={`cc-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                        <td className="cc-mono-cell">{r.package_tier ?? "—"}</td>
                        <td className="cc-mono-cell">{fmt(r.package_price_paise)}</td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Top-ups ({topups.length})</p>
              <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Top-up id</th>
                      <th style={{ width: 130 }}>Amount</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topups.length === 0 ? (
                      <tr><td colSpan={4} className="cc-table-empty">No top-ups yet.</td></tr>
                    ) : topups.map((t) => (
                      <tr key={t.id}>
                        <td className="cc-mono-cell" style={{ fontSize: 11 }}>{t.id.slice(0, 8)}…</td>
                        <td className="cc-mono-cell">{fmt(t.amount_paise)}</td>
                        <td><span className={`cc-pill ${statusPill(t.status)}`}>{t.status}</span></td>
                        <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* LICENSES */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Licences ({licenses.length})</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Licence id</th>
                  <th style={{ width: 110 }}>Gen id</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 110 }}>Scope</th>
                  <th style={{ width: 110 }}>Brand paid</th>
                  <th style={{ width: 110 }}>Creator share</th>
                  <th style={{ width: 110 }}>Issued</th>
                </tr>
              </thead>
              <tbody>
                {licenses.length === 0 ? (
                  <tr><td colSpan={7} className="cc-table-empty">No licences.</td></tr>
                ) : licenses.map((l) => (
                  <tr key={l.id}>
                    <td className="cc-mono-cell" style={{ fontSize: 11 }}>{l.id.slice(0, 8)}…</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11 }}>{l.generation_id.slice(0, 8)}…</td>
                    <td><span className={`cc-pill ${statusPill(l.status)}`}>{l.status}</span></td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{l.scope}</td>
                    <td className="cc-mono-cell">{fmt(l.amount_paid_paise)}</td>
                    <td className="cc-mono-cell" style={{ color: "var(--cc-ok)" }}>{fmt(l.creator_share_paise)}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(l.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AUDIT TRAIL */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Owner-actions on this user ({auditEntries.length})</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>When (UTC)</th>
                  <th style={{ width: 200 }}>Action</th>
                  <th style={{ width: 130 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.length === 0 ? (
                  <tr><td colSpan={3} className="cc-table-empty">No audit entries scoped to this user.</td></tr>
                ) : auditEntries.map((a) => (
                  <tr key={a.id}>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                      {new Date(a.created_at).toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>{a.action}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{a.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Small helpers ───────────────────────────────────────────── */

function KV({
  label,
  value,
  mono,
  pill,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  pill?: "ok" | "warn" | "bad" | "info" | "neutral";
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", fontSize: 11.5, gap: 12 }}>
      <span style={{ color: "var(--cc-fg-muted)", fontFamily: "var(--cc-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      {pill ? (
        <span className={`cc-pill cc-pill-${pill}`}>{value}</span>
      ) : (
        <span className={mono ? "cc-mono-cell" : ""} style={{ color: "var(--cc-fg)", fontSize: 11.5, textAlign: "right", wordBreak: "break-all" }}>
          {value}
        </span>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="cc-kpi">
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value">{value}</span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
