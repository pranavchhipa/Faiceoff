/**
 * Payout service — barrel export.
 *
 * Usage:
 *   import { requestPayout, handlePayoutWebhook, PayoutError } from '@/lib/payouts';
 */

export {
  requestPayout,
  handlePayoutWebhook,
  listPayouts,
  getPayout,
  computeTDS,
  computeProcessingFee,
  computeNet,
  getMinPayoutPaise,
} from "./payout-service";

export { PayoutError } from "./types";
export type {
  PayoutErrorCode,
  PayoutStatus,
  PayoutRow,
  EscrowLedgerRow,
  CreatorRow,
  CreatorBankAccountRow,
  RequestPayoutInput,
  PayoutDeductions,
  PayoutWebhookEvent,
  ListPayoutsInput,
  ListPayoutsResult,
} from "./types";
