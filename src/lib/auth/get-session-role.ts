import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/config/routes";

export interface SessionRoleResult {
  userId: string | null;
  role: Role | null;
  /** false when the user hasn't finished their onboarding flow */
  onboardingComplete: boolean;
  /** true when we issued a NEW response to attach refreshed cookies */
  refreshedResponse: NextResponse | null;
}

export function resolveRoleFromUserRow(
  row: { role?: string | null } | null,
): Role | null {
  const role = row?.role;
  if (role === "brand" || role === "creator" || role === "admin") return role;
  return null;
}

function anonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

/**
 * Middleware-safe role resolver.
 *
 * 1. Calls Supabase auth.getUser() to refresh the token cookie
 * 2. If logged in, fetches users.role via the anon client (relies on RLS
 *    policy allowing users to read their own row — already in place)
 * 3. Returns a response with the refreshed cookies attached so the caller
 *    can pass it through to NextResponse.next()
 */
export async function getSessionRole(
  request: NextRequest,
  mutableResponse: NextResponse,
): Promise<SessionRoleResult> {
  let response = mutableResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null, onboardingComplete: true, refreshedResponse: response };

  // One service-role client, reused for the role + onboarding lookups (was
  // creating 2-3 fresh clients per request). Service role is used so an RLS
  // misconfiguration on public.users can never silently strip the role and
  // lock users out — we've already authenticated via getUser() above.
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin =
    adminUrl && serviceKey
      ? createSupabaseClient(adminUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  const roleClient = admin ?? supabase; // anon fallback for local dev
  const { data: row, error: roleError } = await roleClient
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = resolveRoleFromUserRow(row as { role?: string | null } | null);
  if (roleError) {
    console.error(`[get-session-role] role lookup failed for ${user.id}: ${roleError.message}`);
  }

  // Onboarding gate — check completion status for creator/brand.
  // Admins are always considered complete. Fail open on any error.
  let onboardingComplete = true;
  if (admin && role === "creator") {
    try {
      const { data: creator } = await admin
        .from("creators")
        .select("onboarding_step")
        .eq("user_id", user.id)
        .maybeSingle();
      onboardingComplete = creator?.onboarding_step === "complete";
    } catch {
      onboardingComplete = true;
    }
  } else if (admin && role === "brand") {
    try {
      const { data: brand } = await admin
        .from("brands")
        .select("company_name")
        .eq("user_id", user.id)
        .maybeSingle();
      onboardingComplete = Boolean(brand?.company_name);
    } catch {
      onboardingComplete = true;
    }
  }

  return {
    userId: user.id,
    role,
    onboardingComplete,
    refreshedResponse: response,
  };
}
