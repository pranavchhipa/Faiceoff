/**
 * Users module — combined creator + brand directory with quick filters.
 * Real content: lists from `users` joined with creators/brands tables.
 * Per-user actions land in a follow-up (ban, impersonate, KYC override).
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ role?: string; q?: string }>;
}

interface Row {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  is_active: boolean | null;
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
    .select("id, display_name, email, role, created_at, is_active")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.role) q = q.eq("role", sp.role);
  if (sp.q) {
    const escaped = sp.q.replace(/[%_]/g, (m: string) => `\\${m}`);
    q = q.or(`email.ilike.%${escaped}%,display_name.ilike.%${escaped}%`);
  }
  const { data: rows } = await q;
  const list = (rows ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${list.length} loaded · last 200 by signup time`}
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

      <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="cc-table">
          <thead>
            <tr>
              <th>Display name</th>
              <th>Email</th>
              <th style={{ width: 90 }}>Role</th>
              <th style={{ width: 80 }}>Active</th>
              <th style={{ width: 130 }}>Signed up</th>
              <th style={{ width: 100 }}>User id</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="cc-table-empty">No users match.</td>
              </tr>
            ) : (
              list.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name ?? <span className="cc-dim">—</span>}</td>
                  <td className="cc-mono-cell" style={{ fontSize: 12 }}>{u.email ?? "—"}</td>
                  <td>
                    <span className={`cc-pill ${u.role === "admin" ? "cc-pill-warn" : u.role === "brand" ? "cc-pill-info" : "cc-pill-neutral"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`cc-pill ${u.is_active === false ? "cc-pill-bad" : "cc-pill-ok"}`}>
                      {u.is_active === false ? "no" : "yes"}
                    </span>
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {new Date(u.created_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                    {u.id.slice(0, 8)}…
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
