import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Role } from "@/config/routes";

/**
 * Middleware-side session/role resolution.
 *
 * Perf contract (this file is on the critical path of EVERY navigation):
 *  - Anonymous requests never reach this module (proxy.ts short-circuits
 *    on "no sb-* auth cookie" with zero network calls).
 *  - Cache hit  → exactly 1 network call  (auth.getUser — also refreshes
 *    the token when needed).
 *  - Cache miss → 2 network round-trip times (getUser, then users/creators/
 *    brands looked up IN PARALLEL and cached in the `fo_mw` cookie).
 *
 * The old implementation did getUser + role select + onboarding select
 * SEQUENTIALLY on every matched request — including /api/* and public pages
 * where the result was discarded — which taxed every interaction in the app.
 */

export interface SessionRoleResult {
  userId: string | null;
  role: Role | null;
  /** false when the user hasn't finished their onboarding flow */
  onboardingComplete: boolean;
  /** Cookies Supabase asked us to persist (token refresh). Apply to the response. */
  pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[];
  /** True when role/onboarding came from the fo_mw cache cookie (skip re-set). */
  cacheHit: boolean;
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

/* ── Role/onboarding cache cookie ────────────────────────────────────────────
   Format: `${userId}:${role}:${ob}:${expiresEpochMs}` — httpOnly, 10 min.

   Only STEADY-STATE users (onboarding complete) are cached, so finishing
   onboarding is never masked by a stale cookie. The value is bound to the
   getUser()-verified user id; a user tampering with their own cookie can only
   change which dashboard SHELL the router sends them to — every API route and
   server page re-checks role/ownership against the DB, so no privilege is
   derivable from this cookie. */

export const MW_CACHE_COOKIE = "fo_mw";
const MW_CACHE_TTL_MS = 10 * 60 * 1000;

function readMwCache(
  request: NextRequest,
  userId: string,
): { role: Role; onboardingComplete: boolean } | null {
  const raw = request.cookies.get(MW_CACHE_COOKIE)?.value;
  if (!raw) return null;
  const [uid, role, ob, exp] = raw.split(":");
  if (uid !== userId) return null;
  if (!exp || Number(exp) < Date.now()) return null;
  if (role !== "brand" && role !== "creator" && role !== "admin") return null;
  return { role, onboardingComplete: ob === "1" };
}

export function buildMwCacheValue(userId: string, role: Role): string {
  return `${userId}:${role}:1:${Date.now() + MW_CACHE_TTL_MS}`;
}

export async function getSessionRole(
  request: NextRequest,
): Promise<SessionRoleResult> {
  const pendingCookies: SessionRoleResult["pendingCookies"] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Mutate the request so the FORWARDED request carries the refreshed
          // token (proxy.ts snapshots request headers after this runs), and
          // collect the cookies so the caller can attach them to the response
          // for the browser. The old code only did the latter — downstream
          // handlers kept seeing the stale token and re-refreshing it.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            pendingCookies.push({ name, value, options: options as Record<string, unknown> });
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { userId: null, role: null, onboardingComplete: true, pendingCookies, cacheHit: false };
  }

  // Fast path: cached role for this exact user — zero extra round trips.
  const cached = readMwCache(request, user.id);
  if (cached) {
    return {
      userId: user.id,
      role: cached.role,
      onboardingComplete: cached.onboardingComplete,
      pendingCookies,
      cacheHit: true,
    };
  }

  // One service-role client for the lookups. Service role is used so an RLS
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

  // All three lookups are independent — run them concurrently (1 RT of
  // latency instead of 2-3). The creator/brand rows are only read if the
  // resolved role matches, so the extra query is wasted only for admins.
  const [userRes, creatorRes, brandRes] = await Promise.all([
    roleClient.from("users").select("role").eq("id", user.id).maybeSingle(),
    admin
      ? admin.from("creators").select("onboarding_step").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      ? admin.from("brands").select("company_name").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const role = resolveRoleFromUserRow(userRes.data as { role?: string | null } | null);
  if (userRes.error) {
    console.error(`[get-session-role] role lookup failed for ${user.id}: ${userRes.error.message}`);
  }

  // Onboarding gate — admins always complete; fail open on missing data.
  let onboardingComplete = true;
  if (admin && role === "creator") {
    onboardingComplete =
      (creatorRes.data as { onboarding_step?: string | null } | null)?.onboarding_step === "complete";
  } else if (admin && role === "brand") {
    onboardingComplete = Boolean(
      (brandRes.data as { company_name?: string | null } | null)?.company_name,
    );
  }

  return { userId: user.id, role, onboardingComplete, pendingCookies, cacheHit: false };
}
