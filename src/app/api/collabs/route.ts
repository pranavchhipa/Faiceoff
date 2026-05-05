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
      budget_paise
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
  if (uniqueIds.length > 0) {
    if (roleFilter.role === "brand") {
      const { data: creators } = await admin
        .from("creators")
        .select("id, user_id")
        .in("id", uniqueIds);
      const creatorUserIds = (creators ?? []).map((c: { user_id: string }) => c.user_id);
      const { data: users } = creatorUserIds.length > 0
        ? await admin.from("users").select("id, display_name").in("id", creatorUserIds)
        : { data: [] };
      const userNameById: Record<string, string> = {};
      for (const u of users ?? []) userNameById[u.id] = u.display_name;
      for (const c of creators ?? []) nameMap[c.id] = userNameById[c.user_id] ?? "Creator";
    } else {
      const { data: brands } = await admin.from("brands").select("id, company_name").in("id", uniqueIds);
      for (const b of brands ?? []) nameMap[b.id] = b.company_name ?? "Brand";
    }
  }

  const collabs = rows.map((s: Record<string, unknown>) => ({
    ...s,
    counterpart_name: nameMap[roleFilter.role === "brand" ? (s.creator_id as string) : (s.brand_id as string)] ?? "Unknown",
    is_legacy: !(s.package_tier), // old sessions without package linkage
  }));

  return NextResponse.json({ collabs, role: roleFilter.role });
}
