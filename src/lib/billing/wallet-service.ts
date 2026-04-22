// ─────────────────────────────────────────────────────────────────────────────
// Wallet service — INR paise management for creator fee payments.
//
// The wallet holds INR (stored as paise, integers only). It is funded by
// brands via Cashfree Collect wallet top-ups. When a generation starts, the
// creator's full rate is reserved from the wallet. On approval the reserve
// is spent (creator earns, platform takes commission). On rejection the
// reserve is released back to available balance.
//
// All multi-table writes run through PL/pgSQL procedures in migration 00036.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { invariant } from "@/lib/utils/invariant";
import { callBillingRpc } from "./rpc";
import { BillingError } from "./errors";
import type {
  ReserveWalletResult,
  SpendOrReleaseResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// addWallet
// ─────────────────────────────────────────────────────────────────────────────

export interface AddWalletParams {
  brandId:    string;
  /** UUID of the wallet_top_ups row already marked status='success'. */
  topUpId:    string;
}

export interface AddWalletReturn {
  added:      number;
  newBalance: number;
  idempotent: boolean;
}

/**
 * Credit the brand's wallet from a completed wallet top-up.
 *
 * Idempotent: checks the wallet_transactions ledger for an existing 'topup'
 * row for this top-up ID; returns current balance without re-crediting if found.
 *
 * Precondition: `wallet_top_ups.status` MUST be `'success'` before calling.
 */
export async function addWallet(params: AddWalletParams): Promise<AddWalletReturn> {
  invariant(params.brandId, "addWallet: brandId is required");
  invariant(params.topUpId, "addWallet: topUpId is required");

  const result = await callBillingRpc<{ added: number; new_balance: number; idempotent: boolean }>(
    "add_wallet_for_topup",
    {
      p_brand_id:  params.brandId,
      p_top_up_id: params.topUpId,
    },
  );

  return {
    added:      result.added,
    newBalance: result.new_balance,
    idempotent: result.idempotent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// reserveWallet
// ─────────────────────────────────────────────────────────────────────────────

export interface ReserveWalletParams {
  brandId:      string;
  amountPaise:  number;
  generationId: string;
}

export interface ReserveWalletReturn {
  newReserved: number;
  available:   number;
}

/**
 * Reserve `amountPaise` from the brand's wallet for an in-flight generation.
 *
 * "Available" = wallet_balance_paise - wallet_reserved_paise.
 * Throws `BillingError` with code `'INSUFFICIENT_WALLET'` if
 * (balance - reserved) < amountPaise.
 *
 * Uses `FOR UPDATE` row lock inside the Postgres procedure to prevent
 * concurrent double-reservation races.
 */
export async function reserveWallet(
  params: ReserveWalletParams,
): Promise<ReserveWalletReturn> {
  invariant(params.brandId, "reserveWallet: brandId is required");
  invariant(params.generationId, "reserveWallet: generationId is required");
  invariant(params.amountPaise > 0, "reserveWallet: amountPaise must be > 0");

  const result = await callBillingRpc<ReserveWalletResult>("reserve_wallet", {
    p_brand_id:      params.brandId,
    p_amount_paise:  params.amountPaise,
    p_generation_id: params.generationId,
  });

  return {
    newReserved: result.new_reserved,
    available:   result.available,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// releaseReserve
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseReserveParams {
  brandId:      string;
  amountPaise:  number;
  generationId: string;
}

export interface ReleaseReserveReturn {
  newBalance:  number;
  newReserved: number;
}

/**
 * Release a wallet reservation (e.g., generation was cancelled/rejected
 * before approval). Decrements `wallet_reserved_paise` by `amountPaise`.
 * The balance itself is NOT changed — only the reserved amount.
 *
 * For a formal rejection with an audit-trail distinction, use `refundWallet`.
 */
export async function releaseReserve(
  params: ReleaseReserveParams,
): Promise<ReleaseReserveReturn> {
  invariant(params.brandId, "releaseReserve: brandId is required");
  invariant(params.generationId, "releaseReserve: generationId is required");
  invariant(params.amountPaise > 0, "releaseReserve: amountPaise must be > 0");

  const result = await callBillingRpc<SpendOrReleaseResult>("release_reserve", {
    p_brand_id:      params.brandId,
    p_amount_paise:  params.amountPaise,
    p_generation_id: params.generationId,
    p_type:          "release_reserve",
  });

  return {
    newBalance:  result.new_balance,
    newReserved: result.new_reserved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// spendWallet
// ─────────────────────────────────────────────────────────────────────────────

export interface SpendWalletParams {
  brandId:      string;
  amountPaise:  number;
  generationId: string;
}

export interface SpendWalletReturn {
  newBalance:  number;
  newReserved: number;
}

/**
 * Convert a reservation to spent on generation approval. Decrements BOTH
 * `wallet_balance_paise` AND `wallet_reserved_paise` by `amountPaise`.
 *
 * Call this when the creator approves the generation and the creator fee
 * is paid out from escrow.
 */
export async function spendWallet(
  params: SpendWalletParams,
): Promise<SpendWalletReturn> {
  invariant(params.brandId, "spendWallet: brandId is required");
  invariant(params.generationId, "spendWallet: generationId is required");
  invariant(params.amountPaise > 0, "spendWallet: amountPaise must be > 0");

  const result = await callBillingRpc<SpendOrReleaseResult>("spend_wallet", {
    p_brand_id:      params.brandId,
    p_amount_paise:  params.amountPaise,
    p_generation_id: params.generationId,
  });

  return {
    newBalance:  result.new_balance,
    newReserved: result.new_reserved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// refundWallet
// ─────────────────────────────────────────────────────────────────────────────

export interface RefundWalletParams {
  brandId:      string;
  amountPaise:  number;
  generationId: string;
  /** Human-readable reason logged in wallet_transactions.description. */
  reason:       string;
}

export interface RefundWalletReturn {
  newBalance:  number;
  newReserved: number;
}

/**
 * Refund a wallet reservation. Same mechanical effect as `releaseReserve`
 * (decrements reserved, balance unchanged) but logs a wallet_transactions
 * row with type='refund' for audit-trail clarity.
 */
export async function refundWallet(
  params: RefundWalletParams,
): Promise<RefundWalletReturn> {
  invariant(params.brandId, "refundWallet: brandId is required");
  invariant(params.generationId, "refundWallet: generationId is required");
  invariant(params.amountPaise > 0, "refundWallet: amountPaise must be > 0");
  invariant(params.reason, "refundWallet: reason is required");

  const result = await callBillingRpc<SpendOrReleaseResult>("release_reserve", {
    p_brand_id:      params.brandId,
    p_amount_paise:  params.amountPaise,
    p_generation_id: params.generationId,
    p_type:          "refund",
  });

  return {
    newBalance:  result.new_balance,
    newReserved: result.new_reserved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getWallet
// ─────────────────────────────────────────────────────────────────────────────

export interface GetWalletReturn {
  balance:       number;
  reserved:      number;
  available:     number;
  lifetime_topup: number;
}

/**
 * Read the brand's current wallet balances. Not transactional — use for
 * display purposes only. For reserve/spend, always use the atomic wrappers.
 */
export async function getWallet(brandId: string): Promise<GetWalletReturn> {
  invariant(brandId, "getWallet: brandId is required");

  const admin = createAdminClient();

  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("brands")
    .select(
      "wallet_balance_paise, wallet_reserved_paise, lifetime_topup_paise",
    )
    .eq("id", brandId)
    .maybeSingle() as unknown as {
      data: {
        wallet_balance_paise:  number;
        wallet_reserved_paise: number;
        lifetime_topup_paise:  number;
      } | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new BillingError(
      `getWallet: DB error for brand ${brandId}: ${error.message}`,
      "RPC_ERROR",
    );
  }

  if (!data) {
    throw new BillingError(
      `getWallet: brand ${brandId} not found`,
      "BRAND_NOT_FOUND",
    );
  }

  return {
    balance:        data.wallet_balance_paise,
    reserved:       data.wallet_reserved_paise,
    available:      data.wallet_balance_paise - data.wallet_reserved_paise,
    lifetime_topup: data.lifetime_topup_paise,
  };
}
