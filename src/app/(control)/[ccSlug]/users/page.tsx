/**
 * Users module — combined creator + brand directory.
 *
 * Joins users → creators / brands so each row shows role + active state +
 * total earnings/spend at a glance. Clicking a row opens the per-user
 * drill-down at /<slug>/users/[id].
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ role?: string; q?: string }>;
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
  kyc_status: string | null;
}

interface BrandRow {
  id: string;
  user_id: string;
  company_name: string | null;
  is_verified: boolean | null;
  credits_remaining: number | null;
}

export default async function UsersPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const session = await getCurrentSession();
  void logAudit({ action: "users.view", sessionId: session?.id ?? null, payload: sp });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let q = admin
    .from("users")
    .select("id, display_name, email, phone, role, avatar_url, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.role) q = q.eq("role", sp.role);
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
        admin.from("creators").select("id, user_id, is_active, kyc_status").in("user_id", userIds),
        admin.from("brands").select("id, user_id, company_name, is_verified, credits_remaining").in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  const creatorMap = new Map<string, CreatorRow>(((creatorsRes.data ?? []) as CreatorRow[]).map((c) => [c.user_id, c]));
  const brandMap = new Map<string, BrandRow>(((brandsRes.data ?? []) as BrandRow[]).map((b) => [b.user_id, b]));

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${list.length} loaded · last 200 by signup time · click row for full activity`}
      />

      <form className="cc-toolbar" method="get">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="email or display name…"
          className="cc-input"
          style={{ maxWidth: 280 }}
        />
        <select name="role" defaultValue={sp.role ?? ""} className="cc-select" style={{ maxWidth: 140 }}>
          <option value="">All roles</option>
          <option value="creator">Creator</option>
          <option value="brand">Brand</option>
          <option value="admin">Admin</option>
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
              <th>Display name</th>
              <th>Email</th>
              <th style={{ width: 70 }}>Role</th>
              <th style={{ width: 110 }}>Status</th>
              <th>Detail</th>
              <th style={{ width: 110 }}>Signed up</th>
              <th style={{ width: 80 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="cc-table-empty">No users match.</td>
              </tr>
            ) : (
              list.map((u) => {
                const c = creatorMap.get(u.id);
                const b = brandMap.get(u.id);
                const status: { cls: string; text: string } =
                  u.role === "admin"
                    ? { cls: "cc-pill-warn", text: "admin" }
                    : c
                      ? c.is_active
                        ? { cls: "cc-pill-ok", text: "active" }
                        : { cls: "cc-pill-neutral", text: "inactive" }
                      : b
                        ? b.is_verified
                          ? { cls: "cc-pill-ok", text: "verified" }
                          : { cls: "cc-pill-warn", text: "unverified" }
                        : { cls: "cc-pill-neutral", text: "no-profile" };
                const detail =
                  c
                    ? `KYC: ${c.kyc_status ?? "—"}`
                    : b
                      ? `${b.company_name ?? "—"} · ₹${((b.credits_remaining ?? 0) / 100).toLocaleString("en-IN")}`
                      : "—";
                return (
                  <tr key={u.id}>
                    <td>{u.display_name ?? <span className="cc-dim">—</span>}</td>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>{u.email ?? "—"}</td>
                    <td>
                      <span className={`cc-pill ${u.role === "admin" ? "cc-pill-warn" : u.role === "brand" ? "cc-pill-info" : "cc-pill-neutral"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`cc-pill ${status.cls}`}>{status.text}</span>
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{detail}</td>
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
