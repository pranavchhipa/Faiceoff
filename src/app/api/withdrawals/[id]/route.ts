// ─────────────────────────────────────────────────────────────────────────────
// GET /api/withdrawals/[id] — single withdrawal detail for the authed creator
// Ref plan Task 28
// ─────────────────────────────────────────────────────────────────────────────
//
// Scoping: admin client but we filter by creator_id=authed_creator.id so a
// creator never sees another creator's withdrawal (even if they guess the id).
// Return 404 (not 403) on ownership mismatch so we don't leak existence.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface DetailAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        eq?(col: string, val: string): {
          maybeSingle(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as DetailAdmin;

  // Creator gate
  const { data: creatorRow } = await (admin
    .from("creators")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_have_withdrawals" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // Withdrawal detail scoped to creator
  const chain = admin
    .from("withdrawal_requests")
    .select(
      "id, creator_id, gross_paise, tcs_paise, tds_paise, gst_output_paise, net_paise, status, failure_reason, bank_account_number_masked, bank_ifsc, bank_name, cf_transfer_id, cf_utr, cf_mode, requested_at, processing_at, completed_at, created_at, updated_at",
    )
    .eq("id", id);
  const scopedEq = chain.eq?.("creator_id", creatorId);
  let row: Record<string, unknown> | null = null;
  if (scopedEq) {
    const { data } = await scopedEq.maybeSingle();
    row = data;
  }
  if (!row) {
    return NextResponse.json(
      { error: "not_found", reason: "withdrawal_not_found" },
      { status: 404 },
    );
  }

  // Defensive projection: strip any encrypted columns that might sneak in.
  const safe = { ...(row as Record<string, unknown>) };
  delete (safe as Record<string, unknown>).account_number_encrypted;

  return NextResponse.json(safe, { status: 200 });
}
