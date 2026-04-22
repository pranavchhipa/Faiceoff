// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credits/top-up — initiate a Cashfree Collect order for credits
// Ref plan Task 17 / spec §4.3 "TOP-UP"
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth (user must be signed in)
//   2. Resolve brand profile from user.id → 404 if none
//   3. Validate pack (Zod, `small` | `medium` | `large`)
//   4. Insert credit_top_ups row status='initiated'
//   5. Lookup user email + phone for Cashfree customer_details
//   6. Call createTopUpOrder — Cashfree Collect
//   7. Update row with cf_order_id + status='processing'
//   8. Return { orderId, paymentSessionId, amount_paise, credits }
//
// Failure modes:
//   • 401 unauth, 404 no brand, 400 invalid pack, 502 Cashfree blow-up
//   • On Cashfree failure, mark row status='failed' with failure_reason for
//     admin visibility — don't leave orphan 'initiated' rows.
//
// Admin client is used for ALL writes — we need to bypass the RLS policies
// that allow brands only to read (not insert). The auth check above already
// established the caller owns `brand.user_id`, so the admin-scoped insert is
// safe.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTopUpOrder } from "@/lib/payments/cashfree/collect";
import { CREDIT_PACKS, TopUpRequestSchema } from "@/domains/credit/types";

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

  const parsed = TopUpRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { pack } = parsed.data;
  const packConfig = CREDIT_PACKS[pack];

  // ── 3. Resolve brand profile ───────────────────────────────────────────────
  // admin client bypasses RLS — we already authenticated the caller above.
  // Supabase types don't yet know about credit_top_ups (migrations 20-30 not
  // regenerated), so we use a minimally-typed handle for those writes.
  const admin = createAdminClient();
  const adminUntyped = admin as unknown as {
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

  const { data: brand, error: brandError } = await adminUntyped
    .from("brands")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    console.error("[credits/top-up] brand lookup failed", brandError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!brand) {
    return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  }
  const brandId = brand.id as string;

  // ── 4. Lookup user email + phone for Cashfree ──────────────────────────────
  const { data: userProfile, error: userError } = await adminUntyped
    .from("users")
    .select("id, email, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  if (userError || !userProfile) {
    console.error("[credits/top-up] user lookup failed", userError);
    return NextResponse.json({ error: "user_profile_missing" }, { status: 500 });
  }

  const customerEmail = (userProfile.email as string | null) ?? user.email ?? "";
  const customerPhone = (userProfile.phone as string | null) ?? "";

  if (!customerEmail) {
    return NextResponse.json(
      { error: "missing_customer_email" },
      { status: 400 },
    );
  }

  // ── 5. Insert credit_top_ups row (status=initiated) ────────────────────────
  const { data: topUpRow, error: insertError } = await adminUntyped
    .from("credit_top_ups")
    .insert({
      brand_id: brandId,
      pack,
      credits: packConfig.credits,
      amount_paise: packConfig.amount_paise,
      status: "initiated",
    })
    .select()
    .single();

  if (insertError || !topUpRow) {
    console.error("[credits/top-up] insert credit_top_ups failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const topUpId = topUpRow.id as string;

  // ── 6. Call Cashfree Collect ───────────────────────────────────────────────
  // Cashfree is called AFTER our DB row exists so the webhook can find the row
  // by cf_order_id.
  try {
    const { orderId, paymentSessionId } = await createTopUpOrder({
      brandId,
      pack,
      credits: packConfig.credits,
      amountPaise: packConfig.amount_paise,
      customerEmail,
      customerPhone: customerPhone || "9999999999", // Cashfree requires a phone; fallback for brands that haven't set one
    });

    // ── 7. Update row → processing, persist cf_order_id ──────────────────────
    const { error: updateError } = await adminUntyped
      .from("credit_top_ups")
      .update({
        cf_order_id: orderId,
        status: "processing",
      })
      .eq("id", topUpId);

    if (updateError) {
      console.error(
        "[credits/top-up] post-order update failed (row will reconcile)",
        updateError,
      );
      // Not fatal for the client — the order IS live at Cashfree. The
      // reconciliation cron will catch up later. Return success anyway.
    }

    return NextResponse.json(
      {
        orderId,
        paymentSessionId,
        amount_paise: packConfig.amount_paise,
        credits: packConfig.credits,
      },
      { status: 200 },
    );
  } catch (err) {
    // Cashfree failure — mark row failed so admin can see it and so the user
    // can retry with a fresh row.
    const reason = err instanceof Error ? err.message : "cashfree_error";
    await adminUntyped
      .from("credit_top_ups")
      .update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
      })
      .eq("id", topUpId);

    console.error("[credits/top-up] Cashfree createTopUpOrder failed", err);
    return NextResponse.json(
      { error: "cashfree_unavailable", message: reason },
      { status: 502 },
    );
  }
}
