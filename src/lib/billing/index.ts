// ─────────────────────────────────────────────────────────────────────────────
// Billing barrel export — single-pool credits model. Money enters via
// /brand/credits (direct Razorpay purchase) or a paid collab package; every
// generation spends from brands.credits_remaining. The older parallel
// "wallet" (INR balance + reserve/spend) was removed — nothing on the live
// generation path consumed it (see the credits-vs-wallet architecture memo).
// ─────────────────────────────────────────────────────────────────────────────

// Error class
export { BillingError } from "./errors";
export type { BillingErrorCode } from "./errors";

// Types
export type {
  PackCode,
  CreditPack,
  CreditTopUp,
  CreditTopUpStatus,
  BrandBillingRow,
  LicenseScope,
  AddCreditsResult,
  DeductCreditResult,
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
  CREATOR_SHARE_RATE,
  GST_ON_COMMISSION_RATE,
  EXCLUSIVITY_RATE,
} from "./pricing-engine";
export type {
  ComputeRateParams,
  ComputeRateResult,
  RateBreakdown,
} from "./pricing-engine";
