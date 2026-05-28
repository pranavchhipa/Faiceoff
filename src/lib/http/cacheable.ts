import { NextResponse } from "next/server";

/**
 * Shared helper for hot read endpoints that should be browser-cacheable so
 * repeat navigations within a short window paint instantly off the browser
 * cache rather than re-hitting our DB.
 *
 * Default: `private, max-age=15, stale-while-revalidate=60`
 *   - `private`: per-user response — never let a CDN share it across users.
 *   - `max-age=15`: fresh for 15s. Within that window the browser serves
 *     from cache, no network roundtrip — the felt-fast "instant tab switch".
 *   - `stale-while-revalidate=60`: 15s → 75s window where the browser shows
 *     the stale cached value AND fires a background refresh. The user gets
 *     instant paint + an up-to-date value for next time.
 *
 * **Client side rule**: callers must use the default `fetch()` (no
 * `cache: "no-store"`). `no-store` explicitly bypasses browser cache and
 * neutralises this header — the whole point is to let the browser cache do
 * its job.
 */
export function cachedJson<T>(
  body: T,
  opts: { maxAge?: number; swr?: number; status?: number } = {},
): NextResponse {
  const maxAge = opts.maxAge ?? 15;
  const swr = opts.swr ?? 60;
  return NextResponse.json(body, {
    status: opts.status,
    headers: {
      "Cache-Control": `private, max-age=${maxAge}, stale-while-revalidate=${swr}`,
    },
  });
}
