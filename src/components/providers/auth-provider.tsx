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

  // Role is resolved once per user-id from /api/whoami (DB-backed), cached
  // here so every consumer in the app sees the same value with no flash.
  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);

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
      setRoleLoading(false);
      return;
    }
    let cancelled = false;
    setRoleLoading(true);
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
      } catch (err) {
        console.error("[auth-provider] role resolve failed", err);
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, session, supabase, isLoading, role, roleLoading }}
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
