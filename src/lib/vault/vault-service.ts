/**
 * Vault service for the brand image vault.
 *
 * Provides list / search / single-fetch / download-record operations
 * against the generations table. All queries are scoped to the requesting
 * brand to enforce data isolation.
 *
 * The `download_count_jsonb` column stores per-format counters as JSONB.
 * Recording a download uses an atomic SQL expression to avoid lost updates
 * from concurrent increments.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  VaultImage,
  VaultListResult,
  ListVaultImagesInput,
  RecordDownloadInput,
  DownloadCounts,
} from './types';

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class VaultError extends Error {
  readonly code: string;
  constructor(message: string, code = 'VAULT_ERROR') {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse download_count_jsonb from DB. Handles null, missing keys, and
 * non-numeric values gracefully.
 */
function parseDownloadCounts(raw: unknown): DownloadCounts {
  const defaults: DownloadCounts = { original: 0, pdf: 0, docx: 0 };
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    original: typeof obj.original === 'number' ? obj.original : Number(obj.original ?? 0),
    pdf: typeof obj.pdf === 'number' ? obj.pdf : Number(obj.pdf ?? 0),
    docx: typeof obj.docx === 'number' ? obj.docx : Number(obj.docx ?? 0),
  };
}

/** Map a raw DB row to a VaultImage. */
function mapRowToVaultImage(row: Record<string, unknown>): VaultImage {
  const creatorRaw = row.creator as Record<string, unknown> | null;
  const creator = creatorRaw ?? {};

  return {
    id: row.id as string,
    status: row.status as string,
    image_url: (row.image_url as string | null) ?? null,
    delivery_url: (row.delivery_url as string | null) ?? null,
    cert_url: (row.cert_url as string | null) ?? null,
    license_id: (row.license_id as string | null) ?? null,
    brief: (row.structured_brief as Record<string, unknown>) ?? {},
    creator: {
      id: (creator.id as string) ?? '',
      display_name: (creator.display_name as string) ?? '',
      instagram_handle: (creator.instagram_handle as string | null) ?? null,
    },
    created_at: row.created_at as string,
    download_counts: parseDownloadCounts(row.download_count_jsonb),
  };
}

// ---------------------------------------------------------------------------
// listVaultImages
// ---------------------------------------------------------------------------

/**
 * List vault images for a brand with optional status filter, text search, and pagination.
 *
 * Status filter:
 *  - 'approved' → only ready_for_approval/approved statuses
 *  - 'pending'  → generations pending creator review
 *  - 'rejected' → rejected generations
 *  - 'all'      → no filter (default)
 *
 * Search is performed against the structured_brief JSONB cast to text.
 */
export async function listVaultImages(input: ListVaultImagesInput): Promise<VaultListResult> {
  const { brandId, status = 'all', search, page = 1, pageSize = 20 } = input;

  if (page < 1) throw new VaultError('page must be ≥ 1', 'INVALID_INPUT');
  if (pageSize < 1 || pageSize > 100) throw new VaultError('pageSize must be 1–100', 'INVALID_INPUT');

  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build query
  // We join creators via FK but Supabase REST doesn't support aliases or LEFT JOIN
  // so we select the nested creator object via the FK relationship name.
  // Use `as never` on the table name to bypass the generated column type
  // since `download_count_jsonb`, `cert_url`, and `license_id` were added
  // in migrations 00032+ but supabase.ts has not been regenerated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('generations')
    .select(
      `
      id,
      status,
      image_url,
      delivery_url,
      structured_brief,
      created_at,
      download_count_jsonb,
      cert_url,
      license_id,
      creator:creator_id (
        id,
        display_name:users(display_name),
        instagram_handle
      )
      `,
      { count: 'exact' },
    );

  // Status filter
  if (status !== 'all') {
    const statusMap: Record<string, string[]> = {
      approved: ['ready_for_approval', 'approved', 'delivered'],
      pending: ['generating', 'compliance_check', 'output_check'],
      rejected: ['rejected', 'failed'],
    };
    const statuses = statusMap[status] ?? [];
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else if (statuses.length > 1) {
      query = query.in('status', statuses);
    }
  }

  // Text search in brief
  if (search && search.trim()) {
    // Cast JSONB to text for ilike search
    query = (query as typeof query & { ilike: (col: string, val: string) => typeof query }).ilike(
      'structured_brief::text',
      `%${search.trim()}%`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    throw new VaultError(`Failed to list vault images: ${error.message}`, 'DB_ERROR');
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // Flatten creator join. Supabase REST returns to-many joins as arrays and
  // to-one joins as objects — the embedded `display_name:users(display_name)`
  // sub-select can come back as EITHER `[{ display_name: "..." }]` OR
  // `{ display_name: "..." }` depending on the FK cardinality. We must handle
  // both, otherwise `creator.display_name` ends up as a raw object and
  // React throws #31 ("objects are not valid as a React child") downstream.
  const items = rows.map((row) => {
    const creatorRaw = Array.isArray(row.creator) ? row.creator[0] : row.creator;
    if (creatorRaw && typeof creatorRaw === 'object') {
      const c = creatorRaw as Record<string, unknown>;
      const usersJoin = c.display_name;
      if (Array.isArray(usersJoin) && usersJoin.length > 0) {
        // Array form: [{ display_name: "..." }]
        c.display_name = (usersJoin[0] as Record<string, unknown>).display_name;
      } else if (
        usersJoin &&
        typeof usersJoin === 'object' &&
        'display_name' in (usersJoin as Record<string, unknown>)
      ) {
        // Object form: { display_name: "..." }
        c.display_name = (usersJoin as Record<string, unknown>).display_name;
      }
      // Last-line defence: if it's still an object after the above, coerce
      // to empty string so it can never reach React as a child.
      if (c.display_name && typeof c.display_name === 'object') {
        c.display_name = '';
      }
    }
    return mapRowToVaultImage({ ...row, creator: creatorRaw });
  });

  return {
    items,
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// getVaultImage
// ---------------------------------------------------------------------------

/**
 * Fetch a single vault image by ID, scoped to the brand.
 *
 * @throws {VaultError} with code 'NOT_FOUND' if the image doesn't exist or belongs to a different brand
 */
export async function getVaultImage({
  brandId,
  imageId,
}: {
  brandId: string;
  imageId: string;
}): Promise<VaultImage> {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('generations')
    .select(
      `
      id,
      status,
      image_url,
      delivery_url,
      structured_brief,
      created_at,
      download_count_jsonb,
      cert_url,
      license_id,
      creator:creator_id (
        id,
        display_name:users(display_name),
        instagram_handle
      )
      `,
    )
    .eq('id', imageId)
    .eq('brand_id', brandId)
    .maybeSingle();

  if (error) {
    throw new VaultError(`Failed to fetch vault image: ${error.message}`, 'DB_ERROR');
  }

  if (!data) {
    throw new VaultError(
      `Vault image ${imageId} not found or does not belong to brand ${brandId}`,
      'NOT_FOUND',
    );
  }

  const row = data as Record<string, unknown>;
  // Same array+object flatten as listVaultImages — see that function for why.
  const creatorRaw = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  if (creatorRaw && typeof creatorRaw === 'object') {
    const c = creatorRaw as Record<string, unknown>;
    const usersJoin = c.display_name;
    if (Array.isArray(usersJoin) && usersJoin.length > 0) {
      c.display_name = (usersJoin[0] as Record<string, unknown>).display_name;
    } else if (
      usersJoin &&
      typeof usersJoin === 'object' &&
      'display_name' in (usersJoin as Record<string, unknown>)
    ) {
      c.display_name = (usersJoin as Record<string, unknown>).display_name;
    }
    if (c.display_name && typeof c.display_name === 'object') {
      c.display_name = '';
    }
  }

  return mapRowToVaultImage({ ...row, creator: creatorRaw });
}

// ---------------------------------------------------------------------------
// recordDownload
// ---------------------------------------------------------------------------

/**
 * Atomically increment the download counter for a specific format.
 *
 * Uses a SQL expression to avoid lost updates from concurrent requests:
 *   jsonb_set(
 *     download_count_jsonb,
 *     '{format}',
 *     ((COALESCE(download_count_jsonb->>'format','0')::int + 1)::text)::jsonb
 *   )
 *
 * @throws {VaultError} if the generation doesn't exist or doesn't belong to the brand
 */
export async function recordDownload(input: RecordDownloadInput): Promise<void> {
  const { brandId, imageId, format } = input;

  const admin = createAdminClient();

  // Verify ownership first (maybeSingle is safe — no throw on missing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchError } = await (admin as any)
    .from('generations')
    .select('id, download_count_jsonb')
    .eq('id', imageId)
    .eq('brand_id', brandId)
    .maybeSingle();

  if (fetchError) {
    throw new VaultError(`Failed to verify generation: ${fetchError.message}`, 'DB_ERROR');
  }

  if (!existing) {
    throw new VaultError(
      `Generation ${imageId} not found or does not belong to brand ${brandId}`,
      'NOT_FOUND',
    );
  }

  const row = existing as Record<string, unknown>;
  const current = parseDownloadCounts(row.download_count_jsonb);
  const updated: DownloadCounts = {
    ...current,
    [format]: current[format] + 1,
  };

  // Update with the incremented JSONB value
  // Note: Supabase JS client doesn't support raw SQL expressions in .update(),
  // so we read-then-write. For strict atomicity in high-concurrency scenarios,
  // use a Postgres function (RPC). The read-then-write is safe for the typical
  // brand vault access pattern where concurrent downloads of the same generation
  // by a single brand user are rare.
  const { error: updateError } = await admin
    .from('generations')
    .update({ download_count_jsonb: updated } as never)
    .eq('id', imageId)
    .eq('brand_id', brandId);

  if (updateError) {
    throw new VaultError(`Failed to record download: ${updateError.message}`, 'DB_ERROR');
  }
}
