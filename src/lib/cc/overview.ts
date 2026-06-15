// Control Centre overview data — powers the friendly Home + "Needs you" inbox.
//
//   getPendingCounts() — how many items in each operator action-queue right now
//   getActivityFeed()  — a merged, human-readable feed of recent platform events
//
// Everything is best-effort: each query is independently guarded so a single
// missing table / column never blanks the whole Home.

import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface PendingCounts {
  creatorVerify: number;
  brandVerify: number;
  payouts: number;
  disputes: number;
  tickets: number;
  stuckGens: number;
  total: number;
}

async function count(p: Promise<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await p;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getPendingCounts(): Promise<PendingCounts> {
  const admin = createAdminClient() as Admin;
  const stuckBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [creatorVerify, brandVerify, payouts, disputes, tickets, stuckGens] = await Promise.all([
    count(admin.from("creator_verifications").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("brand_verifications").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("creator_payouts").select("id", { count: "exact", head: true }).in("status", ["requested", "processing"])),
    count(admin.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"])),
    count(admin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "waiting_on_user"])),
    count(admin.from("generations").select("id", { count: "exact", head: true }).in("status", ["draft", "compliance_check", "generating", "output_check"]).lt("created_at", stuckBefore)),
  ]);

  const total = creatorVerify + brandVerify + payouts + disputes + tickets + stuckGens;
  return { creatorVerify, brandVerify, payouts, disputes, tickets, stuckGens, total };
}

export type ActivityKind =
  | "signup_brand" | "signup_creator" | "topup" | "brand_verify" | "creator_verify"
  | "payout" | "collab" | "dispute";

export interface ActivityItem {
  kind: ActivityKind;
  text: string;     // human-readable, name included
  ts: string;       // ISO timestamp
  href: string | null; // where the operator can act / drill in
}

function inr(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format((paise ?? 0) / 100);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function name(rel: any, fallback = "Someone"): string {
  // Handles creators(user:users(display_name)) / brands(company_name) shapes.
  if (!rel) return fallback;
  if (typeof rel === "string") return rel || fallback;
  if (rel.company_name) return rel.company_name;
  if (rel.display_name) return rel.display_name;
  if (rel.user?.display_name) return rel.user.display_name;
  if (rel.users?.display_name) return rel.users.display_name;
  return fallback;
}

async function safe<T>(p: Promise<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await p;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getActivityFeed(limit = 24): Promise<ActivityItem[]> {
  const admin = createAdminClient() as Admin;
  const slug = process.env.OWNER_CONTROL_CENTRE_SLUG ?? "control";
  const cc = `/${slug}`;

  const [brands, creators, topups, bverif, cverif, payouts, collabs, disputes] = await Promise.all([
    safe<{ id: string; company_name: string | null; created_at: string }>(
      admin.from("brands").select("id, company_name, created_at").order("created_at", { ascending: false }).limit(8)),
    safe<{ id: string; created_at: string; user: { display_name: string | null } | null }>(
      admin.from("creators").select("id, created_at, user:users(display_name)").order("created_at", { ascending: false }).limit(8)),
    safe<{ id: string; amount_paise: number; created_at: string; brand: { company_name: string | null } | null }>(
      admin.from("credit_top_ups").select("id, amount_paise, created_at, brand:brands(company_name)").eq("status", "success").order("created_at", { ascending: false }).limit(8)),
    safe<{ id: string; status: string; company_name: string | null; submitted_at: string | null; reviewed_at: string | null }>(
      admin.from("brand_verifications").select("id, status, company_name, submitted_at, reviewed_at").order("updated_at", { ascending: false }).limit(8)),
    safe<{ id: string; status: string; submitted_at: string | null; reviewed_at: string | null; creator: { user: { display_name: string | null } | null } | null }>(
      admin.from("creator_verifications").select("id, status, submitted_at, reviewed_at, creator:creators(user:users(display_name))").order("updated_at", { ascending: false }).limit(8)),
    safe<{ id: string; net_amount_paise: number; status: string; requested_at: string; completed_at: string | null; creator: { user: { display_name: string | null } | null } | null }>(
      admin.from("creator_payouts").select("id, net_amount_paise, status, requested_at, completed_at, creator:creators(user:users(display_name))").order("requested_at", { ascending: false }).limit(8)),
    safe<{ id: string; name: string | null; status: string; updated_at: string }>(
      admin.from("collab_sessions").select("id, name, status, updated_at").order("updated_at", { ascending: false }).limit(8)),
    safe<{ id: string; status: string; created_at: string }>(
      admin.from("disputes").select("id, status, created_at").order("created_at", { ascending: false }).limit(6)),
  ]);

  const items: ActivityItem[] = [];

  for (const b of brands) items.push({ kind: "signup_brand", text: `New brand signed up — ${b.company_name ?? "Unnamed"}`, ts: b.created_at, href: `${cc}/users` });
  for (const c of creators) items.push({ kind: "signup_creator", text: `New creator joined — ${name(c.user, "Creator")}`, ts: c.created_at, href: `${cc}/users` });
  for (const t of topups) items.push({ kind: "topup", text: `${name(t.brand, "A brand")} topped up ${inr(t.amount_paise)}`, ts: t.created_at, href: `${cc}/money` });
  for (const v of bverif) {
    const ts = v.reviewed_at ?? v.submitted_at;
    if (!ts) continue;
    const verb = v.status === "verified" ? "was verified ✓" : v.status === "rejected" ? "verification rejected" : "submitted GST verification";
    items.push({ kind: "brand_verify", text: `${v.company_name ?? "A brand"} ${verb}`, ts, href: `${cc}/brand-verifications` });
  }
  for (const v of cverif) {
    const ts = v.reviewed_at ?? v.submitted_at;
    if (!ts) continue;
    const verb = v.status === "verified" ? "got the gold tick ✓" : v.status === "rejected" ? "verification rejected" : "submitted verification";
    items.push({ kind: "creator_verify", text: `${name(v.creator?.user, "A creator")} ${verb}`, ts, href: `${cc}/verifications` });
  }
  for (const p of payouts) {
    const ts = p.completed_at ?? p.requested_at;
    const verb = p.status === "success" ? `was paid ${inr(p.net_amount_paise)}` : p.status === "requested" ? `requested a ${inr(p.net_amount_paise)} payout` : `payout ${p.status}`;
    items.push({ kind: "payout", text: `${name(p.creator?.user, "A creator")} ${verb}`, ts, href: `${cc}/payouts` });
  }
  for (const c of collabs) {
    const verb = c.status === "completed" ? "completed" : c.status === "cancelled" ? "was cancelled" : c.status === "active" ? "went active" : c.status;
    items.push({ kind: "collab", text: `Collab "${c.name ?? "Untitled"}" ${verb}`, ts: c.updated_at, href: `${cc}/collabs` });
  }
  for (const d of disputes) items.push({ kind: "dispute", text: `A dispute was raised`, ts: d.created_at, href: `${cc}/disputes` });

  return items
    .filter((i) => i.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, limit);
}
