// ─────────────────────────────────────────────────────────────────────────────
// Billing RPC client — narrowly typed wrapper for procedures in
// supabase/migrations/00036_billing_procedures.sql.
//
// The generated Database["public"]["Functions"] type doesn't include Chunk E
// procedures yet (pending supabase gen types regeneration). We cast through a
// local interface to keep this layer strictly typed without leaking `any`.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { BillingError } from "./errors";

type BillingRpcName =
  | "add_credits_for_topup"
  | "add_wallet_for_topup"
  | "deduct_credit"
  | "reserve_wallet"
  | "spend_wallet"
  | "release_reserve"
  | "add_free_signup_credits";

interface BillingRpcClient {
  rpc(
    name: BillingRpcName,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export function billingAdmin(): BillingRpcClient {
  return createAdminClient() as unknown as BillingRpcClient;
}

/**
 * Call a billing RPC and return the data payload as `T`, or throw
 * a BillingError if the RPC returned an error. The Postgres procedures
 * RAISE EXCEPTION with specific prefixes (INSUFFICIENT_CREDITS, etc.)
 * that are mapped to typed BillingErrorCode values.
 */
export async function callBillingRpc<T>(
  name: BillingRpcName,
  params: Record<string, unknown>,
): Promise<T> {
  const admin = billingAdmin();
  const { data, error } = await admin.rpc(name, params);

  if (error) {
    const msg = error.message ?? "Unknown RPC error";

    // Map Postgres RAISE EXCEPTION prefixes to typed error codes.
    if (msg.includes("INSUFFICIENT_CREDITS")) {
      throw new BillingError(msg, "INSUFFICIENT_CREDITS");
    }
    if (msg.includes("INSUFFICIENT_WALLET")) {
      throw new BillingError(msg, "INSUFFICIENT_WALLET");
    }
    if (msg.includes("not found")) {
      throw new BillingError(msg, "RPC_ERROR");
    }

    throw new BillingError(`${name} RPC failed: ${msg}`, "RPC_ERROR");
  }

  return data as T;
}
