import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedJson } from "@/lib/http/cacheable";

/**
 * GET /api/whoami
 * Debug endpoint — returns the currently logged-in user + their DB rows.
 * Useful for diagnosing session / role / multi-account issues.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false });
  }

  // whoami is hit on every dashboard mount + every tab switch via the auth
  // provider's background refresh. 30s cache + 5min SWR means navigations
  // within 30s skip the network entirely and the next refresh still feels
  // instant. Role doesn't change minute-to-minute, so this is safe.

  const admin = createAdminClient();

  // user / creator / brand in parallel (one round-trip). The old code fetched
  // the creator row TWICE (once here, once nested inside the photo-count query)
  // — now we fetch it once and reuse its id for the count.
  // Photo count rides in the same batch via an embedded-filter join on
  // creators.user_id — the old version awaited it AFTER this batch, adding
  // a full sequential round trip to the request that gates dashboard paint.
  const [
    { data: publicUser },
    { data: creator },
    { data: brand },
    { count: photoCountRaw },
  ] = await Promise.all([
    admin.from("users").select("id, email, role, display_name").eq("id", user.id).maybeSingle(),
    admin.from("creators").select("id, onboarding_step").eq("user_id", user.id).maybeSingle(),
    admin.from("brands").select("id, company_name").eq("user_id", user.id).maybeSingle(),
    admin
      .from("creator_reference_photos")
      .select("id, creators!inner(user_id)", { count: "exact", head: true })
      .eq("creators.user_id", user.id),
  ]);

  const photoCount = photoCountRaw ?? 0;

  return cachedJson(
    {
      loggedIn: true,
      auth: {
        id: user.id,
        email: user.email,
        metadata_role: user.user_metadata?.role ?? null,
        metadata_display_name: user.user_metadata?.display_name ?? null,
      },
      public_users_row: publicUser,
      has_creator_row: Boolean(creator),
      creator: creator,
      has_brand_row: Boolean(brand),
      brand: brand,
      photo_count: photoCount ?? 0,
    },
    { maxAge: 30, swr: 300 },
  );
}
