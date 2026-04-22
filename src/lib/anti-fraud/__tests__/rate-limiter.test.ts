import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Upstash Redis and Ratelimit before any imports
// ---------------------------------------------------------------------------

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/lib/redis/client', () => ({
  redis: {},
}));

// We track constructor calls and slidingWindow calls manually.
const slidingWindowSpy = vi.fn().mockReturnValue({ type: 'sliding_window' });
const constructorCalls: unknown[] = [];

// Ratelimit MUST be a proper constructor function (not an arrow fn) for `new Ratelimit(...)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockRatelimitClass: any = function MockRatelimit(this: any, opts: unknown) {
  constructorCalls.push(opts);
  this.limit = vi.fn().mockResolvedValue({
    success: true,
    remaining: 19,
    reset: Date.now() + 3600000,
    limit: 20,
  });
};
MockRatelimitClass.slidingWindow = slidingWindowSpy;

vi.mock('@upstash/ratelimit', () => ({
  // Return the class from the factory. Note: vi.mock hoists before imports,
  // so we reference MockRatelimitClass (defined above in module scope).
  get Ratelimit() { return MockRatelimitClass; },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Ratelimit } from '@upstash/ratelimit';
import {
  brandGenerationLimiter,
  brandTopupLimiter,
  creatorPayoutLimiter,
  checkRateLimit,
} from '../rate-limiter';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rate Limiter Factories', () => {
  beforeEach(() => {
    constructorCalls.length = 0;
    slidingWindowSpy.mockClear();
  });

  describe('brandGenerationLimiter', () => {
    it('creates a Ratelimit instance with 20/1h sliding window', () => {
      const limiter = brandGenerationLimiter();

      expect(constructorCalls).toHaveLength(1);
      const opts = constructorCalls[0] as Record<string, unknown>;
      expect(opts.analytics).toBe(true);
      expect(typeof opts.prefix).toBe('string');
      expect((opts.prefix as string)).toContain('brandGen');

      expect(slidingWindowSpy).toHaveBeenCalledWith(20, '1 h');
      expect(limiter).toBeDefined();
    });
  });

  describe('brandTopupLimiter', () => {
    it('creates a Ratelimit instance with 5/1h sliding window', () => {
      const limiter = brandTopupLimiter();

      expect(constructorCalls).toHaveLength(1);
      expect(slidingWindowSpy).toHaveBeenCalledWith(5, '1 h');
      expect(limiter).toBeDefined();
    });
  });

  describe('creatorPayoutLimiter', () => {
    it('creates a Ratelimit instance with 2/24h sliding window', () => {
      const limiter = creatorPayoutLimiter();

      expect(constructorCalls).toHaveLength(1);
      expect(slidingWindowSpy).toHaveBeenCalledWith(2, '24 h');
      expect(limiter).toBeDefined();
    });
  });

  describe('checkRateLimit', () => {
    it('returns allowed=true when under limit', async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          remaining: 15,
          reset: Date.now() + 3600000,
          limit: 20,
        }),
      } as unknown as Ratelimit;

      const result = await checkRateLimit(mockLimiter, 'brand-uuid-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(15);
      expect(result.limit).toBe(20);
      expect(mockLimiter.limit).toHaveBeenCalledWith('brand-uuid-123');
    });

    it('returns allowed=false when rate limit exceeded', async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: false,
          remaining: 0,
          reset: Date.now() + 3600000,
          limit: 20,
        }),
      } as unknown as Ratelimit;

      const result = await checkRateLimit(mockLimiter, 'brand-uuid-456');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('uses the correct identifier for limiting', async () => {
      const mockLimitFn = vi.fn().mockResolvedValue({
        success: true,
        remaining: 4,
        reset: Date.now() + 3600000,
        limit: 5,
      });
      const mockLimiter = { limit: mockLimitFn } as unknown as Ratelimit;

      await checkRateLimit(mockLimiter, 'creator-uuid-789');

      expect(mockLimitFn).toHaveBeenCalledWith('creator-uuid-789');
    });
  });
});
