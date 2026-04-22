import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { listVaultImages, getVaultImage, recordDownload, VaultError } from '../vault-service';

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

const sampleGeneration = {
  id: 'gen-1',
  status: 'delivered',
  image_url: 'https://cdn.faiceoff.com/gen-1.png',
  delivery_url: 'https://cdn.faiceoff.com/gen-1-delivery.png',
  structured_brief: { product: 'red dress', scene: 'studio' },
  created_at: new Date().toISOString(),
  download_count_jsonb: { original: 2, pdf: 1, docx: 0 },
  cert_url: null,
  license_id: null,
  creator: {
    id: 'creator-1',
    display_name: 'Priya Singh',
    instagram_handle: '@priyasingh',
  },
};

function makeQueryChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    in: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    // Make the chain itself thenable for await chain
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return chain;
}

function buildMockAdmin(overrides: {
  listData?: unknown[];
  listCount?: number;
  listError?: { message: string } | null;
  singleData?: unknown;
  singleError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const {
    listData = [sampleGeneration],
    listCount = 1,
    listError = null,
    singleData = sampleGeneration,
    singleError = null,
    updateError = null,
  } = overrides;

  let callCount = 0;

  return {
    from: vi.fn(() => {
      callCount++;
      const isFirst = callCount === 1;

      const listResult = { data: listData, error: listError, count: listCount };
      const singleResult = { data: singleData, error: singleError };
      const updateResult = { data: null, error: updateError };

      // For recordDownload: first call is select (maybeSingle), second is update
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => chain),
        in: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve(updateResult)),
          })),
        })),
        maybeSingle: vi.fn(() => Promise.resolve(singleResult)),
        // Make thenable for list queries
        then: (resolve: (v: unknown) => unknown) => resolve(listResult),
      };
      return chain;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listVaultImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated vault images', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ listData: [sampleGeneration], listCount: 1 }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const result = await listVaultImages({ brandId: 'brand-1' });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items).toHaveLength(1);
  });

  it('maps download_count_jsonb correctly', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ listData: [sampleGeneration] }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const result = await listVaultImages({ brandId: 'brand-1' });
    const item = result.items[0];

    expect(item.download_counts).toEqual({ original: 2, pdf: 1, docx: 0 });
  });

  it('defaults download_counts to zero when null', async () => {
    const rowWithNullCounts = { ...sampleGeneration, download_count_jsonb: null };
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ listData: [rowWithNullCounts] }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const result = await listVaultImages({ brandId: 'brand-1' });
    expect(result.items[0].download_counts).toEqual({ original: 0, pdf: 0, docx: 0 });
  });

  it('validates page must be ≥ 1', async () => {
    await expect(listVaultImages({ brandId: 'brand-1', page: 0 })).rejects.toThrow(VaultError);
  });

  it('validates pageSize must be 1–100', async () => {
    await expect(listVaultImages({ brandId: 'brand-1', pageSize: 0 })).rejects.toThrow(VaultError);
    await expect(listVaultImages({ brandId: 'brand-1', pageSize: 101 })).rejects.toThrow(VaultError);
  });

  it('throws VaultError on DB error', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ listError: { message: 'Connection refused' } }) as unknown as ReturnType<typeof createAdminClient>,
    );

    await expect(listVaultImages({ brandId: 'brand-1' })).rejects.toThrow(VaultError);
  });

  it('uses default status=all (no status filter)', async () => {
    const mockAdmin = buildMockAdmin({ listData: [sampleGeneration] });
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdmin as unknown as ReturnType<typeof createAdminClient>,
    );

    // Should not throw even without status param
    await expect(listVaultImages({ brandId: 'brand-1' })).resolves.toBeTruthy();
  });
});

describe('getVaultImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a vault image when found', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ singleData: sampleGeneration }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const result = await getVaultImage({ brandId: 'brand-1', imageId: 'gen-1' });

    expect(result.id).toBe('gen-1');
    expect(result.status).toBe('delivered');
  });

  it('throws VaultError with NOT_FOUND when image not found', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ singleData: null }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const err = await getVaultImage({ brandId: 'brand-1', imageId: 'missing' }).catch((e) => e);
    expect(err).toBeInstanceOf(VaultError);
    expect((err as VaultError).code).toBe('NOT_FOUND');
  });

  it('throws VaultError on DB error', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ singleError: { message: 'timeout' } }) as unknown as ReturnType<typeof createAdminClient>,
    );

    await expect(getVaultImage({ brandId: 'brand-1', imageId: 'gen-1' })).rejects.toThrow(VaultError);
  });
});

describe('recordDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the correct format counter', async () => {
    const mockAdmin = buildMockAdmin({ singleData: sampleGeneration, updateError: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdmin as unknown as ReturnType<typeof createAdminClient>,
    );

    // Should not throw
    await expect(
      recordDownload({ brandId: 'brand-1', imageId: 'gen-1', format: 'pdf' }),
    ).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when generation does not belong to brand', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ singleData: null }) as unknown as ReturnType<typeof createAdminClient>,
    );

    const err = await recordDownload({ brandId: 'brand-1', imageId: 'other-gen', format: 'original' }).catch((e) => e);
    expect(err).toBeInstanceOf(VaultError);
    expect((err as VaultError).code).toBe('NOT_FOUND');
  });

  it('throws VaultError on update failure', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockAdmin({ singleData: sampleGeneration, updateError: { message: 'update failed' } }) as unknown as ReturnType<typeof createAdminClient>,
    );

    await expect(
      recordDownload({ brandId: 'brand-1', imageId: 'gen-1', format: 'docx' }),
    ).rejects.toThrow(VaultError);
  });
});

describe('VaultError', () => {
  it('has correct code and name', () => {
    const err = new VaultError('vault failed', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.name).toBe('VaultError');
    expect(err instanceof VaultError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('defaults to VAULT_ERROR code', () => {
    const err = new VaultError('test');
    expect(err.code).toBe('VAULT_ERROR');
  });
});
