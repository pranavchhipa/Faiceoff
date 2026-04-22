// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/reject — creator rejects a license request
// Ref plan Task 23 / spec §4.3 Step 3
// ─────────────────────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Auth → creator role → owns request → status=requested
//   2. Zod body { reason: 10..500 chars }
//   3. commitCreditReleaseReserve (refunds the brand's held credits)
//   4. UPDATE license_requests SET status='rejected', creator_reject_reason
//   5. Fire-and-forget 'license/rejected' inngest event
//
// Order matters: we release the reserve FIRST so that if the ledger procedure
// fails (e.g. inconsistent reserve ledger), we don't leak a 'rejected' state
// while the brand's credits remain held. If the release succeeds but the
// status flip then fails, ops can retry — release is idempotent by refId.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import {
  RejectLicenseSchema,
  assertTransition,
  type LicenseState,
  type LicenseRequestRow,
} from "@/domains/license/types";
import { commitCreditReleaseReserve } from "@/lib/ledger/commit";

interface RejectAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = RejectLicenseSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { reason } = parsed.data;

  const admin = createAdminClient() as unknown as RejectAdmin;

  // ── 3. Role: creator ───────────────────────────────────────────────────────
  const { data: creatorRow } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_reject" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // ── 4. Load request ────────────────────────────────────────────────────────
  const { data: requestRow, error: requestError } = await admin
    .from("license_requests")
    .select("id, creator_id, brand_id, status, total_paise")
    .eq("id", id)
    .maybeSingle();
  if (requestError) {
    console.error("[licenses/reject] lookup failed", requestError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!requestRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const request = requestRow as {
    id: string;
    creator_id: string;
    brand_id: string;
    status: LicenseState;
    total_paise: number;
  };

  if (request.creator_id !== creatorId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 5. State machine gate ──────────────────────────────────────────────────
  try {
    assertTransition(request.status, "rejected", "license reject");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "illegal_transition", message, current_status: request.status },
      { status: 409 },
    );
  }

  // ── 6. Release the brand's reserved credits first ──────────────────────────
  try {
    await commitCreditReleaseReserve({
      brandId: request.brand_id,
      amountPaise: request.total_paise,
      refType: "license_request",
      refId: request.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "release_failed";
    console.error("[licenses/reject] release reserve failed", message);
    return NextResponse.json(
      { error: "release_failed", message },
      { status: 500 },
    );
  }

  // ── 7. Flip status to 'rejected' ───────────────────────────────────────────
  const { error: updateError } = await admin
    .from("license_requests")
    .update({
      status: "rejected",
      creator_reject_reason: reason,
    })
    .eq("id", request.id);
  if (updateError) {
    console.error("[licenses/reject] status flip failed", updateError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 8. Fire-and-forget inngest event ───────────────────────────────────────
  try {
    await inngest.send({
      name: "license/rejected",
      data: { license_request_id: request.id, reason },
    });
  } catch (err) {
    console.error("[licenses/reject] inngest send failed (non-fatal)", err);
  }

  // ── 9. Response ────────────────────────────────────────────────────────────
  return NextResponse.json({
    license_request: {
      ...request,
      status: "rejected" as LicenseState,
      creator_reject_reason: reason,
    } as unknown as LicenseRequestRow,
  });
}
