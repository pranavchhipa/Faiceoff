// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/request — brand creates a license request
// Ref plan Task 21 / spec §4.3 Step 2
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth gate: user signed in; role=brand. 401 / 403.
//   2. Validate body (Zod): listing_id uuid, optional notes + up to 5 refs.
//   3. Load listing — must be is_active=true. 400 otherwise.
//   4. Compute checkout via calculateLicenseCheckout(price_paise, quota).
//   5. Pre-flight brand balance check (balance - reserved ≥ total_paise).
//      If not → 402 insufficient_credits + shortfall metadata for UI.
//   6. Insert license_requests row (status=requested, pricing snapshot frozen).
//   7. Reserve credits via commitCreditReserve — atomic PL/pgSQL procedure
//      that re-validates balance inside the transaction (defense in depth).
//   8. Return the row + the checkout breakdown.
//
// On step-7 failure we flip the just-inserted request to 'cancelled' so we
// don't orphan a phantom 'requested' row. The reserve failure (e.g. race with
// another concurrent request) is surfaced as 402 too.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateLicenseCheckout } from "@/lib/ledger/math";
import { commitCreditReserve, LedgerError } from "@/lib/ledger/commit";
import {
  CreateLicenseRequestSchema,
  type LicenseRequestRow,
  type LicenseTemplate,
} from "@/domains/license/types";

interface RequestAdmin {
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
}

interface BrandCreditRow {
  id: string;
  credits_balance_paise: number;
  credits_reserved_paise: number;
}

interface ListingRow {
  id: string;
  creator_id: string;
  template: LicenseTemplate;
  price_paise: number;
  image_quota: number;
  validity_days: number;
  is_active: boolean;
}

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
  const parsed = CreateLicenseRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { listing_id, brand_notes } = parsed.data;

  const admin = createAdminClient() as unknown as RequestAdmin;

  // ── 3. Role gate: caller must have a brand row ─────────────────────────────
  const { data: brandRow, error: brandError } = await admin
    .from("brands")
    .select("id, credits_balance_paise, credits_reserved_paise")
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    console.error("[licenses/request] brand lookup failed", brandError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!brandRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_brands_can_request" },
      { status: 403 },
    );
  }
  const brand = brandRow as unknown as BrandCreditRow;

  // ── 4. Load listing ────────────────────────────────────────────────────────
  const { data: listingData, error: listingError } = await admin
    .from("creator_license_listings")
    .select(
      "id, creator_id, template, price_paise, image_quota, validity_days, is_active",
    )
    .eq("id", listing_id)
    .maybeSingle();

  if (listingError) {
    console.error("[licenses/request] listing lookup failed", listingError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!listingData) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  const listing = listingData as unknown as ListingRow;
  if (!listing.is_active) {
    return NextResponse.json({ error: "listing_inactive" }, { status: 400 });
  }

  // ── 5. Compute checkout ────────────────────────────────────────────────────
  const checkout = calculateLicenseCheckout(
    listing.price_paise,
    listing.image_quota,
  );

  // ── 6. Pre-flight balance check ────────────────────────────────────────────
  const available_paise = Math.max(
    0,
    brand.credits_balance_paise - brand.credits_reserved_paise,
  );
  if (available_paise < checkout.total_paise) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        required_paise: checkout.total_paise,
        available_paise,
        shortfall_paise: checkout.total_paise - available_paise,
      },
      { status: 402 },
    );
  }

  // ── 7. Insert license_requests row ─────────────────────────────────────────
  const { data: insertedRow, error: insertError } = await admin
    .from("license_requests")
    .insert({
      listing_id: listing.id,
      creator_id: listing.creator_id,
      brand_id: brand.id,
      status: "requested",
      base_paise: checkout.base_paise,
      commission_paise: checkout.commission_paise,
      gst_on_commission_paise: checkout.gst_on_commission_paise,
      total_paise: checkout.total_paise,
      image_quota: listing.image_quota,
      validity_days: listing.validity_days,
      release_per_image_paise: checkout.release_per_image_paise,
      brand_notes: brand_notes ?? null,
    })
    .select()
    .single();

  if (insertError || !insertedRow) {
    console.error("[licenses/request] insert failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const licenseRequestId = (insertedRow as { id: string }).id;

  // ── 8. Reserve credits via PL/pgSQL procedure ──────────────────────────────
  try {
    await commitCreditReserve({
      brandId: brand.id,
      amountPaise: checkout.total_paise,
      refType: "license_request",
      refId: licenseRequestId,
    });
  } catch (err) {
    // Reserve failed — likely a race with another concurrent request that
    // consumed the brand's available balance between our pre-flight check
    // and the PL/pgSQL transaction. Cancel the orphan request.
    const message =
      err instanceof LedgerError
        ? err.message
        : err instanceof Error
          ? err.message
          : "reserve_failed";
    console.error("[licenses/request] reserve failed", message);

    await admin
      .from("license_requests")
      .update({ status: "cancelled" })
      .eq("id", licenseRequestId);

    const isInsufficient = /insufficient credits/i.test(message);
    return NextResponse.json(
      {
        error: isInsufficient ? "insufficient_credits" : "reserve_failed",
        message,
      },
      { status: isInsufficient ? 402 : 500 },
    );
  }

  // ── 9. Return the row + checkout ───────────────────────────────────────────
  return NextResponse.json(
    {
      license_request: insertedRow as unknown as LicenseRequestRow,
      checkout_breakdown: {
        base_paise: checkout.base_paise,
        commission_paise: checkout.commission_paise,
        gst_on_commission_paise: checkout.gst_on_commission_paise,
        total_paise: checkout.total_paise,
      },
    },
    { status: 201 },
  );
}
