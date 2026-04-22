/**
 * Vault domain types for the brand image vault.
 */

/** Supported download formats for vault images. */
export type DownloadFormat = 'original' | 'pdf' | 'docx';

/** Per-format download counters stored in generations.download_count_jsonb. */
export interface DownloadCounts {
  original: number;
  pdf: number;
  docx: number;
}

/** A single vault image with creator info and download metadata. */
export interface VaultImage {
  id: string;
  status: string;
  image_url: string | null;
  delivery_url: string | null;
  cert_url: string | null;
  license_id: string | null;
  brief: Record<string, unknown>;
  creator: {
    id: string;
    display_name: string;
    instagram_handle: string | null;
  };
  created_at: string;
  download_counts: DownloadCounts;
}

/** Paginated response from listVaultImages. */
export interface VaultListResult {
  items: VaultImage[];
  total: number;
  page: number;
  pageSize: number;
}

/** Input for listing vault images. */
export interface ListVaultImagesInput {
  brandId: string;
  status?: 'all' | 'approved' | 'pending' | 'rejected';
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Input for recording a download event. */
export interface RecordDownloadInput {
  brandId: string;
  imageId: string;
  format: DownloadFormat;
}

/** Input for generating download packages. */
export interface GenerateDownloadInput {
  imageUrl: string;
  certUrl?: string | null;
  generationId: string;
  brief?: Record<string, unknown>;
  creator?: {
    display_name: string;
    instagram_handle?: string | null;
  };
  brand?: {
    company_name: string;
  };
}
