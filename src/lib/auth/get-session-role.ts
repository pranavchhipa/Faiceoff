import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/config/routes";

export interface SessionRoleResult {
  userId: string | null;
  role: Role | null;
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
  if (!user) return { userId: null, role: null, refreshedResponse: response };

  const { data: row } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: resolveRoleFromUserRow(row as { role?: string | null } | null),
    refreshedResponse: response,
  };
}
