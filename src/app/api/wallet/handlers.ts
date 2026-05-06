// ─────────────────────────────────────────────────────────────────────────────
// Wallet payment event handlers — provider-agnostic.
// Called by the Razorpay webhook + confirm-topup route.
// ─────────────────────────────────────────────────────────────────────────────

export type AdminUntyped = {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
};

interface WalletTopUpRow {
  id: string;
  brand_id: string;
  cf_order_id: string;
  status: string;
}

async function lookupWalletTopUp(
  admin: AdminUntyped,
  orderId: string,
): Promise<WalletTopUpRow | null> {
  const { data } = await admin
    .from("wallet_top_ups")
    .select("id, brand_id, cf_order_id, status")
    .eq("cf_order_id", orderId)
    .maybeSingle();
  return (data as WalletTopUpRow | null) ?? null;
}

/**
 * Payment success handler for wallet top-ups.
 * Idempotent — no-op if row not found or already success.
 */
export async function handleWalletTopUpSuccess(
  admin: AdminUntyped,
  params: { orderId: string; cfPaymentId?: string | null },
): Promise<void> {
  const row = await lookupWalletTopUp(admin, params.orderId);
  if (!row) {
    console.warn(
      `[wallet/handlers] handleWalletTopUpSuccess: no wallet_top_up for order ${params.orderId}`,
    );
    return;
  }
  if (row.status === "success") return;

  const { data: full } = await admin
    .from("wallet_top_ups")
    .select("amount_paise, bonus_paise, brand_id")
    .eq("id", row.id)
    .maybeSingle();

  if (!full) return;

  const fullRow = full as { amount_paise: number; bonus_paise: number; brand_id: string };

  await admin
    .from("wallet_top_ups")
    .update({
      status: "success",
      cf_payment_id: params.cfPaymentId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  const { addWallet } = await import("@/lib/billing");
  await addWallet({
    brandId: fullRow.brand_id,
    topUpId: row.id,
  });
}

/**
 * Payment failed handler for wallet top-ups.
 * Idempotent — no-op if row not found or already terminal.
 */
export async function handleWalletTopUpFailed(
  admin: AdminUntyped,
  params: { orderId: string; reason: string },
): Promise<void> {
  const row = await lookupWalletTopUp(admin, params.orderId);
  if (!row) return;
  if (row.status === "failed" || row.status === "success") return;

  await admin
    .from("wallet_top_ups")
    .update({
      status: "failed",
      failure_reason: params.reason.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}
