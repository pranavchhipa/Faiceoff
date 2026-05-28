"use client";

/**
 * useCachedFetch — minimal SWR-style hook for client-side GETs.
 *
 * The dashboard pages are `"use client"` with `useEffect` fetchers. Every
 * navigation remounts the page → `useState(null)` resets → `useEffect`
 * re-fires the network call → skeleton paints for 1-3 seconds even when
 * the data hasn't changed.
 *
 * This hook caches responses in a **module-scoped Map** that survives
 * unmount/remount. On second visit to a page, the cached data paints
 * instantly while a background refetch keeps the cache fresh (SWR pattern).
 *
 * Usage:
 *   const { data, loading, error, refresh } = useCachedFetch<StatsResp>("/api/dashboard/stats");
 *
 * Invalidation:
 *   import { invalidateCache } from "@/lib/hooks/use-cached-fetch";
 *   invalidateCache("/api/billing/balance"); // after a top-up
 *   invalidateCache();                        // wipe everything
 *
 * The cache lives only for the SPA session — full page reload clears it.
 * Browser HTTP cache (the Cache-Control headers from /lib/http/cacheable)
 * is a separate layer that survives reloads.
 */

import { useEffect, useRef, useState } from "react";

interface CacheEntry<T = unknown> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

/** Subscribers per cache key so an invalidate() can re-render every reader. */
const subscribers = new Map<string, Set<() => void>>();

/** Default freshness window — how long the cached value is "good enough"
 *  to skip a background refetch entirely. After this, on next read we keep
 *  showing the cached value and fire a background refresh. */
const FRESH_MS = 8_000;

function notify(key: string): void {
  const subs = subscribers.get(key);
  if (!subs) return;
  for (const fn of subs) fn();
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
  notify(key);
}

/** Read a key without subscribing — returns null if missing. */
export function readCache<T>(key: string): T | null {
  const e = cache.get(key);
  return e ? (e.data as T) : null;
}

/** Drop a single key (or wipe everything). Pass after writes that touch
 *  the underlying data — e.g. top-up should invalidate the wallet endpoint. */
export function invalidateCache(key?: string): void {
  if (key) {
    cache.delete(key);
    notify(key);
    return;
  }
  for (const k of Array.from(cache.keys())) cache.delete(k);
  for (const k of Array.from(subscribers.keys())) notify(k);
}

interface FetchOpts {
  /** Skip the fetch entirely (e.g. before auth resolves). Defaults to true. */
  enabled?: boolean;
  /** Override the default freshness window. */
  freshMs?: number;
}

export interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Manually re-fetch (e.g. after an action). */
  refresh: () => Promise<void>;
}

export function useCachedFetch<T>(
  url: string | null,
  opts: FetchOpts = {},
): UseCachedFetchResult<T> {
  const enabled = opts.enabled !== false;
  const freshMs = opts.freshMs ?? FRESH_MS;

  // Seed state from cache so a re-mount paints instantly with whatever we
  // already have. Subsequent updates flow via the subscriber notify path.
  const cached = url ? cache.get(url) : undefined;
  const [data, setData] = useState<T | null>(
    cached ? (cached.data as T) : null,
  );
  const [loading, setLoading] = useState<boolean>(
    enabled && url !== null && !cached,
  );
  const [error, setError] = useState<Error | null>(null);

  // Track the latest in-flight fetch so a stale response can't clobber a
  // newer one when the user changes URL quickly.
  const fetchIdRef = useRef(0);

  const refresh = async (): Promise<void> => {
    if (!url) return;
    const myId = ++fetchIdRef.current;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (myId !== fetchIdRef.current) return; // a newer fetch is now authoritative
      setCache(url, json);
      setData(json);
      setError(null);
    } catch (err) {
      if (myId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err : new Error("Fetch failed"));
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  };

  // Subscribe to cache writes for this url so any caller (refresh,
  // invalidateCache) re-pushes data into THIS component's state.
  useEffect(() => {
    if (!url) return;
    const sub = () => {
      const e = cache.get(url);
      setData(e ? (e.data as T) : null);
    };
    let set = subscribers.get(url);
    if (!set) {
      set = new Set();
      subscribers.set(url, set);
    }
    set.add(sub);
    return () => {
      set!.delete(sub);
      if (set!.size === 0) subscribers.delete(url);
    };
  }, [url]);

  // Decide whether to fetch on mount / URL change.
  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }
    const c = cache.get(url);
    const fresh = c && Date.now() - c.ts < freshMs;

    if (c) {
      // Always paint what we have instantly.
      setData(c.data as T);
      setLoading(false);
      // If still inside the freshness window, no network call at all.
      if (fresh) return;
    } else {
      setLoading(true);
    }

    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, freshMs]);

  return { data, loading, error, refresh };
}
