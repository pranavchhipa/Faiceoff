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
 *
 * For a creator this also shows what they actually signed up to DO: their
 * uploaded face references (private bucket, short-lived signed URLs), the
 * categories they picked vs the priced category rows that exist, the
 * concepts they blocked, and their public profile + Style Previews. That is
 * the set an operator needs to judge a verification without leaving the page.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth, PageHeader } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import GenerationsGrid from "./generations-grid";
import MediaGrid, { type MediaItem } from "./media-grid";

export const dynamic = "force-dynamic";

/** Private bucket holding face references + profile covers. */
const REFERENCE_BUCKET = "reference-photos";
/** Signed-URL lifetime. Long enough to review, short enough not to leak. */
const SIGNED_URL_TTL = 60 * 10;

/**
 * Canonical creator onboarding order (see the STEP_ROUTES map in
 * dashboard/onboarding/page.tsx). onboarding_step is TEXT, not a number —
 * `lora_review` and `pricing` are legacy values kept so old rows still
 * resolve to a position.
 */
const ONBOARDING_STEPS = [
  "identity",
  "instagram",
  "categories",
  "compliance",
  "consent",
  "photos",
  "pricing",
  "complete",
] as const;

/** Buckets written by classifySource() in src/lib/analytics/attribution.ts. */
const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct",
  organic_search: "Organic search",
  social: "Social",
  referral: "Referral",
  campaign: "Campaign (UTM)",
};

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
  // Migration 00079 — NULL for everyone who signed up before it landed.
  signup_referrer: string | null;
  signup_landing_path: string | null;
  signup_utm: Record<string, string> | null;
  signup_source: string | null;
}

interface CreatorRow {
  id: string;
  user_id: string;
  is_active: boolean;
  is_verified: boolean | null;
  kyc_status: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  bio: string | null;
  city: string | null;
  /** TEXT step name ('photos', 'complete', …) — NOT a number. */
  onboarding_step: string | null;
  selected_categories: string[] | null;
  profile_slug: string | null;
  profile_published: boolean | null;
  profile_published_at: string | null;
  profile_view_count: number | null;
  cover_image_path: string | null;
  dpdp_consent_at: string | null;
  lifetime_earned_gross_paise: number | null;
  pending_balance_paise: number | null;
  lifetime_withdrawn_net_paise: number | null;
  bank_account_holder_name: string | null;
  bank_ifsc: string | null;
  bank_added_at: string | null;
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

interface ReferencePhotoRow {
  id: string;
  storage_path: string;
  is_primary: boolean;
  uploaded_at: string;
}

interface CreatorCategoryRow {
  id: string;
  category: string;
  subcategories: string[] | null;
  is_active: boolean;
}

interface BlockedConceptRow {
  id: string;
  blocked_concept: string;
  created_at: string;
}

interface DemoSampleRow {
  id: string;
  category: string;
  image_url: string | null;
  status: string;
  is_visible: boolean;
  regeneration_count: number | null;
  error_message: string | null;
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
      .select("id, display_name, email, phone, role, avatar_url, created_at, updated_at, signup_referrer, signup_landing_path, signup_utm, signup_source")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("creators")
      .select("id, user_id, is_active, is_verified, kyc_status, instagram_handle, instagram_followers, bio, city, onboarding_step, selected_categories, profile_slug, profile_published, profile_published_at, profile_view_count, cover_image_path, dpdp_consent_at, lifetime_earned_gross_paise, pending_balance_paise, lifetime_withdrawn_net_paise, bank_account_holder_name, bank_ifsc, bank_added_at, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("brands")
      .select("id, user_id, company_name, website_url, gst_number, industry, is_verified, credits_remaining, credits_lifetime_purchased, created_at")
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
    referencePhotos,
    creatorCategories,
    blockedConcepts,
    demoSamples,
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
      // creator_payouts stores net_amount_paise + requested_at (NOT amount_paise/
      // created_at). Alias them so PayoutRow + KPIs + render stay unchanged.
      const { data } = await admin
        .from("creator_payouts")
        .select("id, amount_paise:net_amount_paise, status, created_at:requested_at")
        .eq("creator_id", creator.id)
        .order("requested_at", { ascending: false })
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

    // Face reference photos — the primary evidence for a verification call.
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("creator_reference_photos")
        .select("id, storage_path, is_primary, uploaded_at")
        .eq("creator_id", creator.id)
        .order("is_primary", { ascending: false })
        .order("uploaded_at", { ascending: true })
        .limit(100);
      return (data ?? []) as ReferencePhotoRow[];
    }, [] as ReferencePhotoRow[]),

    // Priced category rows. Distinct from creators.selected_categories, which
    // is only the profile picker — a creator can have one without the other.
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("creator_categories")
        .select("id, category, subcategories, is_active")
        .eq("creator_id", creator.id)
        .order("category", { ascending: true })
        .limit(100);
      return (data ?? []) as CreatorCategoryRow[];
    }, [] as CreatorCategoryRow[]),

    // Blocked concepts — what this creator refuses to be generated into.
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("creator_compliance_vectors")
        .select("id, blocked_concept, created_at")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: true })
        .limit(200);
      return (data ?? []) as BlockedConceptRow[];
    }, [] as BlockedConceptRow[]),

    // Style Previews on the public profile. Archived (is_visible=false) rows
    // are fetched too so a regen history is visible, newest first.
    safe(async () => {
      if (!creator) return [];
      const { data } = await admin
        .from("creator_demo_samples")
        .select("id, category, image_url, status, is_visible, regeneration_count, error_message, created_at")
        .eq("creator_id", creator.id)
        .order("is_visible", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40);
      return (data ?? []) as DemoSampleRow[];
    }, [] as DemoSampleRow[]),
  ]);

  // Sign the private reference-photo paths in ONE batch call. A failure here
  // is non-fatal: the tile renders as "no image" rather than blanking the page.
  const referencePhotoUrls: Record<string, string> = {};
  if (referencePhotos.length > 0) {
    await safe(async () => {
      const { data: signed } = await admin.storage
        .from(REFERENCE_BUCKET)
        .createSignedUrls(referencePhotos.map((p) => p.storage_path), SIGNED_URL_TTL);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (signed ?? []) as any[]) {
        if (s?.path && s?.signedUrl) referencePhotoUrls[s.path] = s.signedUrl;
      }
      return null;
    }, null);
  }

  // Cover image lives in the same private bucket, so it needs signing too.
  const coverPath = creator?.cover_image_path ?? null;
  const coverUrl: string | null = coverPath
    ? await safe<string | null>(async () => {
        const { data: signed } = await admin.storage
          .from(REFERENCE_BUCKET)
          .createSignedUrl(coverPath, SIGNED_URL_TTL);
        return (signed?.signedUrl as string | undefined) ?? null;
      }, null)
    : null;

  // 3. Hydrate recent messages for the active conversations
  const conversationIds = conversations.map((c) => c.id);
  const recentMessages = conversationIds.length > 0
    ? await safe(async () => {
        const { data } = await admin
          .from("conversation_messages")
          .select("id, conversation_id, sender_user_id, sender_role, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(50);
        return (data ?? []) as MessageRow[];
      }, [] as MessageRow[])
    : [];

  // 4. Aggregate KPIs
  // Prefer the authoritative balance columns on the creators row; fall back to
  // the licence-derived sum if the rollup column is null (older rows).
  const licenseDerivedEarnedPaise = licenses.reduce((s, l) => s + (l.creator_share_paise ?? 0), 0);
  const lifetimeEarnedPaise = creator?.lifetime_earned_gross_paise ?? licenseDerivedEarnedPaise;
  const availableBalancePaise = creator
    ? (creator.lifetime_earned_gross_paise ?? 0) - (creator.lifetime_withdrawn_net_paise ?? 0)
    : 0;
  const pendingBalancePaise = creator?.pending_balance_paise ?? 0;
  const lifetimeSpentPaise = brand ? licenses.reduce((s, l) => s + (l.amount_paid_paise ?? 0), 0) : 0;
  const totalPayoutsPaise = payouts.filter((p) => p.status === "success").reduce((s, p) => s + p.amount_paise, 0);
  const totalTopupsPaise = topups.filter((t) => t.status === "success").reduce((s, t) => s + t.amount_paise, 0);
  const approvedCount = generations.filter((g) => g.status === "approved").length;
  const rejectedCount = generations.filter((g) => g.status === "rejected").length;
  const failedCount = generations.filter((g) => g.status === "failed").length;
  const activeCollabs = collabs.filter((c) => c.status === "active").length;

  const isCreator = !!creator;
  const isBrand = !!brand;

  // 5. Unified recent-activity feed — merge the latest events across every
  //    activity type into a single chronological "what has this user been
  //    doing" list. Built entirely from data already fetched (no new queries).
  type Activity = { at: string; kind: string; label: string; detail: string; pill: string };
  const activity: Activity[] = [
    ...generations.map((g) => ({
      at: g.created_at,
      kind: "Generation",
      label: `Generation ${g.id.slice(0, 8)}…`,
      detail: g.status,
      pill: statusPill(g.status),
    })),
    ...collabs.map((c) => ({
      at: c.created_at,
      kind: "Collab",
      label: c.name,
      detail: `${c.status}${c.package_tier ? ` · ${c.package_tier}` : ""}${c.package_price_paise ? ` · ${fmt(c.package_price_paise)}` : ""}`,
      pill: statusPill(c.status),
    })),
    ...licenses.map((l) => ({
      at: l.issued_at,
      kind: "Licence",
      label: `Licence ${l.id.slice(0, 8)}…`,
      detail: `${l.scope} · ${isCreator ? `${fmt(l.creator_share_paise)} earned` : `${fmt(l.amount_paid_paise)} paid`}`,
      pill: statusPill(l.status),
    })),
    ...payouts.map((p) => ({
      at: p.created_at,
      kind: "Payout",
      label: `Payout ${fmt(p.amount_paise)}`,
      detail: p.status,
      pill: statusPill(p.status),
    })),
    ...topups.map((t) => ({
      at: t.created_at,
      kind: "Top-up",
      label: `Top-up ${fmt(t.amount_paise)}`,
      detail: t.status,
      pill: statusPill(t.status),
    })),
    ...requestsForCreator.map((r) => ({
      at: r.created_at,
      kind: "Request in",
      label: r.product_name ?? "Collab request",
      detail: `${r.status}${r.package_price_paise ? ` · ${fmt(r.package_price_paise)}` : ""}`,
      pill: statusPill(r.status),
    })),
    ...requestsForBrand.map((r) => ({
      at: r.created_at,
      kind: "Request out",
      label: r.product_name ?? "Collab request",
      detail: `${r.status}${r.package_price_paise ? ` · ${fmt(r.package_price_paise)}` : ""}`,
      pill: statusPill(r.status),
    })),
    ...approvalsForCreator.map((a) => ({
      at: a.created_at,
      kind: "Approval",
      label: `Approval ${a.id.slice(0, 8)}…`,
      detail: a.status,
      pill: statusPill(a.status),
    })),
  ]
    .filter((a) => !!a.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 30);

  // 6. Creator likeness / profile derivations.
  const stepName = creator?.onboarding_step ?? null;
  // 'lora_review' is a dead step that now forwards to pricing — map it there
  // so a legacy row still lands on a real position instead of "unknown".
  const normalisedStep = stepName === "lora_review" ? "pricing" : stepName;
  const stepIndex = normalisedStep
    ? (ONBOARDING_STEPS as readonly string[]).indexOf(normalisedStep)
    : -1;
  const onboardingDone = normalisedStep === "complete";

  const selectedCategories = creator?.selected_categories ?? [];
  const activeCategories = creatorCategories.filter((c) => c.is_active);

  const photoItems: MediaItem[] = referencePhotos.map((p, i) => ({
    id: p.id,
    url: referencePhotoUrls[p.storage_path] ?? null,
    caption: `${i + 1} · ${new Date(p.uploaded_at).toISOString().slice(0, 10)}`,
    badge: p.is_primary ? "primary" : null,
    badgeClass: "cc-pill-ok",
  }));

  const demoItems: MediaItem[] = demoSamples.map((d) => ({
    id: d.id,
    url: d.status === "ready" ? d.image_url : null,
    // error_message is the only thing that explains a red "failed" badge, and
    // it was already being fetched — MediaGrid puts the full caption in the
    // tile's title, so a long message stays readable on hover.
    caption: `${d.category}${d.is_visible ? "" : " (archived)"}${
      (d.regeneration_count ?? 0) > 0 ? ` · ${d.regeneration_count} regen` : ""
    }${d.status === "failed" && d.error_message ? ` · ${d.error_message}` : ""}`,
    badge: d.status,
    badgeClass:
      d.status === "ready" ? "cc-pill-ok" : d.status === "failed" ? "cc-pill-bad" : "cc-pill-warn",
  }));

  const profileLive = !!creator?.profile_published && !!creator?.profile_slug;

  // 7. Signup attribution — one shared block for creators and brands alike.
  // jsonb — trust nothing about its shape beyond "object of strings".
  const utm =
    user.signup_utm && typeof user.signup_utm === "object" && !Array.isArray(user.signup_utm)
      ? user.signup_utm
      : null;
  const utmPairs = utm ? Object.entries(utm).filter(([, v]) => !!v) : [];
  const hasAttribution =
    !!user.signup_source || !!user.signup_referrer || !!user.signup_landing_path || utmPairs.length > 0;

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
        title={brand?.company_name ?? user.display_name ?? user.email ?? userId.slice(0, 8)}
        subtitle={`${isCreator ? "Creator" : isBrand ? "Brand" : user.role}${
          (isCreator ? creator!.is_verified : isBrand ? brand!.is_verified : false) ? " ✓" : ""
        } · joined ${relativeFrom(user.created_at)} · ${user.email ?? "no email"}${
          user.phone ? ` · ${user.phone}` : ""
        }${creator?.instagram_handle ? ` · @${creator.instagram_handle.replace(/^@/, "")}` : ""}`}
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
              <KV label="Verified tick" value={creator!.is_verified ? "Verified ✓" : "Unverified"} pill={creator!.is_verified ? "ok" : "neutral"} />
              <KV label="Active" value={creator!.is_active ? "yes" : "no"} pill={creator!.is_active ? "ok" : "neutral"} />
              <KV
                label="KYC"
                value={creator!.kyc_status ?? "—"}
                pill={creator!.kyc_status === "verified" || creator!.kyc_status === "approved" ? "ok" : creator!.kyc_status === "rejected" ? "bad" : "warn"}
              />
              <KV
                label="Instagram"
                value={
                  creator!.instagram_handle
                    ? `@${creator!.instagram_handle.replace(/^@/, "")}${
                        creator!.instagram_followers
                          ? ` · ${creator!.instagram_followers.toLocaleString("en-IN")} followers`
                          : ""
                      }`
                    : "—"
                }
                mono
              />
              <KV label="City" value={creator!.city ?? "—"} />
              <KV label="Bank added" value={creator!.bank_added_at ? `yes · ${relativeFrom(creator!.bank_added_at)}` : "no"} pill={creator!.bank_added_at ? "ok" : "warn"} />
              {/* onboarding_step is a TEXT step name, not a number. */}
              <KV
                label="Onboarding"
                value={
                  stepName
                    ? stepIndex >= 0
                      ? `${stepName} · step ${stepIndex + 1}/${ONBOARDING_STEPS.length}`
                      : stepName
                    : "—"
                }
                pill={onboardingDone ? "ok" : stepName ? "warn" : "neutral"}
              />
              <KV label="DPDP consent" value={creator!.dpdp_consent_at ? relativeFrom(creator!.dpdp_consent_at) : "—"} mono />
            </div>
          )}

          {isBrand && (
            <div className="cc-card">
              <p className="cc-card-title">Brand profile</p>
              <KV label="Brand ID" value={brand!.id} mono />
              <KV label="Company" value={brand!.company_name ?? "—"} />
              <KV label="Verified" value={brand!.is_verified ? "Verified ✓" : "Unverified"} pill={brand!.is_verified ? "ok" : "warn"} />
              <KV label="GST status" value={brand!.gst_number ? "GSTIN on file" : "no GSTIN"} pill={brand!.gst_number ? "ok" : "neutral"} />
              <KV label="GSTIN" value={brand!.gst_number ?? "—"} mono />
              <KV label="Website" value={brand!.website_url ?? "—"} mono />
              <KV label="Industry" value={brand!.industry ?? "—"} />
              <KV
                label="Credits remaining"
                value={`${(brand!.credits_remaining ?? 0).toLocaleString("en-IN")} of ${(brand!.credits_lifetime_purchased ?? 0).toLocaleString("en-IN")} ever`}
                mono
              />
              <KV label="Brand since" value={new Date(brand!.created_at).toISOString().slice(0, 10)} mono />
              {brand!.website_url && (
                <div style={{ marginTop: 6 }}>
                  <a
                    href={brand!.website_url.startsWith("http") ? brand!.website_url : `https://${brand!.website_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cc-btn"
                    style={{ padding: "3px 10px", fontSize: 11 }}
                  >
                    Visit site ↗
                  </a>
                </div>
              )}
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

        {/* SIGNUP ATTRIBUTION — where this person actually came from.
            First-touch, captured in the browser and written at OTP verify
            (migration 00079). Anyone who signed up before that has nothing
            recorded, which is stated plainly rather than shown as blanks. */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Where they came from</p>
          <div className="cc-card">
            {hasAttribution ? (
              <>
                <KV
                  label="Source"
                  value={user.signup_source ? SOURCE_LABEL[user.signup_source] ?? user.signup_source : "—"}
                  pill={user.signup_source === "campaign" || user.signup_source === "social" ? "info" : "neutral"}
                />
                <KV label="Landing page" value={user.signup_landing_path ?? "—"} mono />
                <KV label="Referrer" value={user.signup_referrer ?? "none (direct)"} mono />
                {utmPairs.length > 0 ? (
                  utmPairs.map(([k, v]) => <KV key={k} label={`utm_${k}`} value={String(v)} mono />)
                ) : (
                  <KV label="UTM" value="none" mono />
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "var(--cc-fg-muted)" }}>
                Not recorded — this person signed up before attribution capture existed
                (migration 00079). Nothing was lost; there was never anything to store.
              </p>
            )}
          </div>
        </div>

        {/* CREATOR LIKENESS + WHAT THEY SIGNED UP TO DO */}
        {isCreator && (
          <>
            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>
                Reference photos ({referencePhotos.length}) — private bucket, links expire in 10 min
              </p>
              <div className="cc-card" style={{ padding: 12 }}>
                <MediaGrid
                  items={photoItems}
                  emptyText="No reference photos uploaded — this creator cannot be generated."
                />
                {referencePhotos.length > 0 && (
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--cc-fg-dim)" }}>
                    {referencePhotos.filter((p) => p.is_primary).length === 0
                      ? "No primary photo set — the pipeline picks the primary first, so this is worth fixing."
                      : `${referencePhotos.length} uploaded · primary set · latest upload ${relativeFrom(
                          referencePhotos.reduce(
                            (newest, p) => (p.uploaded_at > newest ? p.uploaded_at : newest),
                            referencePhotos[0].uploaded_at,
                          ),
                        )}`}
                  </p>
                )}
              </div>
            </div>

            <div className="cc-grid cc-grid-3">
              <div className="cc-card">
                <p className="cc-card-title">Selected categories</p>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--cc-fg-dim)" }}>
                  What they picked on the public-profile setup (creators.selected_categories).
                  Drives the Style Previews, not pricing.
                </p>
                {selectedCategories.length === 0 ? (
                  <p className="cc-dim" style={{ margin: 0, fontSize: 12 }}>None picked.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectedCategories.map((c) => (
                      <span key={c} className="cc-pill cc-pill-info">{c}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="cc-card">
                <p className="cc-card-title">Category rows ({activeCategories.length} active)</p>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--cc-fg-dim)" }}>
                  Rows in creator_categories — the onboarding-era records, with
                  subcategories. Separate from the picker above.
                </p>
                {creatorCategories.length === 0 ? (
                  <p className="cc-dim" style={{ margin: 0, fontSize: 12 }}>No category rows.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {creatorCategories.map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span className={`cc-pill ${c.is_active ? "cc-pill-ok" : "cc-pill-neutral"}`}>
                          {c.category}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                          {c.subcategories && c.subcategories.length > 0 ? c.subcategories.join(", ") : "no subcategories"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="cc-card">
                <p className="cc-card-title">Blocked concepts ({blockedConcepts.length})</p>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--cc-fg-dim)" }}>
                  What this creator refuses. The compliance check hard-blocks
                  generations matching these.
                </p>
                {blockedConcepts.length === 0 ? (
                  <p className="cc-dim" style={{ margin: 0, fontSize: 12 }}>
                    Nothing blocked — every category is fair game for this creator.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {blockedConcepts.map((b) => (
                      <span key={b.id} className="cc-pill cc-pill-bad">{b.blocked_concept}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="cc-card-title" style={{ marginBottom: 8 }}>Public profile</p>
              <div className="cc-grid cc-grid-3">
                <div className="cc-card">
                  <KV
                    label="State"
                    value={profileLive ? "Live" : creator!.profile_slug ? "Draft (unpublished)" : "Not set up"}
                    pill={profileLive ? "ok" : creator!.profile_slug ? "warn" : "neutral"}
                  />
                  <KV label="Slug" value={creator!.profile_slug ?? "—"} mono />
                  <KV
                    label="Published"
                    value={creator!.profile_published_at ? relativeFrom(creator!.profile_published_at) : "—"}
                    mono
                  />
                  <KV label="Profile views" value={(creator!.profile_view_count ?? 0).toLocaleString("en-IN")} mono />
                  <KV label="Cover image" value={creator!.cover_image_path ? "uploaded" : "none"} pill={creator!.cover_image_path ? "ok" : "neutral"} />
                  {profileLive && (
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={`/creators/${creator!.profile_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cc-btn"
                        style={{ padding: "3px 10px", fontSize: 11 }}
                      >
                        Open /creators/{creator!.profile_slug} ↗
                      </a>
                    </div>
                  )}
                </div>

                <div className="cc-card" style={{ gridColumn: "span 2" }}>
                  <p className="cc-card-title">Style Previews ({demoSamples.filter((d) => d.is_visible).length} visible)</p>
                  <MediaGrid
                    items={demoItems}
                    emptyText="No Style Previews generated yet."
                    minTile={96}
                  />
                </div>
              </div>
              {coverUrl && (
                <div className="cc-card" style={{ marginTop: 12, padding: 12 }}>
                  <p className="cc-card-title">Cover image</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverUrl}
                    alt=""
                    style={{
                      width: "100%",
                      maxHeight: 220,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid var(--cc-border)",
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* MONEY KPIS */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Money</p>
          <div className="cc-grid cc-grid-4">
            {isCreator && (
              <>
                <Kpi label="Lifetime earned" value={fmt(lifetimeEarnedPaise)} sub="gross creator earnings" />
                <Kpi label="Available balance" value={fmt(availableBalancePaise)} sub="earned − withdrawn" />
                <Kpi label="Pending (in escrow)" value={fmt(pendingBalancePaise)} sub="awaiting 7-day release" />
                <Kpi label="Paid out" value={fmt(totalPayoutsPaise)} sub={`${payouts.filter((p) => p.status === "success").length} successful payouts`} />
              </>
            )}
            {isBrand && (
              <>
                <Kpi label="Lifetime spent" value={fmt(lifetimeSpentPaise)} sub="across approved licences" />
                <Kpi label="Top-ups paid" value={fmt(totalTopupsPaise)} sub={`${topups.filter((t) => t.status === "success").length} successful`} />
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

        {/* RECENT ACTIVITY — unified chronological feed */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recent activity ({activity.length}) — newest across gens, collabs, money, requests
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>When</th>
                  <th style={{ width: 110 }}>Type</th>
                  <th>What</th>
                  <th style={{ width: 220 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr><td colSpan={4} className="cc-table-empty">No recent activity.</td></tr>
                ) : activity.map((a, i) => (
                  <tr key={`${a.kind}-${i}`}>
                    <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(a.at)}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11 }}>{a.kind}</td>
                    <td style={{ fontSize: 12 }}>{a.label}</td>
                    <td>
                      <span className={`cc-pill ${a.pill}`}>{a.detail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* GENERATIONS WITH THUMBNAILS — click to zoom */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Generations ({generations.length}, last 100) — click any thumbnail to zoom
          </p>
          <div className="cc-card" style={{ padding: 12 }}>
            <GenerationsGrid
              ccSlug={ccSlug}
              generations={generations.map((g) => ({
                id: g.id,
                status: g.status,
                image_url: g.image_url,
                created_at: g.created_at,
              }))}
            />
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
                </tr>
              </thead>
              <tbody>
                {recentMessages.length === 0 ? (
                  <tr><td colSpan={4} className="cc-table-empty">No chat messages.</td></tr>
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
