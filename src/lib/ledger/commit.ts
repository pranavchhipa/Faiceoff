// ─────────────────────────────────────────────────────────────────────────────
// Ledger commit helpers — TS wrappers over the PL/pgSQL procedures in
// supabase/migrations/00029_ledger_procedures.sql
// ─────────────────────────────────────────────────────────────────────────────
//
// Every money-affecting state transition goes through exactly one of these
// wrappers. Each wrapper calls a single `admin.rpc(...)` that executes a
// single PG transaction with row-level locks. Failures throw LedgerError.
//
// These are called from:
//   • Cashfree webhook handler (PAYMENT_SUCCESS, TRANSFER_SUCCESS/FAILED)
//   • License accept route (/api/licenses/[id]/accept)
//   • License reject route (/api/licenses/[id]/reject)
//   • Image approval route (/api/generations/[id]/approve)
//   • Withdrawal create route (/api/withdrawals/create)
//   • Daily expiry cron (src/inngest/functions/license/expire-licenses.ts)
//
// NEVER invoke these from client components or unauthenticated API paths.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// RPC escape — typed for the procedures in 00029_ledger_procedures.sql
//
// The generated Database["public"]["Functions"] type is derived from the live
// DB schema and only sees procedures that existed at codegen time. Until
// `pnpm dlx supabase gen types typescript` is re-run after 00029 is applied
// to a live DB, admin.rpc() only accepts the pre-Chunk-C procedure name.
// We cast through a minimal local interface to keep this layer strictly
// typed without leaking `any` everywhere.
// ─────────────────────────────────────────────────────────────────────────────

type LedgerRpcName =
  | "commit_top_up"
  | "commit_credit_reserve"
  | "commit_credit_release_reserve"
  | "commit_credit_spend"
  | "commit_license_acceptance"
  | "commit_image_approval"
  | "commit_expiry_refund"
  | "commit_withdrawal_deductions"
  | "commit_withdrawal_success"
  | "commit_withdrawal_failure";

interface LedgerRpcClient {
  rpc(
    name: LedgerRpcName,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

function ledgerAdmin(): LedgerRpcClient {
  return createAdminClient() as unknown as LedgerRpcClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class LedgerError extends Error {
  public readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "LedgerError";
    this.cause = cause;
  }
}

// Reference-type strings accepted by the DB procedures' p_ref_type column.
// Wider than the `check` constraint on credit_transactions.reference_type only
// to allow forward-compat with chunks D/B. Kept narrow by convention.
export type CreditReferenceType =
  | "license_request"
  | "credit_top_up"
  | "refund"
  | "bonus"
  | "adjustment";

// ─────────────────────────────────────────────────────────────────────────────
// commit_top_up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finalize a Cashfree Collect top-up. Expects credit_top_ups.status is
 * already `success` (flipped by the webhook before calling this).
 */
export async function commitTopUp(topUpId: string): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_top_up", {
    p_top_up_id: topUpId,
  });
  if (error) {
    throw new LedgerError(`commit_top_up failed: ${error.message}`, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// commit_credit_reserve / release_reserve / spend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hold `amountPaise` against the brand's pending requests. Fails if brand's
 * available balance (balance - reserved) < amount.
 */
export async function commitCreditReserve(params: {
  brandId: string;
  amountPaise: number;
  refType: CreditReferenceType;
  refId: string;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_credit_reserve", {
    p_brand_id: params.brandId,
    p_amount_paise: params.amountPaise,
    p_ref_type: params.refType,
    p_ref_id: params.refId,
  });
  if (error) {
    throw new LedgerError(
      `commit_credit_reserve failed: ${error.message}`,
      error,
    );
  }
}

/**
 * Release a previously held reserve (e.g. creator rejected the request).
 * Does NOT debit balance.
 */
export async function commitCreditReleaseReserve(params: {
  brandId: string;
  amountPaise: number;
  refType: CreditReferenceType;
  refId: string;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_credit_release_reserve", {
    p_brand_id: params.brandId,
    p_amount_paise: params.amountPaise,
    p_ref_type: params.refType,
    p_ref_id: params.refId,
  });
  if (error) {
    throw new LedgerError(
      `commit_credit_release_reserve failed: ${error.message}`,
      error,
    );
  }
}

/**
 * Debit balance AND clear the reservation. Usually called via
 * commit_license_acceptance; rarely stand-alone.
 */
export async function commitCreditSpend(params: {
  brandId: string;
  amountPaise: number;
  refType: CreditReferenceType;
  refId: string;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_credit_spend", {
    p_brand_id: params.brandId,
    p_amount_paise: params.amountPaise,
    p_ref_type: params.refType,
    p_ref_id: params.refId,
  });
  if (error) {
    throw new LedgerError(
      `commit_credit_spend failed: ${error.message}`,
      error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// commit_license_acceptance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full state transition when creator clicks Accept & Sign:
 *   • debits brand credits (via commit_credit_spend internally)
 *   • inserts escrow_ledger lock row
 *   • recognizes platform commission + GST on commission
 *   • transitions license_requests.status → 'active' with expires_at
 *
 * Caller must first flip license_requests.status to 'accepted'. Idempotent:
 * re-calling after success is a no-op.
 */
export async function commitLicenseAcceptance(
  licenseRequestId: string,
): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_license_acceptance", {
    p_license_request_id: licenseRequestId,
  });
  if (error) {
    throw new LedgerError(
      `commit_license_acceptance failed: ${error.message}`,
      error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// commit_image_approval
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Release one image's worth of escrow to the creator's pending balance.
 *
 * `isFinal` MUST be `images_approved + 1 === image_quota` at the time of call.
 * The procedure validates this and raises if the caller is wrong — prevents
 * accidental residual double-payment.
 *
 * On final approval, transitions license_requests.status → 'completed'.
 */
export async function commitImageApproval(params: {
  licenseRequestId: string;
  isFinal: boolean;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_image_approval", {
    p_license_request_id: params.licenseRequestId,
    p_is_final: params.isFinal,
  });
  if (error) {
    throw new LedgerError(
      `commit_image_approval failed: ${error.message}`,
      error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// commit_expiry_refund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * License expired with unused slots: pro-rata refund (+ residual) credited
 * back to brand. Called by the daily expire-licenses Inngest cron.
 *
 * Requires status='active' AND expires_at < now(). No-op + marks completed
 * if all slots were approved (nothing to refund).
 */
export async function commitExpiryRefund(
  licenseRequestId: string,
): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_expiry_refund", {
    p_license_request_id: licenseRequestId,
  });
  if (error) {
    throw new LedgerError(
      `commit_expiry_refund failed: ${error.message}`,
      error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Withdrawal lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute + apply TCS (1%) + TDS (1%) + GST (18% if GSTIN) deductions.
 * Inserts tax ledger rows and snapshots on withdrawal_requests.
 * Transitions status → 'deductions_applied'. Idempotent.
 */
export async function commitWithdrawalDeductions(
  withdrawalRequestId: string,
): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_withdrawal_deductions", {
    p_withdrawal_request_id: withdrawalRequestId,
  });
  if (error) {
    throw new LedgerError(
      `commit_withdrawal_deductions failed: ${error.message}`,
      error,
    );
  }
}

/**
 * Cashfree TRANSFER_SUCCESS handler. Decrements creator pending_balance by
 * gross, increments lifetime_withdrawn_net, records UTR. Idempotent.
 */
export async function commitWithdrawalSuccess(params: {
  withdrawalRequestId: string;
  cfUtr: string;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_withdrawal_success", {
    p_withdrawal_request_id: params.withdrawalRequestId,
    p_cf_utr: params.cfUtr,
  });
  if (error) {
    throw new LedgerError(
      `commit_withdrawal_success failed: ${error.message}`,
      error,
    );
  }
}

/**
 * Cashfree TRANSFER_FAILED / TRANSFER_REVERSED handler. Inserts negative-sign
 * reversal rows on tax ledgers, transitions status → 'failed' with reason.
 * pending_balance not modified (never debited pre-success). Idempotent.
 */
export async function commitWithdrawalFailure(params: {
  withdrawalRequestId: string;
  reason: string;
}): Promise<void> {
  const admin = ledgerAdmin();
  const { error } = await admin.rpc("commit_withdrawal_failure", {
    p_withdrawal_request_id: params.withdrawalRequestId,
    p_reason: params.reason,
  });
  if (error) {
    throw new LedgerError(
      `commit_withdrawal_failure failed: ${error.message}`,
      error,
    );
  }
}
