/**
 * Upstash rate limiters for Faiceoff anti-fraud protection.
 *
 * All limiters use sliding window algorithm. The `analytics: true` flag
 * enables Upstash's built-in analytics dashboard for monitoring.
 *
 * Aligned with the existing pattern in src/lib/redis/rate-limiter.ts.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis/client';

const PREFIX = 'faiceoff:antiFraud';

/**
 * Rate limiter for brand generation requests.
 * Limit: 20 generations per hour per brand.
 */
export function brandGenerationLimiter(): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 h'),
    analytics: true,
    prefix: `${PREFIX}:brandGen`,
  });
}

/**
 * Rate limiter for brand credit top-up requests.
 * Limit: 5 top-ups per hour per brand.
 */
export function brandTopupLimiter(): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    analytics: true,
    prefix: `${PREFIX}:brandTopup`,
  });
}

/**
 * Rate limiter for creator payout requests.
 * Limit: 2 payouts per day per creator.
 */
export function creatorPayoutLimiter(): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(2, '24 h'),
    analytics: true,
    prefix: `${PREFIX}:creatorPayout`,
  });
}

/**
 * Convenience wrapper: check a rate limit and return a standardised result.
 *
 * @param limiter - One of the factory functions above
 * @param identifier - Unique ID (brand_id, creator_id, etc.)
 * @returns `{ allowed, remaining, reset }` — callers should inspect `allowed`
 *          and return 429 if false.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ allowed: boolean; remaining: number; reset: number; limit: number }> {
  const { success, remaining, reset, limit } = await limiter.limit(identifier);
  return { allowed: success, remaining, reset, limit };
}
