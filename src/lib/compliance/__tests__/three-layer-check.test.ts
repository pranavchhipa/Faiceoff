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

// Studio brief shape (post-Phase-1 fix 1.1). The legacy
// `{product, scene, mood, aesthetic}` field names were silently ignored by
// briefToText() because the Studio sends `product_name` / `custom_notes` /
// pill keys. These fixtures use the actual current shape.
const neutralBrief = {
  product_name: 'red dress',
  setting: 'cafe',                        // label "Cafe" — no keyword triggers
  mood_palette: 'editorial_neutral',       // label "Editorial neutral" — no triggers
  custom_notes: 'bright and airy coffee shop interior',
};

const alcoholBrief = {
  product_name: 'wine bottle',             // "wine" → alcohol keyword
  setting: 'outdoor_street',
  mood_palette: 'cinematic_teal_orange',
  custom_notes: 'vineyard at sunset, sophisticated luxury feel',
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
        structuredBrief: { product_name: 'explicit content', custom_notes: 'adult scenario' },
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

  // ─────────────────────────────────────────────────────────────────────────
  // Fix 1.1 — Studio brief field mapping (regression guard)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Before Phase 1, `briefToText()` read `{product, scene, mood, aesthetic}`
  // while the Studio sent `{product_name, custom_notes, setting, ...}`. The
  // mismatch meant every Studio generation scanned empty strings → blocked
  // categories silently never triggered. These tests are the guard rail
  // against silently regressing into that state.
  // ─────────────────────────────────────────────────────────────────────────
  describe('Fix 1.1 — Studio brief field mapping (regression guard)', () => {
    it('triggers alcohol from product_name "Glenfiddich whiskey" when alcohol is blocked', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: { product_name: 'Glenfiddich whiskey' },
      });

      expect(result.passed).toBe(false);
      expect(result.layer).toBe(1);
      expect(result.blocked_category).toBe('alcohol');
    });

    it('triggers tobacco from product_name "Marlboro cigarette pack" + setting "outdoor_street" when tobacco is blocked', async () => {
      // Note: brand names ("Marlboro") are NOT in CATEGORY_KEYWORDS — only
      // generic terms ("cigarette", "vape", "tobacco"). So this test uses
      // "Marlboro cigarette pack" so the "cigarette" keyword fires. If we
      // ever want brand-name awareness, expand category-mapping.ts.
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'tobacco' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {
          product_name: 'Marlboro cigarette pack',
          setting: 'outdoor_street',
        },
      });

      expect(result.passed).toBe(false);
      expect(result.layer).toBe(1);
      expect(result.blocked_category).toBe('tobacco');
    });

    it('triggers alcohol from a custom: pill value containing a keyword (proves custom: prefix is scanned)', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {
          product_name: 'sneakers',                       // no trigger here
          setting: 'custom:vineyard with wine tasting',    // "wine" trigger via custom value
        },
      });

      expect(result.passed).toBe(false);
      expect(result.layer).toBe(1);
      expect(result.blocked_category).toBe('alcohol');
    });

    it('empty brief produces no false positives even when many categories are blocked', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [
            { category: 'alcohol' },
            { category: 'tobacco' },
            { category: 'gambling' },
            { category: 'adult' },
          ],
          complianceVectorCount: 0, // skip layer 2
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      // Layer 3 LLM mocked to pass — empty brief should reach here
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [
          {
            message: { role: 'assistant', content: '{"violates":false,"reason":"Empty brief, nothing to assess."}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {},
      });

      expect(result.passed).toBe(true);
      expect(result.layer).toBeNull();
    });

    it('does NOT trigger when the keyword appears only in a stored pill KEY (not its label or custom value)', async () => {
      // Sanity check: the pill key `interaction: "drinking_eating"` should be
      // converted to its human label ("Drinking / eating"). The raw key string
      // "drinking_eating" must NOT leak into the scanned text — otherwise the
      // word "drinking" would be picked up by a keyword scan in future. The
      // label "Drinking / eating" contains no category keyword, so it passes.
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [
          {
            message: { role: 'assistant', content: '{"violates":false,"reason":"Innocuous brief."}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {
          product_name: 'water bottle',
          interaction: 'drinking_eating',     // label "Drinking / eating"
          setting: 'cafe',                     // label "Cafe"
        },
      });

      // Layer 1 should not fire; layer 3 says fine.
      expect(result.layer).not.toBe(1);
      expect(result.passed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2.2.b — pack_text scanning by Layer 1 (regression guard)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // pack_text is brand-supplied text that gets reproduced character-for-character
  // on the product label via the PRODUCT TEXT LOCK block. It MUST be scanned by
  // compliance — otherwise a brand could write "Budweiser Lager" in pack_text
  // and slip an alcohol mention past an alcohol-blocked creator via the back
  // door (Studio pills + product_name all clean, but the rendered label shouts
  // BEER).
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 2.2.b — pack_text scanning', () => {
    it('triggers alcohol from pack_text "BUDWEISER BEER" when alcohol is blocked', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
        }) as unknown as ReturnType<typeof createAdminClient>,
      );

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {
          product_name: 'refreshing summer drink',  // no keyword on its own
          pack_text: 'BUDWEISER BEER — 330 ML',     // "beer" → alcohol keyword
        },
      });

      expect(result.passed).toBe(false);
      expect(result.layer).toBe(1);
      expect(result.blocked_category).toBe('alcohol');
    });

    it('does NOT trigger when pack_text is clean', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [
          {
            message: { role: 'assistant', content: '{"violates":false,"reason":"Clean."}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await runComplianceCheck({
        creatorId: mockCreatorId,
        structuredBrief: {
          product_name: 'Mango Sorbet SPF 50',
          pack_text: 'Mango Sorbet SPF 50 — 60 ml — Reef Safe',
        },
      });

      expect(result.passed).toBe(true);
      expect(result.layer).toBeNull();
    });

    it('treats undefined / null / empty pack_text the same as the field being absent', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildSupabaseMock({
          blockedCategories: [{ category: 'alcohol' }],
          complianceVectorCount: 0,
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(chatCompletion).mockResolvedValue({
        id: 'test',
        choices: [
          {
            message: { role: 'assistant', content: '{"violates":false,"reason":"Clean."}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      for (const variant of [{}, { pack_text: undefined }, { pack_text: null }, { pack_text: '' }] as const) {
        const result = await runComplianceCheck({
          creatorId: mockCreatorId,
          structuredBrief: { product_name: 'sneakers', ...variant },
        });
        expect(result.passed).toBe(true);
      }
    });
  });
});
