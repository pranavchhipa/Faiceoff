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

type Role = "creator" | "brand" | "admin" | null;

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
  /**
   * Force-refresh the cached `user` object from Supabase auth — call after
   * mutating user_metadata (avatar_url, display_name) from the server so the
   * client sees the updated values without a page reload.
   */
  refreshUser: () => Promise<void>;
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

  // ── Role cache helpers (sessionStorage) ──────────────────────────────────
  // Caches resolved role by userId so returning users skip the whoami round
  // trip on every page load — eliminates the "Loading workspace..." flash.
  const ROLE_CACHE_KEY = "fco:role";
  function readRoleCache(userId: string): Role | null {
    try {
      const raw = sessionStorage.getItem(ROLE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { uid: string; role: Role };
      return parsed.uid === userId ? parsed.role : null;
    } catch { return null; }
  }
  function writeRoleCache(userId: string, r: Role) {
    try { sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid: userId, role: r })); }
    catch { /* storage unavailable */ }
  }
  function clearRoleCache() {
    try { sessionStorage.removeItem(ROLE_CACHE_KEY); } catch { /* noop */ }
  }

  const handleAuthChange = useCallback(
    (_event: string, newSession: Session | null) => {
      // Always keep the latest session (access_token may have rotated).
      setSession(newSession);

      // Update `user` when identity changes OR when metadata fields the UI
      // renders (avatar_url, display_name) have changed. Without the metadata
      // check, profile photo / display name updates wouldn't propagate
      // because Supabase fires TOKEN_REFRESHED with the same id but new
      // metadata. With the check, we still skip re-renders for boring token
      // refreshes (every tab focus) since metadata is unchanged then.
      setUser((prev) => {
        const incoming = newSession?.user ?? null;
        if (!prev || !incoming) return incoming;
        if (prev.id !== incoming.id) return incoming;
        const prevMeta = prev.user_metadata ?? {};
        const newMeta = incoming.user_metadata ?? {};
        if (
          prevMeta.avatar_url !== newMeta.avatar_url ||
          prevMeta.display_name !== newMeta.display_name
        ) {
          return incoming;
        }
        return prev;
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
  //   1. sessionStorage cache (instant — skips whoami on returning visits)
  //   2. `has_brand_row` / `has_creator_row` from /api/whoami (authoritative)
  //   3. `public_users_row.role` (secondary — role column on users table)
  //   4. null → UI shows spinner
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleResolvedForUserId(null);
      clearRoleCache();
      return;
    }

    // Fast path: cached role for this user — resolve instantly, skip spinner
    const cached = readRoleCache(user.id);
    if (cached) {
      setRole(cached);
      setRoleResolvedForUserId(user.id);
      // Still refresh in background to pick up any role changes, but don't block UI
      // Server caches /api/whoami at 30s + 5min SWR so background refreshes
      // during a session are nearly free.
      fetch("/api/whoami")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          let resolved: Role = null;
          if (data.public_users_row?.role === "admin") resolved = "admin";
          else if (data.has_brand_row) resolved = "brand";
          else if (data.has_creator_row) resolved = "creator";
          else if (data.public_users_row?.role === "brand") resolved = "brand";
          else if (data.public_users_row?.role === "creator") resolved = "creator";
          if (resolved && resolved !== cached) {
            setRole(resolved);
            writeRoleCache(user.id, resolved);
          }
        })
        .catch(() => { /* silent — cached value still in use */ });
      return;
    }

    // Slow path: no cache — fetch whoami and show spinner until resolved
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whoami");
        if (!res.ok) throw new Error(`whoami ${res.status}`);
        const data = (await res.json()) as {
          loggedIn: boolean;
          has_brand_row?: boolean;
          has_creator_row?: boolean;
          public_users_row?: { role?: string | null } | null;
        };
        if (cancelled) return;
        let resolved: Role = null;
        if (data.public_users_row?.role === "admin") resolved = "admin";
        else if (data.has_brand_row) resolved = "brand";
        else if (data.has_creator_row) resolved = "creator";
        else if (data.public_users_row?.role === "brand") resolved = "brand";
        else if (data.public_users_row?.role === "creator") resolved = "creator";
        setRole(resolved);
        setRoleResolvedForUserId(user.id);
        writeRoleCache(user.id, resolved);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Derived synchronously — no useEffect lag. Critical for preventing the
  // role-flash bug: if the current user's role hasn't been resolved yet,
  // consumers see `roleLoading=true` on the SAME render the user arrives,
  // not one render later.
  const roleLoading = !!user && roleResolvedForUserId !== user.id;
  // When loading for a new user, don't hand out a stale role from a previous
  // user's fetch.
  const currentRole: Role = roleLoading ? null : role;

  const refreshUser = useCallback(async () => {
    const { data: { user: fresh } } = await supabase.auth.getUser();
    if (!fresh) return;
    setUser((prev) => {
      if (!prev) return fresh;
      const prevMeta = prev.user_metadata ?? {};
      const newMeta = fresh.user_metadata ?? {};
      if (
        prev.id !== fresh.id ||
        prevMeta.avatar_url !== newMeta.avatar_url ||
        prevMeta.display_name !== newMeta.display_name
      ) {
        return fresh;
      }
      return prev;
    });
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        supabase,
        isLoading,
        role: currentRole,
        roleLoading,
        refreshUser,
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
