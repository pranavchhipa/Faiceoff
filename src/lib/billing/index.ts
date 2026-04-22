// ─────────────────────────────────────────────────────────────────────────────
// Billing barrel export — Chunk E two-layer billing (credits + wallet).
// ─────────────────────────────────────────────────────────────────────────────

// Error class
export { BillingError } from "./errors";
export type { BillingErrorCode } from "./errors";

// Types
export type {
  PackCode,
  CreditPack,
  WalletTransactionType,
  WalletTransaction,
  WalletTopUp,
  WalletTopUpStatus,
  CreditTopUp,
  CreditTopUpStatus,
  BrandBillingRow,
  LicenseScope,
  AddCreditsResult,
  DeductCreditResult,
  ReserveWalletResult,
  SpendOrReleaseResult,
} from "./types";

// Credits service
export {
  addCredits,
  deductCredit,
  getCredits,
  freeSignupGrant,
} from "./credits-service";
export type {
  AddCreditsParams,
  AddCreditsReturn,
  DeductCreditParams,
  DeductCreditReturn,
  GetCreditsReturn,
  FreeSignupGrantReturn,
} from "./credits-service";

// Wallet service
export {
  addWallet,
  reserveWallet,
  releaseReserve,
  spendWallet,
  refundWallet,
  getWallet,
} from "./wallet-service";
export type {
  AddWalletParams,
  AddWalletReturn,
  ReserveWalletParams,
  ReserveWalletReturn,
  ReleaseReserveParams,
  ReleaseReserveReturn,
  SpendWalletParams,
  SpendWalletReturn,
  RefundWalletParams,
  RefundWalletReturn,
  GetWalletReturn,
} from "./wallet-service";

// Pack catalog
export {
  getActivePacks,
  getPackByCode,
  upsertPack,
  deactivatePack,
} from "./pack-catalog";
export type { UpsertPackInput } from "./pack-catalog";

// Pricing engine
export {
  computeRate,
  SCOPE_ADDONS_PAISE,
  PLATFORM_COMMISSION_RATE,
  GST_ON_COMMISSION_RATE,
  EXCLUSIVITY_RATE,
} from "./pricing-engine";
export type {
  ComputeRateParams,
  ComputeRateResult,
  RateBreakdown,
} from "./pricing-engine";
