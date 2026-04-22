// ─────────────────────────────────────────────────────────────────────────────
// /admin/packs — Credit pack catalog management (E33)
//
// Server component: fetches all packs (including inactive) and passes to
// client-side PacksTable for CRUD operations.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import type { CreditPack } from "@/lib/billing";
import { PacksTable } from "./packs-table";

async function getAllPacks(): Promise<CreditPack[]> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from("credit_packs_catalog")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[admin/packs] server fetch error:", error);
      return [];
    }
    return (data as CreditPack[]) ?? [];
  } catch (err) {
    console.error("[admin/packs] unexpected error:", err);
    return [];
  }
}

export const metadata = {
  title: "Credit pack catalog — Admin",
};

export default async function AdminPacksPage() {
  const packs = await getAllPacks();

  return (
    <div className="max-w-6xl">
      <PacksTable initialPacks={packs} />
    </div>
  );
}
