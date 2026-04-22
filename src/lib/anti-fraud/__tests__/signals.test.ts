import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { checkSignals, FraudError } from '../signals';

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

function makeCountResponse(count: number, error: { message: string } | null = null) {
  return { count, data: null, error };
}

function makeDataResponse<T>(data: T[], error: { message: string } | null = null) {
  return { data, error, count: null };
}

/** Builds a Supabase admin client mock with configurable per-table responses. */
function buildMockAdmin(config: {
  generationsCount?: number;
  generationsData?: Array<{ structured_brief: unknown }>;
  creditTopupsCount?: number;
  creatorRow?: { created_at: string; kyc_status: string } | null;
  auditLogData?: Array<{ metadata: unknown }>;
}) {
  const {
    generationsCount = 0,
    generationsData = [],
    creditTopupsCount = 0,
    creatorRow = null,
    auditLogData = [],
  } = config;

  let currentTable = '';

  const headChain = {
    select: vi.fn(() => headChain),
    eq: vi.fn(() => headChain),
    gte: vi.fn(() => Promise.resolve(makeCountResponse(generationsCount))),
    maybeSingle: vi.fn(() => Promise.resolve({ data: creatorRow, error: null })),
  };

  const dataChain = {
    select: vi.fn(() => dataChain),
    eq: vi.fn(() => dataChain),
    gte: vi.fn(() => Promise.resolve(makeDataResponse(generationsData))),
    maybeSingle: vi.fn(() => Promise.resolve({ data: creatorRow, error: null })),
  };

  return {
    from: vi.fn((table: string) => {
      currentTable = table;

      if (table === 'generations') {
        return {
          select: (fields: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  gte: () => Promise.resolve(makeCountResponse(generationsCount)),
                }),
              };
            }
            return {
              eq: () => ({
                gte: () => Promise.resolve(makeDataResponse(generationsData)),
              }),
            };
          },
        };
      }

      if (table === 'credit_top_ups') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve(makeCountResponse(creditTopupsCount)),
            }),
          }),
        };
      }

      if (table === 'creators') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: creatorRow, error: null }),
            }),
          }),
        };
      }

      if (table === 'audit_log') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve(makeDataResponse(auditLogData)),
            }),
          }),
        };
      }

      return dataChain;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('velocity_burst signal', () => {
    it('detects velocity burst when > 10 generations in 5 min', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({ generationsCount: 15 }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const burst = results.find((r) => r.signal === 'velocity_burst');

      expect(burst).toBeDefined();
      expect(burst!.detected).toBe(true);
      expect(burst!.severity).toBe('high');
    });

    it('does not detect velocity burst when ≤ 10 generations', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({ generationsCount: 5 }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const burst = results.find((r) => r.signal === 'velocity_burst');

      expect(burst!.detected).toBe(false);
    });

    it('does not detect velocity burst at exactly 10', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({ generationsCount: 10 }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const burst = results.find((r) => r.signal === 'velocity_burst');

      expect(burst!.detected).toBe(false);
    });
  });

  describe('low_diversity signal', () => {
    it('detects low diversity when same brief repeated ≥ 3 times', async () => {
      const repeatBrief = { product: 'red dress', scene: 'studio' };
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({
          generationsCount: 3,
          generationsData: [
            { structured_brief: repeatBrief },
            { structured_brief: repeatBrief },
            { structured_brief: repeatBrief },
          ],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const diversity = results.find((r) => r.signal === 'low_diversity');

      expect(diversity!.detected).toBe(true);
    });

    it('does not detect low diversity for varied briefs', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({
          generationsCount: 3,
          generationsData: [
            { structured_brief: { product: 'dress', scene: 'studio' } },
            { structured_brief: { product: 'jacket', scene: 'outdoor' } },
            { structured_brief: { product: 'shoes', scene: 'rooftop' } },
          ],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const diversity = results.find((r) => r.signal === 'low_diversity');

      expect(diversity!.detected).toBe(false);
    });
  });

  describe('rapid_credit_topup signal', () => {
    it('detects rapid topup when ≥ 3 topups in 1h', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({ creditTopupsCount: 4 }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const topup = results.find((r) => r.signal === 'rapid_credit_topup');

      expect(topup!.detected).toBe(true);
      expect(topup!.severity).toBe('medium');
    });

    it('does not detect rapid topup below threshold', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({ creditTopupsCount: 2 }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      const topup = results.find((r) => r.signal === 'rapid_credit_topup');

      expect(topup!.detected).toBe(false);
    });
  });

  describe('kyc_age_low signal', () => {
    it('detects new creator account (< 24h old)', async () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({
          creatorRow: { created_at: recentDate, kyc_status: 'pending' },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ creatorId: 'creator-1' });
      const kycAge = results.find((r) => r.signal === 'kyc_age_low');

      expect(kycAge!.detected).toBe(true);
      expect(kycAge!.severity).toBe('medium');
    });

    it('does not flag established creator (> 24h)', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({
          creatorRow: { created_at: oldDate, kyc_status: 'approved' },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ creatorId: 'creator-1' });
      const kycAge = results.find((r) => r.signal === 'kyc_age_low');

      expect(kycAge!.detected).toBe(false);
    });
  });

  describe('signal count', () => {
    it('returns no signals when no input provided', async () => {
      const results = await checkSignals({});
      expect(results).toHaveLength(0);
    });

    it('returns brand signals (3) when only brandId provided', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({}) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ brandId: 'brand-1' });
      expect(results).toHaveLength(3);
      const signalNames = results.map((r) => r.signal);
      expect(signalNames).toContain('velocity_burst');
      expect(signalNames).toContain('low_diversity');
      expect(signalNames).toContain('rapid_credit_topup');
    });

    it('returns creator signals (1) when only creatorId provided', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildMockAdmin({
          creatorRow: {
            created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
            kyc_status: 'approved',
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const results = await checkSignals({ creatorId: 'creator-1' });
      expect(results).toHaveLength(1);
      expect(results[0].signal).toBe('kyc_age_low');
    });
  });

  describe('FraudError', () => {
    it('has correct code and name', () => {
      const err = new FraudError('test', 'TEST_CODE');
      expect(err.code).toBe('TEST_CODE');
      expect(err.name).toBe('FraudError');
      expect(err instanceof FraudError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });
  });
});
