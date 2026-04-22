import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies before any module is imported
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai/openrouter-client', () => ({
  chatCompletion: vi.fn(),
}));

vi.mock('@/lib/observability/sentry', () => ({
  Sentry: { captureMessage: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin';
import { chatCompletion } from '@/lib/ai/openrouter-client';
import { runComplianceCheck, ComplianceError } from '../three-layer-check';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockCreatorId = 'creator-uuid-1234';

const neutralBrief = {
  product: 'red dress',
  scene: 'coffee shop interior',
  mood: 'bright and airy',
  aesthetic: 'editorial',
};

const alcoholBrief = {
  product: 'wine bottle',
  scene: 'vineyard at sunset',
  mood: 'sophisticated',
  aesthetic: 'luxury',
};

/** Build a chainable Supabase mock builder. Each method returns `this` for chaining. */
function buildSupabaseMock(overrides: {
  blockedCategories?: Array<{ category: string }>;
  complianceVectorCount?: number;
  rpcData?: unknown;
  rpcError?: { code: string; message: string };
  dbError?: { message: string };
}) {
  const {
    blockedCategories = [],
    complianceVectorCount = 0,
    rpcData = [],
    rpcError = null,
    dbError = null,
  } = overrides;

  // We need to handle different chains. Track which table was queried last.
  let currentTable = '';

  const chain = {
    from: vi.fn((table: string) => {
      currentTable = table;
      return chain;
    }),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    rpc: vi.fn(() => {
      return Promise.resolve({ data: rpcData, error: rpcError });
    }),
    // Final resolution for table queries
    then: undefined as unknown,
  };

  // Make the chain thenable: different results per table
  (chain as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator as never];

  // We achieve this by making each query method return a custom thenable
  const makeTableResult = (table: string) => {
    if (table === 'creator_blocked_categories') {
      return dbError
        ? { data: null, error: dbError, count: null }
        : { data: blockedCategories, error: null, count: null };
    }
    if (table === 'creator_compliance_vectors') {
      return { data: [], error: null, count: complianceVectorCount };
    }
    return { data: [], error: null, count: 0 };
  };

  let savedTable = '';

  return {
    from: (table: string) => {
      savedTable = table;
      // Build a fully-chainable thenable so the mock works regardless of how
      // many method calls are chained before await (e.g. select().eq()).
      const makeChain = (): Record<string, unknown> => {
        const result = makeTableResult(savedTable);
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve(result),
          then: (resolve: (v: unknown) => void) => resolve(result),
        };
        return chain;
      };
      return makeChain();
    },
    rpc: (_name: string) => {
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runComplianceCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Layer 1: Blocked Categories', () => {
    it('passes when creator has no blocked categories', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({ blockedCategories: [] }) as unknown as ReturnType<typeof createAdminClient>,
      );
      // Layer 3 (LLM) will be reached — stub it to pass
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [{ message: { role: 'assistant', content: '{"violates":false,"reason":"Content is fine."}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: neutralBrief });

      expect(result.passed).toBe(true);
      expect(result.layer).toBeNull();
    });

    it('fails at layer 1 when brief matches a blocked category', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: alcoholBrief });

      expect(result.passed).toBe(false);
      expect(result.layer).toBe(1);
      expect(result.blocked_category).toBe('alcohol');
    });

    it('does not fail at layer 1 when brief does not match blocked category', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'gambling' }], // blocked gambling, brief mentions alcohol
          complianceVectorCount: 0, // no vectors → skip layer 2
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [{ message: { role: 'assistant', content: '{"violates":false,"reason":"No violation."}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: alcoholBrief });
      // Layer 1 should not catch 'alcohol' since only 'gambling' is blocked
      expect(result.layer).not.toBe(1);
    });

    it('propagates DB errors from layer 1 (not fail-open)', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          dbError: { message: 'Connection refused' },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      await expect(
        runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: neutralBrief }),
      ).rejects.toThrow(ComplianceError);
    });
  });

  describe('Layer ordering and short-circuit', () => {
    it('short-circuits at layer 1 and does NOT call LLM when layer 1 fails', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: alcoholBrief });

      expect(result.layer).toBe(1);
      expect(vi.mocked(chatCompletion)).not.toHaveBeenCalled();
    });

    it('reaches layer 3 (LLM) when layers 1 and 2 pass', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [{ message: { role: 'assistant', content: '{"violates":true,"reason":"Explicit adult content."}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: { product: 'explicit content', scene: 'adult scenario' },
      });

      expect(result.layer).toBe(3);
      expect(result.passed).toBe(false);
      expect(result.llm_verdict).toBe('Explicit adult content.');
      expect(vi.mocked(chatCompletion)).toHaveBeenCalledOnce();
    });
  });

  describe('Fail-open behavior', () => {
    it('continues to layer 3 when LLM fails and layer 2 was skipped', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      // Simulate LLM failure
      vi.mocked(chatCompletion).mockRejectedValue(new Error('OpenRouter down'));

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: neutralBrief });

      // Should pass because layer 3 failed-open
      expect(result.passed).toBe(true);
    });

    it('returns passed:true when all external APIs fail and brief has no keyword violations', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockRejectedValue(new Error('LLM timeout'));

      const result = await runComplianceCheck({ creatorId: mockCreatorId, structuredBrief: neutralBrief });
      expect(result.passed).toBe(true);
      expect(result.layer).toBeNull();
    });
  });

  describe('ComplianceError', () => {
    it('has correct code and name', () => {
      const err = new ComplianceError('test error', 'CUSTOM_CODE');
      expect(err.code).toBe('CUSTOM_CODE');
      expect(err.name).toBe('ComplianceError');
      expect(err.message).toBe('test error');
      expect(err instanceof ComplianceError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    it('has default code when none provided', () => {
      const err = new ComplianceError('test');
      expect(err.code).toBe('COMPLIANCE_ERROR');
    });
  });
});
