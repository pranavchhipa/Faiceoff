/**
 * Cashfree Payouts — transfers + beneficiaries.
 *
 * Used for creator withdrawals once `withdrawal_requests` has been validated
 * (KYC verified, penny-drop passed, pending_balance ≥ ₹500).
 *
 * Flow:
 *   1. `createBeneficiary` registers the creator's bank account once (idempotent
 *      on beneficiary_id). We re-use the creator_user_id as beneficiary_id.
 *   2. `createTransfer` triggers the actual bank credit. IMPS is the default
 *      mode (near-instant, ₹5-10 txn fee).
 *   3. Status either comes back via `TRANSFER_SUCCESS`/`TRANSFER_FAILED`
 *      webhooks or via `getTransferStatus` polling during reconciliation.
 *
 * `mapTransferStatus` normalises the raw Cashfree state to our internal
 * three-state enum for DB writes.
 *
 * Amounts enter as paise (integer) and leave as rupees (float) at the
 * Cashfree boundary.
 *
 * @verifyAgainstDocs Path shapes (`/payout/beneficiary`, `/payout/transfers`)
 * match the Cashfree 2025-01 Next-gen Payouts API. Re-verify before going live
 * in prod — Cashfree has two historical payout base paths.
 */

import { CashfreeClient } from "./client";
import type {
  CashfreeCreateBeneficiaryRequest,
  CashfreeCreateTransferRequest,
  CashfreeTransferMode,
  CashfreeTransferResponse,
  CashfreeTransferStatus,
  InternalTransferStatus,
} from "./types";

export interface CreateBeneficiaryParams {
  /** Stable caller-provided id — we use the creator's user_id. */
  beneficiaryId: string;
  name: string;
  bankAccountNumber: string;
  bankIfsc: string;
  email?: string;
  phone?: string;
}

export async function createBeneficiary(
  params: CreateBeneficiaryParams,
): Promise<{ beneficiary_id: string; [k: string]: unknown }> {
  const client = new CashfreeClient();
  const body: CashfreeCreateBeneficiaryRequest = {
    beneficiary_id: params.beneficiaryId,
    beneficiary_name: params.name,
    beneficiary_instrument_details: {
      bank_account_number: params.bankAccountNumber,
      bank_ifsc: params.bankIfsc,
    },
    beneficiary_contact_details: {
      beneficiary_email: params.email,
      beneficiary_phone: params.phone,
    },
  };

  return client.request<{ beneficiary_id: string; [k: string]: unknown }>({
    method: "POST",
    path: "/payout/beneficiary",
    body: body as unknown as Record<string, unknown>,
  });
}

export async function removeBeneficiary(beneficiaryId: string): Promise<void> {
  const client = new CashfreeClient();
  await client.request<{ status?: string }>({
    method: "DELETE",
    path: `/payout/beneficiary/${encodeURIComponent(beneficiaryId)}`,
  });
}

export interface CreateTransferParams {
  /** Stable caller-provided id — we use the withdrawal_request row id. */
  transferId: string;
  beneficiaryId: string;
  amountPaise: number;
  mode?: CashfreeTransferMode;
  remarks?: string;
}

export async function createTransfer(
  params: CreateTransferParams,
): Promise<CashfreeTransferResponse> {
  const client = new CashfreeClient();
  const body: CashfreeCreateTransferRequest = {
    transfer_id: params.transferId,
    transfer_amount: params.amountPaise / 100,
    transfer_currency: "INR",
    transfer_mode: params.mode ?? "IMPS",
    beneficiary_details: { beneficiary_id: params.beneficiaryId },
    transfer_remarks: params.remarks,
  };

  return client.request<CashfreeTransferResponse>({
    method: "POST",
    path: "/payout/transfers",
    body: body as unknown as Record<string, unknown>,
  });
}

export async function getTransferStatus(
  transferId: string,
): Promise<CashfreeTransferResponse> {
  const client = new CashfreeClient();
  return client.request<CashfreeTransferResponse>({
    method: "GET",
    path: `/payout/transfers?transfer_id=${encodeURIComponent(transferId)}`,
  });
}

/**
 * Normalise Cashfree's transfer status to our internal three-state model.
 * Unknown values fall through to `processing` — treat as pending and wait for
 * webhook / next reconciliation tick. Never silently map to `success`.
 */
export function mapTransferStatus(
  raw: CashfreeTransferStatus | string,
): InternalTransferStatus {
  switch (raw) {
    case "SUCCESS":
      return "success";
    case "PROCESSING":
    case "PENDING":
      return "processing";
    case "FAILED":
    case "REJECTED":
    case "REVERSED":
      return "failed";
    default:
      return "processing";
  }
}
