// ─────────────────────────────────────────────────────────────────────────────
// Pack catalog service — read/write operations on credit_packs_catalog.
//
// Public (brand) operations: getActivePacks, getPackByCode.
// Admin-only operations: upsertPack, deactivatePack.
//
// All writes use the admin client (bypasses RLS). Public reads could use
// the anon client but for consistency and server-side safety we use admin.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { invariant } from "@/lib/utils/invariant";
import { BillingError } from "./errors";
import type { CreditPack, PackCode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Typed query helper — casts through `unknown` to bypass stale Database type.
// ─────────────────────────────────────────────────────────────────────────────

function catalog() {
  const admin = createAdminClient();
  return (admin as ReturnType<typeof createAdminClient>)
    .from("credit_packs_catalog") as unknown as {
    select(cols: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<{ data: CreditPack | null; error: { message: string } | null }>;
        order(col: string, opts?: { ascending?: boolean }): {
          then: Promise<{ data: CreditPack[] | null; error: { message: string } | null }>["then"];
        };
      };
      order(col: string, opts?: { ascending?: boolean }): Promise<{
        data: CreditPack[] | null;
        error: { message: string } | null;
      }>;
    };
    upsert(
      row: Partial<CreditPack>,
      opts: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
    update(values: Partial<CreditPack>): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getActivePacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all active packs ordered by sort_order ascending.
 * Used on the /brand/credits pricing screen.
 */
export async function getActivePacks(): Promise<CreditPack[]> {
  const admin = createAdminClient();

  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("credit_packs_catalog")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }) as unknown as {
      data: CreditPack[] | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new BillingError(
      `getActivePacks: DB error: ${error.message}`,
      "RPC_ERROR",
    );
  }

  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// getPackByCode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single pack by its code (e.g., 'pro', 'studio').
 * Throws `BillingError` with code `'PACK_NOT_FOUND'` if not found.
 */
export async function getPackByCode(code: PackCode): Promise<CreditPack> {
  invariant(code, "getPackByCode: code is required");

  const admin = createAdminClient();

  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("credit_packs_catalog")
    .select("*")
    .eq("code", code)
    .maybeSingle() as unknown as {
      data: CreditPack | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new BillingError(
      `getPackByCode: DB error for code "${code}": ${error.message}`,
      "RPC_ERROR",
    );
  }

  if (!data) {
    throw new BillingError(
      `getPackByCode: pack "${code}" not found`,
      "PACK_NOT_FOUND",
    );
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertPack
// ─────────────────────────────────────────────────────────────────────────────

export type UpsertPackInput = Omit<CreditPack, "id" | "created_at" | "updated_at">;

/**
 * Admin-only: insert or update a credit pack. Uses ON CONFLICT (code) to
 * update all mutable fields. `code` is the natural key.
 */
export async function upsertPack(pack: UpsertPackInput): Promise<void> {
  invariant(pack.code, "upsertPack: code is required");
  invariant(pack.display_name, "upsertPack: display_name is required");
  invariant(pack.credits >= 0, "upsertPack: credits must be >= 0");
  invariant(pack.price_paise >= 0, "upsertPack: price_paise must be >= 0");

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("credit_packs_catalog")
    .upsert(pack, { onConflict: "code" }) as { error: { message: string } | null };

  if (error) {
    throw new BillingError(
      `upsertPack: DB error for pack "${pack.code}": ${error.message}`,
      "RPC_ERROR",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// deactivatePack
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin-only: soft-delete a credit pack by setting `is_active = false`.
 * Does not physically delete the row to preserve foreign-key integrity
 * on credit_top_ups.pack references.
 */
export async function deactivatePack(code: PackCode): Promise<void> {
  invariant(code, "deactivatePack: code is required");

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("credit_packs_catalog")
    .update({ is_active: false })
    .eq("code", code) as { error: { message: string } | null };

  if (error) {
    throw new BillingError(
      `deactivatePack: DB error for code "${code}": ${error.message}`,
      "RPC_ERROR",
    );
  }
}
