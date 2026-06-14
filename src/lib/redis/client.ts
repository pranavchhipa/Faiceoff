import { Redis } from '@upstash/redis';

/**
 * Lazy, null-safe Upstash Redis client.
 *
 * The Upstash env vars (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 * are frequently absent or stale (see CLAUDE.md "What's BROKEN"). Constructing
 * the client at MODULE scope used to throw at import time when either var was
 * missing — which crashed EVERY route that imports the rate-limiter, defeating
 * the documented fail-open intent.
 *
 * Instead we build the client lazily inside a memoized getter and return `null`
 * when either env var is absent/empty. Callers (see rate-limiter.ts) treat a
 * null client as fail-open. No throw, ever.
 */
let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    cached = null;
    return cached;
  }

  cached = new Redis({ url, token });
  return cached;
}

/**
 * Backward-compatible binding for existing `import { redis }` consumers.
 * Resolves via the lazy getter, so it is `null` (never a throw) when the
 * Upstash env vars are missing. Prefer `getRedis()` in new code.
 */
export const redis = getRedis();
