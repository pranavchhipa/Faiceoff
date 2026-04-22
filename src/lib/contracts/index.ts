/**
 * Contract generation + storage.
 *
 * Public API for click-to-accept license contracts:
 * - `generateContract(input)` — markdown + frozen terms snapshot
 * - `renderContractPdf(markdown)` — markdown → PDF Buffer
 * - `uploadContract(...)` — push PDF to R2, returns path + SHA-256
 * - `getSignedContractUrl(path, ttl?)` — presigned GET URL for viewer/download
 */

export {
  CONTRACT_CONSTANTS,
  formatIstDateTime,
  formatRupees,
  generateContract,
  type ContractTerms,
  type GenerateContractInput,
  type GenerateContractResult,
  type LicenseTemplate,
} from "./template";

export { renderContractPdf } from "./pdf-render";

export {
  CONTRACTS_BUCKET_DEFAULT,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  getSignedContractUrl,
  uploadContract,
  type UploadContractParams,
  type UploadContractResult,
} from "./storage";
