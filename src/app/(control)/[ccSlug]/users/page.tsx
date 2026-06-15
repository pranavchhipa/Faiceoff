/**
 * Users module — combined creator + brand directory.
 *
 * Joins users → creators / brands so each row shows, at a glance:
 *   name (display_name for creators, company_name for brands), role pill,
 *   email, verified status (golden tick / unverified), join date, and one
 *   key money/activity stat (creator → lifetime earned; brand → wallet
 *   balance) plus a generation count.
 *
 * Filters (all server-side via searchParams): role (all/creators/brands/
 * admin), verified/unverified, and free-text search on name/email.
 *
 * Clicking a row opens the per-user drill-down at /<slug>/users/[id].
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ role?: string; q?: string; verified?: string }>;
}

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

interface CreatorRow {
  id: string;
  user_id: string;
  is_active: boolean;
  is_verified: boolean | null;
  kyc_status: string | null;
  instagram_handle: string | null;
  lifetime_earned_gross_paise: number | null;
  pending_balance_paise: number | null;
}

interface BrandRow {
  id: string;
  user_id: string;
  company_name: string | null;
  is_verified: boolean | null;
  credits_remaining: number | null;
  wallet_balance_paise: number | null;
}

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

export default async function UsersPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const session = await getCurrentSession();
  void logAudit({ action: "users.view", sessionId: session?.id ?? null, payload: sp });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // The "role" filter maps to our three spaces. "creator" / "brand" filter on
  // the users.role column; we still hydrate the profile rows for everyone.
  const roleFilter = sp.role && ["creator", "brand", "admin"].includes(sp.role) ? sp.role : "";
  const verifiedFilter = sp.verified === "verified" || sp.verified === "unverified" ? sp.verified : "";

  let q = admin
    .from("users")
    .select("id, display_name, email, phone, role, avatar_url, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (roleFilter) q = q.eq("role", roleFilter);
  if (sp.q) {
    const escaped = sp.q.replace(/[%_]/g, (m: string) => `\\${m}`);
    q = q.or(`email.ilike.%${escaped}%,display_name.ilike.%${escaped}%`);
  }

  const { data: rows, error } = await q;
  const list = (rows ?? []) as UserRow[];

  // Hydrate creator + brand rows in two batch queries.
  const userIds = list.map((u) => u.id);
  const [creatorsRes, brandsRes] = userIds.length > 0
    ? await Promise.all([
        admin
          .from("creators")
          .select("id, user_id, is_active, is_verified, kyc_status, instagram_handle, lifetime_earned_gross_paise, pending_balance_paise")
          .in("user_id", userIds),
        admin
          .from("brands")
          .select("id, user_id, company_name, is_verified, credits_remaining, wallet_balance_paise")
          .in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  const creatorMap = new Map<string, CreatorRow>(((creatorsRes.data ?? []) as CreatorRow[]).map((c) => [c.user_id, c]));
  const brandMap = new Map<string, BrandRow>(((brandsRes.data ?? []) as BrandRow[]).map((b) => [b.user_id, b]));

  // Generation counts per creator / brand — one query each, counted in-memory.
  const creatorIds = [...creatorMap.values()].map((c) => c.id);
  const brandIds = [...brandMap.values()].map((b) => b.id);
  const [creatorGensRes, brandGensRes] = await Promise.all([
    creatorIds.length > 0
      ? admin.from("generations").select("creator_id").in("creator_id", creatorIds)
      : Promise.resolve({ data: [] }),
    brandIds.length > 0
      ? admin.from("generations").select("brand_id").in("brand_id", brandIds)
      : Promise.resolve({ data: [] }),
  ]);
  const creatorGenCount = new Map<string, number>();
  for (const g of (creatorGensRes.data ?? []) as Array<{ creator_id: string }>) {
    creatorGenCount.set(g.creator_id, (creatorGenCount.get(g.creator_id) ?? 0) + 1);
  }
  const brandGenCount = new Map<string, number>();
  for (const g of (brandGensRes.data ?? []) as Array<{ brand_id: string }>) {
    brandGenCount.set(g.brand_id, (brandGenCount.get(g.brand_id) ?? 0) + 1);
  }

  // Verified filter is applied in-memory (it lives on the profile row, not users).
  // A user counts as "verified" if their creator OR brand profile is verified.
  const visible = verifiedFilter
    ? list.filter((u) => {
        const c = creatorMap.get(u.id);
        const b = brandMap.get(u.id);
        const isVerified = !!c?.is_verified || !!b?.is_verified;
        return verifiedFilter === "verified" ? isVerified : !isVerified;
      })
    : list;

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${visible.length} shown · creators + brands · last 200 by signup · click any row for full activity`}
      />

      <form className="cc-toolbar" method="get">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="name or email…"
          className="cc-input"
          style={{ maxWidth: 260 }}
        />
        <select name="role" defaultValue={roleFilter} className="cc-select" style={{ maxWidth: 150 }}>
          <option value="">All people</option>
          <option value="creator">Creators</option>
          <option value="brand">Brands</option>
          <option value="admin">Admins</option>
        </select>
        <select name="verified" defaultValue={verifiedFilter} className="cc-select" style={{ maxWidth: 160 }}>
          <option value="">Any verification</option>
          <option value="verified">Verified only</option>
          <option value="unverified">Unverified only</option>
        </select>
        <button type="submit" className="cc-btn">Filter</button>
        <a href={`/${ccSlug}/users`} className="cc-btn">Reset</a>
      </form>

      {error && (
        <div className="cc-card" style={{ background: "rgba(210,67,67,0.08)", borderColor: "rgba(210,67,67,0.3)", marginBottom: 16 }}>
          <p className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-bad)", margin: 0 }}>
            Query error: {error.message}
          </p>
        </div>
      )}

      <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="cc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 80 }}>Role</th>
              <th>Email</th>
              <th style={{ width: 120 }}>Verified</th>
              <th>Money / activity</th>
              <th style={{ width: 70 }}>Gens</th>
              <th style={{ width: 100 }}>Joined</th>
              <th style={{ width: 80 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="cc-table-empty">No people match.</td>
              </tr>
            ) : (
              visible.map((u) => {
                const c = creatorMap.get(u.id);
                const b = brandMap.get(u.id);

                // Name: brand → company_name; creator/other → users.display_name.
                const name = b?.company_name ?? u.display_name ?? null;

                // Role label — a user can have a creator OR brand profile; prefer the
                // profile that exists over the raw users.role for the visible pill.
                const roleLabel = u.role === "admin" ? "Admin" : c ? "Creator" : b ? "Brand" : u.role;
                const rolePillCls =
                  u.role === "admin" ? "cc-pill-warn" : b && !c ? "cc-pill-info" : "cc-pill-neutral";

                // Verified pill — golden tick from creators.is_verified / brands.is_verified.
                const isVerified = !!c?.is_verified || !!b?.is_verified;
                const hasProfile = !!c || !!b;
                const verified =
                  u.role === "admin"
                    ? { cls: "cc-pill-warn", text: "operator" }
                    : !hasProfile
                      ? { cls: "cc-pill-neutral", text: "no profile" }
                      : isVerified
                        ? { cls: "cc-pill-ok", text: "Verified ✓" }
                        : { cls: "cc-pill-neutral", text: "Unverified" };

                // Money / activity stat — creator → lifetime earned; brand → wallet + credits.
                const stat = c
                  ? `${fmt(c.lifetime_earned_gross_paise)} earned · ${fmt(c.pending_balance_paise)} pending`
                  : b
                    ? `${fmt(b.wallet_balance_paise)} wallet · ${(b.credits_remaining ?? 0).toLocaleString("en-IN")} credits`
                    : "—";

                const gens = c
                  ? creatorGenCount.get(c.id) ?? 0
                  : b
                    ? brandGenCount.get(b.id) ?? 0
                    : 0;

                return (
                  <tr key={u.id}>
                    <td>{name ?? <span className="cc-dim">—</span>}</td>
                    <td>
                      <span className={`cc-pill ${rolePillCls}`}>{roleLabel}</span>
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>{u.email ?? "—"}</td>
                    <td>
                      <span className={`cc-pill ${verified.cls}`}>{verified.text}</span>
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{stat}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{gens}</td>
                    <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                      {new Date(u.created_at).toISOString().slice(0, 10)}
                    </td>
                    <td>
                      <Link
                        href={`/${ccSlug}/users/${u.id}`}
                        className="cc-btn"
                        style={{ padding: "3px 10px", fontSize: 11 }}
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
