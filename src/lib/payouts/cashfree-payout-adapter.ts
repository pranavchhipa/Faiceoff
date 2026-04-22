/**
 * Cashfree Payout Adapter — thin wrapper around `src/lib/payments/cashfree/payouts.ts`.
 *
 * Responsibilities:
 *   - `ensureBeneficiary` — idempotent create/verify beneficiary (uses creator_id as
 *     beneficiary_id so repeated calls are safe).
 *   - `submitTransfer` — initiates IMPS transfer, returns internal-friendly shape.
 *   - `pollTransferStatus` — polls transfer by our payout id for reconciliation.
 *
 * We map Cashfree's `transfer_id` to our `payoutId` so the audit trail is linked
 * in both systems. The adapter never touches the database.
 *
 * @module cashfree-payout-adapter
 */

import {
  createBeneficiary,
  createTransfer,
  getTransferStatus,
} from "@/lib/payments/cashfree/payouts";
import { CashfreeApiError } from "@/lib/payments/cashfree/client";
import { PayoutError } from "./types";
import type {
  EnsureBeneficiaryInput,
  SubmitTransferInput,
  SubmitTransferResult,
  PollTransferStatusInput,
  PollTransferStatusResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Beneficiary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Idempotent beneficiary registration.
 *
 * Cashfree returns HTTP 409 when a beneficiary_id already exists. We treat 409
 * as success (no-op) so callers can always call `ensureBeneficiary` without
 * first checking whether the creator already has a record.
 *
 * If Cashfree returns any other 4xx/5xx we surface a `PayoutError` with code
 * `CASHFREE_ERROR` so the caller can decide whether to retry or surface the
 * error to the user.
 */
export async function ensureBeneficiary(
  input: EnsureBeneficiaryInput,
): Promise<void> {
  try {
    await createBeneficiary({
      beneficiaryId: input.creatorId,
      name: input.name,
      bankAccountNumber: input.bankAccountNumber,
      bankIfsc: input.bankIfsc,
      email: input.email,
      phone: input.phone,
    });
  } catch (err) {
    if (err instanceof CashfreeApiError && err.statusCode === 409) {
      // Beneficiary already exists — idempotent, treat as success.
      return;
    }
    throw new PayoutError(
      "CASHFREE_ERROR",
      `ensureBeneficiary failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit an IMPS bank transfer via Cashfree Payouts.
 *
 * We use the internal `payoutId` as the `transfer_id` so Cashfree's webhook
 * callbacks carry our own id and we can look up the payout row directly.
 *
 * Returns the Cashfree transfer id and raw status string.
 * Throws `PayoutError("CASHFREE_ERROR", ...)` on API failure.
 */
export async function submitTransfer(
  input: SubmitTransferInput,
): Promise<SubmitTransferResult> {
  let response;
  try {
    response = await createTransfer({
      transferId: input.payoutId,
      beneficiaryId: input.beneficiaryId,
      amountPaise: input.amountPaise,
      mode: "IMPS",
      remarks: input.remarks ?? `Creator payout ${input.payoutId}`,
    });
  } catch (err) {
    throw new PayoutError(
      "CASHFREE_ERROR",
      `submitTransfer failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Cashfree may return cf_transfer_id as a separate field or embed it in transfer_id.
  const cfTransferId = response.cf_transfer_id ?? response.transfer_id;

  return {
    cfTransferId,
    rawStatus: response.status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status polling (reconciliation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Poll Cashfree for the current transfer status.
 *
 * Used by reconciliation jobs when webhooks are delayed or missed.
 * `payoutId` is also the Cashfree `transfer_id` (we set them equal in `submitTransfer`).
 *
 * Throws `PayoutError("CASHFREE_ERROR", ...)` on API failure.
 */
export async function pollTransferStatus(
  input: PollTransferStatusInput,
): Promise<PollTransferStatusResult> {
  let response;
  try {
    response = await getTransferStatus(input.payoutId);
  } catch (err) {
    throw new PayoutError(
      "CASHFREE_ERROR",
      `pollTransferStatus failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const cfTransferId = response.cf_transfer_id ?? response.transfer_id;

  return {
    cfTransferId,
    rawStatus: response.status,
  };
}
