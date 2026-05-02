import { Ratelimit } from '@upstash/ratelimit';

import type { Duration } from '@upstash/ratelimit';

import { redis } from './client';

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW: Duration = '60 s';

/**
 * Rate-limit an action by identifier (e.g. user ID, IP address).
 * Returns `{ success, limit, remaining, reset }`.
 *
 * Fail-open behaviour: if Upstash Redis is unreachable (DNS error,
 * timeout, expired credentials) we let the request through with
 * success=true. Rationale: an outage of our rate-limiter shouldn't
 * cascade into a 500 on every protected endpoint and break the entire
 * platform. The Sentry capture surfaces the issue for ops to fix
 * the env var or upstream cleanly.
 *
 * If you need strict rate limiting on a route (e.g. payments), check
 * `result.failedOpen` and choose your own behaviour.
 */
export async function rateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  window: Duration = DEFAULT_WINDOW,
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  failedOpen?: boolean;
}> {
  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: true,
      prefix: 'faiceoff:ratelimit',
    });

    return await limiter.limit(identifier);
  } catch (err) {
    // Upstash unreachable / config broken → fail open
    console.warn(
      '[rate-limiter] Upstash unavailable, failing open',
      err instanceof Error ? err.message : err,
    );
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now() + 60_000,
      failedOpen: true,
    };
  }
}
