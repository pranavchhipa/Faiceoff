/**
 * Faiceoff Vault Library
 *
 * Brand image vault — list, search, fetch, and download licensed generations.
 *
 * Usage:
 *   const { items, total } = await listVaultImages({ brandId, page: 1, pageSize: 20 });
 *
 *   const zipBuffer = await generateOriginalZip({ imageUrl, generationId });
 *   const pdfBuffer = await generatePdfPackage({ imageUrl, generationId, brief });
 *   const docxBuffer = await generateDocxPackage({ imageUrl, generationId, brief, creator, brand });
 *
 *   await recordDownload({ brandId, imageId, format: 'original' });
 */

export { listVaultImages, getVaultImage, recordDownload, VaultError } from './vault-service';
export { generateOriginalZip, generatePdfPackage, generateDocxPackage } from './download-formats';
export type {
  VaultImage,
  VaultListResult,
  ListVaultImagesInput,
  RecordDownloadInput,
  GenerateDownloadInput,
  DownloadFormat,
  DownloadCounts,
} from './types';
