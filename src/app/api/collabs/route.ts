import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/collabs — list all collab sessions for authenticated user (brand or creator)
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

  if (!brand && !creator) return NextResponse.json({ collabs: [], role: null });

  const roleFilter = brand ? { col: "brand_id", id: brand.id, role: "brand" }
                           : { col: "creator_id", id: creator.id, role: "creator" };

  const { data: sessions, error } = await admin
    .from("collab_sessions")
    .select(`
      id, name, status, created_at,
      brand_id, creator_id,
      package_tier, package_price_paise, final_images_target,
      approved_count, gen_credits_total, gen_credits_used,
      budget_paise, collab_request_id
    `)
    .eq(roleFilter.col, roleFilter.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[collabs GET]", error);
    return NextResponse.json({ error: "Failed to load collabs" }, { status: 500 });
  }

  // Enrich with counterpart display names
  const rows = sessions ?? [];
  const counterpartIds = rows.map((s: Record<string, string>) =>
    roleFilter.role === "brand" ? s.creator_id : s.brand_id
  );
  const uniqueIds = [...new Set(counterpartIds)];

  const nameMap: Record<string, string> = {};
  // Counterpart avatar URL (creator or brand) — used by card thumbnail
  const avatarMap: Record<string, string | null> = {};
  if (uniqueIds.length > 0) {
    if (roleFilter.role === "brand") {
      const { data: creators } = await admin
        .from("creators")
        .select("id, user_id")
        .in("id", uniqueIds);
      const creatorUserIds = (creators ?? []).map((c: { user_id: string }) => c.user_id);
      const { data: users } = creatorUserIds.length > 0
        ? await admin.from("users").select("id, display_name, avatar_url").in("id", creatorUserIds)
        : { data: [] };
      const userById: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      for (const u of users ?? []) userById[u.id] = { display_name: u.display_name, avatar_url: u.avatar_url };
      for (const c of creators ?? []) {
        const u = userById[c.user_id];
        nameMap[c.id] = u?.display_name ?? "Creator";
        avatarMap[c.id] = u?.avatar_url ?? null;
      }
    } else {
      const { data: brands } = await admin.from("brands").select("id, company_name").in("id", uniqueIds);
      for (const b of brands ?? []) {
        nameMap[b.id] = b.company_name ?? "Brand";
        avatarMap[b.id] = null;
      }
    }
  }

  // Fetch product images via the linked collab_requests in bulk (one query)
  const requestIds = rows
    .map((s: Record<string, unknown>) => s.collab_request_id as string | null)
    .filter((id: string | null): id is string => Boolean(id));
  const productImageMap: Record<string, string | null> = {};
  if (requestIds.length > 0) {
    const { data: reqs } = await admin
      .from("collab_requests")
      .select("id, product_image_url")
      .in("id", requestIds);
    for (const r of reqs ?? []) {
      productImageMap[r.id] = r.product_image_url ?? null;
    }
  }

  const collabs = rows.map((s: Record<string, unknown>) => {
    const counterpartId = roleFilter.role === "brand" ? (s.creator_id as string) : (s.brand_id as string);
    const reqId = s.collab_request_id as string | null;
    return {
      ...s,
      counterpart_name: nameMap[counterpartId] ?? "Unknown",
      counterpart_avatar_url: avatarMap[counterpartId] ?? null,
      product_image_url: reqId ? productImageMap[reqId] ?? null : null,
      is_legacy: !(s.package_tier), // old sessions without package linkage
    };
  });

  // For brands: also return accepted requests awaiting payment
  let pendingPayments: unknown[] = [];
  if (brand) {
    const { data: acceptedReqs } = await admin
      .from("collab_requests")
      .select("id, status, package_tier, package_price_paise, final_images, product_name, product_image_url, brief_one_liner, creator_id, created_at")
      .eq("brand_id", brand.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    // Enrich with creator names
    const creatorIds = [...new Set((acceptedReqs ?? []).map((r: { creator_id: string }) => r.creator_id))];
    const creatorNameMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: cRows } = await admin.from("creators").select("id, user_id").in("id", creatorIds);
      const cUserIds = (cRows ?? []).map((c: { user_id: string }) => c.user_id);
      if (cUserIds.length > 0) {
        const { data: cUsers } = await admin.from("users").select("id, display_name").in("id", cUserIds);
        const cuMap: Record<string, string> = {};
        for (const u of cUsers ?? []) cuMap[u.id] = u.display_name;
        for (const c of cRows ?? []) creatorNameMap[c.id] = cuMap[c.user_id] ?? "Creator";
      }
    }
    pendingPayments = (acceptedReqs ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      creator_name: creatorNameMap[r.creator_id as string] ?? "Creator",
    }));
  }

  return NextResponse.json({ collabs, role: roleFilter.role, pending_payments: pendingPayments });
}
