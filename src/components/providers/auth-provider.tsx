"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, User, SupabaseClient } from "@supabase/supabase-js";

/* ── Types ── */

type Role = "creator" | "brand" | null;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  supabase: SupabaseClient;
  isLoading: boolean;
  /**
   * True role, derived from `/api/whoami` (backed by the DB). Use this in UI
   * to decide between creator/brand layouts. `null` while resolving — your
   * UI should handle the null case (spinner) instead of defaulting to a role.
   *
   * Do NOT use `user.user_metadata.role` for UI decisions — it's populated
   * asynchronously and often misses on first render, causing a flash from
   * "creator" (default) to the correct role.
   */
  role: Role;
  /** True while we're still resolving the role via /api/whoami. */
  roleLoading: boolean;
}

/* ── Context ── */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ── Provider ── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
    )
  );

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Role is resolved once per user-id from /api/whoami (DB-backed).
  // We track which user id the role was resolved for so `roleLoading` can
  // be derived SYNCHRONOUSLY during render — critical to prevent the
  // creator-flashing-before-brand bug. A useEffect-based roleLoading flag
  // runs one render after user changes, creating a gap where the UI renders
  // the fallback role before the effect sets the flag.
  const [role, setRole] = useState<Role>(null);
  const [roleResolvedForUserId, setRoleResolvedForUserId] = useState<
    string | null
  >(null);

  const handleAuthChange = useCallback(
    (_event: string, newSession: Session | null) => {
      // Always keep the latest session (access_token may have rotated).
      setSession(newSession);

      // Only update `user` when the identity actually changes (sign-in,
      // sign-out, different account). Supabase fires TOKEN_REFRESHED on
      // every tab focus — if we blindly setUser(newSession.user) we create
      // a new object reference, which cascades re-renders to every
      // component that depends on `user`.
      setUser((prev) => {
        const incoming = newSession?.user ?? null;
        // Same identity → keep the old reference → no child re-renders
        if (prev?.id === incoming?.id) return prev;
        return incoming;
      });

      setIsLoading(false);
    },
    []
  );

  useEffect(() => {
    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, handleAuthChange]);

  // Resolve role from the DB whenever user identity changes.
  // Source of truth order:
  //   1. `has_brand_row` / `has_creator_row` from /api/whoami (authoritative)
  //   2. `public_users_row.role` (secondary — role column on users table)
  //   3. null → UI shows spinner
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleResolvedForUserId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whoami", { cache: "no-store" });
        if (!res.ok) throw new Error(`whoami ${res.status}`);
        const data = (await res.json()) as {
          loggedIn: boolean;
          has_brand_row?: boolean;
          has_creator_row?: boolean;
          public_users_row?: { role?: string | null } | null;
        };
        if (cancelled) return;
        let resolved: Role = null;
        if (data.has_brand_row) resolved = "brand";
        else if (data.has_creator_row) resolved = "creator";
        else if (data.public_users_row?.role === "brand") resolved = "brand";
        else if (data.public_users_row?.role === "creator") resolved = "creator";
        setRole(resolved);
        setRoleResolvedForUserId(user.id);
      } catch (err) {
        console.error("[auth-provider] role resolve failed", err);
        if (!cancelled) {
          setRole(null);
          // Mark as resolved (to failure) so UI stops hanging on spinner
          setRoleResolvedForUserId(user.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Derived synchronously — no useEffect lag. Critical for preventing the
  // role-flash bug: if the current user's role hasn't been resolved yet,
  // consumers see `roleLoading=true` on the SAME render the user arrives,
  // not one render later.
  const roleLoading = !!user && roleResolvedForUserId !== user.id;
  // When loading for a new user, don't hand out a stale role from a previous
  // user's fetch.
  const currentRole: Role = roleLoading ? null : role;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        supabase,
        isLoading,
        role: currentRole,
        roleLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ── */

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
