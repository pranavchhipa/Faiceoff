// ─────────────────────────────────────────────────────────────────────────────
// GET /api/withdrawals — paginated list of the authed creator's withdrawals
// Ref plan Task 28
// ─────────────────────────────────────────────────────────────────────────────
//
// Cursor pagination on created_at DESC. The cursor is the created_at ISO
// timestamp of the last row in the previous page. To fetch the next page the
// client passes `?cursor=<that-iso-timestamp>`.
//
// Scoping: admin client (bypasses RLS) but we manually filter by creator_id
// resolved from auth.uid() — never trust a caller-provided creator_id.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ListWithdrawalsQuerySchema } from "@/domains/withdrawal/types";

interface ListAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        lt?(col: string, val: string): unknown;
        order?(col: string, opts: { ascending: boolean }): unknown;
        limit?(n: number): Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse query
  const url = new URL(req.url);
  const rawQuery = {
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };
  const parsed = ListWithdrawalsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { cursor, limit } = parsed.data;
  const pageSize = limit ?? 20;

  const admin = createAdminClient() as unknown as ListAdmin;

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

  // List withdrawals
  // Chain: select(...).eq('creator_id', creatorId)[.lt('created_at', cursor)].order('created_at', desc).limit(pageSize)
  let chain = admin
    .from("withdrawal_requests")
    .select(
      "id, creator_id, gross_paise, tcs_paise, tds_paise, gst_output_paise, net_paise, status, failure_reason, bank_account_number_masked, bank_ifsc, bank_name, cf_transfer_id, cf_utr, cf_mode, requested_at, processing_at, completed_at, created_at, updated_at",
    )
    .eq("creator_id", creatorId) as unknown as {
    lt?: (col: string, val: string) => unknown;
    order: (col: string, opts: { ascending: boolean }) => unknown;
  };

  if (cursor && typeof chain.lt === "function") {
    chain = chain.lt("created_at", cursor) as typeof chain;
  }
  const orderResult = chain.order("created_at", { ascending: false }) as {
    limit: (n: number) => Promise<{
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data: rows, error } = await orderResult.limit(pageSize);
  if (error) {
    console.error("[withdrawals] list failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const safeRows = (rows ?? []).map((row) => {
    // Defensive projection: NEVER leak an encrypted column if it ever lands
    // on the row (shouldn't since we didn't select it, but belt + braces).
    const safe = { ...(row as Record<string, unknown>) };
    delete (safe as Record<string, unknown>).account_number_encrypted;
    return safe;
  });

  const nextCursor =
    safeRows.length === pageSize
      ? (safeRows[safeRows.length - 1] as { created_at?: string | null })
          .created_at ?? null
      : null;

  return NextResponse.json(
    {
      withdrawals: safeRows,
      next_cursor: nextCursor,
    },
    { status: 200 },
  );
}
