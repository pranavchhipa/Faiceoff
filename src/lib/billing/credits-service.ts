// ─────────────────────────────────────────────────────────────────────────────
// Credits service — generation slot management (integer count).
//
// 1 credit = 1 generation slot.
// Credits are NEVER refunded on rejection (compute was consumed).
// Credits are purchased via Cashfree credit top-ups.
//
// All multi-table writes go through PL/pgSQL procedures in migration 00036
// to guarantee atomicity. JS-level operations that only read are done
// directly against the admin client.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { invariant } from "@/lib/utils/invariant";
import { callBillingRpc } from "./rpc";
import { BillingError } from "./errors";
import type {
  AddCreditsResult,
  DeductCreditResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// addCredits
// ─────────────────────────────────────────────────────────────────────────────

export interface AddCreditsParams {
  brandId: string;
  /** UUID of the credit_top_ups row that has already been marked status='success'. */
  topUpId: string;
}

export interface AddCreditsReturn {
  creditsAdded: number;
  bonusAdded: number;
  newBalance: number;
  /** True if this call was a no-op because credits were already granted. */
  idempotent: boolean;
}

/**
 * Grant credits from a completed credit top-up.
 *
 * Idempotent: if the top-up was already credited (checked inside the Postgres
 * procedure via the credit_transactions ledger), returns the current balance
 * without modifying anything.
 *
 * Precondition: `credit_top_ups.status` MUST be `'success'` before calling.
 * The Cashfree webhook sets this before invoking addCredits.
 */
export async function addCredits(
  params: AddCreditsParams,
): Promise<AddCreditsReturn> {
  invariant(params.brandId, "addCredits: brandId is required");
  invariant(params.topUpId, "addCredits: topUpId is required");

  const result = await callBillingRpc<AddCreditsResult>(
    "add_credits_for_topup",
    {
      p_brand_id:  params.brandId,
      p_top_up_id: params.topUpId,
    },
  );

  return {
    creditsAdded: result.credits_added,
    bonusAdded:   result.bonus_added,
    newBalance:   result.new_balance,
    idempotent:   result.idempotent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// deductCredit
// ─────────────────────────────────────────────────────────────────────────────

export interface DeductCreditParams {
  brandId:      string;
  generationId: string;
}

export interface DeductCreditReturn {
  newBalance: number;
}

/**
 * Atomically deduct 1 credit from the brand's balance.
 *
 * Throws `BillingError` with code `'INSUFFICIENT_CREDITS'` if balance < 1.
 * Uses a single conditional UPDATE (no explicit lock needed — Postgres row
 * lock is implicit on UPDATE). The Postgres procedure also writes an audit
 * row to credit_transactions.
 */
export async function deductCredit(
  params: DeductCreditParams,
): Promise<DeductCreditReturn> {
  invariant(params.brandId, "deductCredit: brandId is required");
  invariant(params.generationId, "deductCredit: generationId is required");

  const result = await callBillingRpc<DeductCreditResult>("deduct_credit", {
    p_brand_id:      params.brandId,
    p_generation_id: params.generationId,
  });

  return { newBalance: result.new_balance };
}

// ─────────────────────────────────────────────────────────────────────────────
// getCredits
// ─────────────────────────────────────────────────────────────────────────────

export interface GetCreditsReturn {
  remaining:          number;
  lifetime_purchased: number;
}

/**
 * Read the brand's current credit balance. Not transactional — use for
 * display purposes only. For debit, always use `deductCredit` which is atomic.
 */
export async function getCredits(brandId: string): Promise<GetCreditsReturn> {
  invariant(brandId, "getCredits: brandId is required");

  const admin = createAdminClient();

  // Cast to bypass the stale Database type (Chunk E columns not in it yet).
  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("brands")
    .select("credits_remaining, credits_lifetime_purchased")
    .eq("id", brandId)
    .maybeSingle() as unknown as {
      data: { credits_remaining: number; credits_lifetime_purchased: number } | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new BillingError(
      `getCredits: DB error for brand ${brandId}: ${error.message}`,
      "RPC_ERROR",
    );
  }

  if (!data) {
    throw new BillingError(
      `getCredits: brand ${brandId} not found`,
      "BRAND_NOT_FOUND",
    );
  }

  return {
    remaining:          data.credits_remaining,
    lifetime_purchased: data.credits_lifetime_purchased,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// freeSignupGrant
// ─────────────────────────────────────────────────────────────────────────────

export interface FreeSignupGrantReturn {
  creditsAdded: number;
  newBalance:   number;
  /** True if the free signup grant was already applied earlier. */
  idempotent:   boolean;
}

/**
 * One-time grant of 5 free credits on brand signup.
 *
 * Idempotent: if a `credit_top_ups` row with `pack='free_signup'` already
 * exists for this brand, returns the current balance without re-granting.
 * Safe to call multiple times (e.g., from signup webhook + onboarding step).
 */
export async function freeSignupGrant(
  brandId: string,
): Promise<FreeSignupGrantReturn> {
  invariant(brandId, "freeSignupGrant: brandId is required");

  const result = await callBillingRpc<AddCreditsResult>(
    "add_free_signup_credits",
    { p_brand_id: brandId },
  );

  return {
    creditsAdded: result.credits_added,
    newBalance:   result.new_balance,
    idempotent:   result.idempotent,
  };
}
