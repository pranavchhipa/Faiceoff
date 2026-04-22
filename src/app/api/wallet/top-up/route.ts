// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallet/top-up — initiate a Cashfree Collect order for INR wallet
// Task E10 — Chunk E new route
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth (user must be signed in as a brand)
//   2. Parse + validate body: { amount_paise: number }
//      min: 50_000 paise (₹500), max: 50_000_000 paise (₹5,00,000)
//   3. Compute bonus tier (tiered %)
//   4. Resolve brand by user.id → 404 if none
//   5. Lookup user email + phone
//   6. Insert wallet_top_ups row status='initiated'
//   7. Call createWalletTopUpOrder (Cashfree)
//   8. Update row: cf_order_id + status='processing'
//   9. Return { orderId, paymentSessionId, amount_paise, bonus_paise }
//
// Bonus tiers:
//   ₹500-999:    0%
//   ₹1000-4999:  5%
//   ₹5000-9999:  10%
//   ₹10000-49999: 15%
//   ₹50000+:     20%
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWalletTopUpOrder } from "@/lib/payments/cashfree/collect";

// ── Inline Zod schema ─────────────────────────────────────────────────────────

const WalletTopUpRequestSchema = z.object({
  amount_paise: z
    .number()
    .int("amount_paise must be an integer")
    .min(50_000, "minimum top-up is ₹500 (50000 paise)")
    .max(50_000_000, "maximum top-up is ₹5,00,000 (50000000 paise)"),
});

// ── Bonus computation ─────────────────────────────────────────────────────────

/**
 * Compute wallet top-up bonus based on INR tier.
 * All paise in, bonus paise out (integer, Math.floor).
 *
 * Tiers (inclusive of lower bound, exclusive of upper):
 *   ₹500   – ₹999:   0%
 *   ₹1000  – ₹4999:  5%
 *   ₹5000  – ₹9999:  10%
 *   ₹10000 – ₹49999: 15%
 *   ₹50000+:         20%
 */
function computeWalletBonus(amount_paise: number): number {
  // Convert to rupees for tier comparison (still integer math with paise)
  const rupees = Math.floor(amount_paise / 100);

  let rate: number;
  if (rupees >= 50_000) {
    rate = 0.20;
  } else if (rupees >= 10_000) {
    rate = 0.15;
  } else if (rupees >= 5_000) {
    rate = 0.10;
  } else if (rupees >= 1_000) {
    rate = 0.05;
  } else {
    rate = 0;
  }

  return Math.floor(amount_paise * rate);
}

// ── Admin client type helper ──────────────────────────────────────────────────

type AdminUntyped = {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert(row: Record<string, unknown>): {
      select(): {
        single(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = WalletTopUpRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { amount_paise } = parsed.data;

  // ── 3. Compute bonus ───────────────────────────────────────────────────────
  const bonus_paise = computeWalletBonus(amount_paise);

  // ── 4. Resolve brand profile ───────────────────────────────────────────────
  const admin = createAdminClient();
  const adminUntyped = admin as unknown as AdminUntyped;

  const { data: brand, error: brandError } = await adminUntyped
    .from("brands")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    console.error("[wallet/top-up] brand lookup failed", brandError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!brand) {
    return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  }
  const brandId = brand.id as string;

  // ── 5. Lookup user email + phone for Cashfree ──────────────────────────────
  const { data: userProfile, error: userError } = await adminUntyped
    .from("users")
    .select("id, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (userError || !userProfile) {
    console.error("[wallet/top-up] user lookup failed", userError);
    return NextResponse.json(
      { error: "user_profile_missing" },
      { status: 500 },
    );
  }

  const customerEmail =
    (userProfile.email as string | null) ?? user.email ?? "";
  const customerPhone = (userProfile.phone as string | null) ?? "";

  if (!customerEmail) {
    return NextResponse.json(
      { error: "missing_customer_email" },
      { status: 400 },
    );
  }

  // ── 6. Insert wallet_top_ups row (status=initiated) ────────────────────────
  const { data: topUpRow, error: insertError } = await adminUntyped
    .from("wallet_top_ups")
    .insert({
      brand_id: brandId,
      amount_paise,
      bonus_paise,
      status: "initiated",
    })
    .select()
    .single();

  if (insertError || !topUpRow) {
    console.error(
      "[wallet/top-up] insert wallet_top_ups failed",
      insertError,
    );
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const topUpId = topUpRow.id as string;

  // ── 7. Call Cashfree Collect ───────────────────────────────────────────────
  try {
    const { orderId, paymentSessionId } = await createWalletTopUpOrder({
      brandId,
      walletTopUpId: topUpId,
      amountPaise: amount_paise,
      customerEmail,
      customerPhone: customerPhone || "9999999999",
    });

    // ── 8. Update row → processing, persist cf_order_id ──────────────────────
    const { error: updateError } = await adminUntyped
      .from("wallet_top_ups")
      .update({
        cf_order_id: orderId,
        status: "processing",
      })
      .eq("id", topUpId);

    if (updateError) {
      console.error(
        "[wallet/top-up] post-order update failed (row will reconcile)",
        updateError,
      );
    }

    return NextResponse.json(
      {
        orderId,
        paymentSessionId,
        amount_paise,
        bonus_paise,
      },
      { status: 200 },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "cashfree_error";
    await adminUntyped
      .from("wallet_top_ups")
      .update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
      })
      .eq("id", topUpId);

    console.error("[wallet/top-up] Cashfree createWalletTopUpOrder failed", err);
    return NextResponse.json(
      { error: "cashfree_unavailable", message: reason },
      { status: 502 },
    );
  }
}
