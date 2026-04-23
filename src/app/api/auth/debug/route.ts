import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/auth/debug
 *
 * Diagnostic endpoint. Returns the current auth state visible to the server,
 * including cookie names present, whether auth.getUser() succeeds, and
 * whether the matching public.users row exists.
 *
 * SAFE for production: returns user.id + email but not tokens.
 * Remove once login flow is debugged.
 */
export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const sbCookies = allCookies
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => ({
      name: c.name,
      value_len: c.value?.length ?? 0,
    }));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op for debug endpoint
        },
      },
    }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  let publicUserRow: { id: string; email: string; role: string | null } | null =
    null;
  let publicUserErr: string | null = null;
  let creatorRow: { user_id: string } | null = null;
  let brandRow: { user_id: string } | null = null;

  if (user) {
    const admin = createAdminClient();
    const { data: u, error: uErr } = await admin
      .from("users")
      .select("id, email, role")
      .eq("id", user.id)
      .maybeSingle();
    publicUserRow = (u as typeof publicUserRow) ?? null;
    publicUserErr = uErr?.message ?? null;

    const { data: c } = await admin
      .from("creators")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    creatorRow = (c as typeof creatorRow) ?? null;

    const { data: b } = await admin
      .from("brands")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    brandRow = (b as typeof brandRow) ?? null;
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: {
      has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_anon_key:
        !!(
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ),
      has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
    cookies: {
      total: allCookies.length,
      sb_cookies: sbCookies,
      cookie_names: allCookies.map((c) => c.name),
    },
    auth: {
      logged_in: !!user,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      get_user_error: userErr?.message ?? null,
    },
    db: {
      public_user_row: publicUserRow,
      public_user_error: publicUserErr,
      has_creator_row: !!creatorRow,
      has_brand_row: !!brandRow,
    },
  });
}
