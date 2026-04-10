import { Ratelimit } from '@upstash/ratelimit';

import type { Duration } from '@upstash/ratelimit';

import { redis } from './client';

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW: Duration = '60 s';

/**
 * Rate-limit an action by identifier (e.g. user ID, IP address).
 * Returns `{ success, limit, remaining, reset }`.
 */
export async function rateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  window: Duration = DEFAULT_WINDOW,
) {
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix: 'faiceoff:ratelimit',
  });

  return limiter.limit(identifier);
}
