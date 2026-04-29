// ─────────────────────────────────────────────────────────────────────────────
// POST /api/approvals/[id]/reject — creator rejects a generation
// Task E12 — Chunk E new route (id = approval.id, NOT generation.id)
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth → resolve creator by user.id → 403 if none
//   2. Fetch approval by id, join generations → verify creator ownership
//   3. Verify approval.status === 'pending' — idempotent on terminal states
//   4. Parse optional body: { feedback?: string }
//   5. UPDATE approvals SET status='rejected', feedback, decided_at=now()
//   6. UPDATE generations SET status='rejected'
//   7. releaseReserve (refunds wallet reservation back to available balance)
//      Credit is NOT refunded — credit is consumed per generation attempt.
//   8. Return { status: 'rejected' }
//
// IDEMPOTENT: if approval is already terminal, return 200 with current status.
// No escrow. No license. No PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve } from "@/lib/billing";

// ── Inline Zod schema ─────────────────────────────────────────────────────────

const RejectBodySchema = z.object({
  feedback: z.string().max(2000).optional(),
});

// ── Admin client helper ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminAny = any;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: approvalId } = await params;

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as AdminAny;

  // ── 2a. Resolve creator ────────────────────────────────────────────────────
  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorError) {
    console.error("[approvals/reject] creator lookup failed", creatorError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json(
      { error: "creator_profile_not_found" },
      { status: 403 },
    );
  }
  const creatorId = creator.id as string;

  // ── 2b. Fetch approval + join generation ───────────────────────────────────
  // brand_id and creator_id are denormalised on `generations` (since
  // migration 00009), so we read them directly instead of joining the
  // (renamed-to-collab_sessions) parent.
  const { data: approval, error: approvalError } = await admin
    .from("approvals")
    .select(
      `
      id,
      status,
      generation_id,
      generations!approvals_generation_id_fkey (
        id,
        collab_session_id,
        brand_id,
        creator_id,
        cost_paise
      )
    `,
    )
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError) {
    console.error("[approvals/reject] approval lookup failed", approvalError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!approval) {
    return NextResponse.json({ error: "approval_not_found" }, { status: 404 });
  }

  const gen = approval.generations as
    | {
        id: string;
        collab_session_id: string | null;
        brand_id: string;
        creator_id: string;
        cost_paise: number;
      }
    | null;

  if (!gen) {
    return NextResponse.json(
      { error: "generation_not_found" },
      { status: 404 },
    );
  }

  // ── 2c. Verify creator owns this generation ────────────────────────────────
  if (gen.creator_id !== creatorId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const brandId = gen.brand_id;
  const generationId = gen.id;
  const costPaise = gen.cost_paise ?? 0;

  // ── 3. Idempotency — terminal state check ──────────────────────────────────
  const currentStatus = approval.status as string;
  if (currentStatus !== "pending") {
    return NextResponse.json(
      { status: currentStatus },
      { status: 200 },
    );
  }

  // ── 4. Parse optional body ─────────────────────────────────────────────────
  let feedback: string | undefined;
  try {
    const rawBody = await req.json();
    const parsed = RejectBodySchema.safeParse(rawBody);
    if (parsed.success) {
      feedback = parsed.data.feedback;
    }
  } catch {
    // Empty body is fine — feedback is optional
  }

  const now = new Date().toISOString();

  // ── 5. UPDATE approvals ────────────────────────────────────────────────────
  const { error: approvalUpdateError } = await admin
    .from("approvals")
    .update({
      status: "rejected",
      feedback: feedback ?? null,
      decided_at: now,
    })
    .eq("id", approvalId);

  if (approvalUpdateError) {
    console.error(
      "[approvals/reject] failed to update approval",
      approvalUpdateError,
    );
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 6. UPDATE generations ──────────────────────────────────────────────────
  const { error: genUpdateError } = await admin
    .from("generations")
    .update({ status: "rejected", updated_at: now })
    .eq("id", generationId);

  if (genUpdateError) {
    console.error(
      "[approvals/reject] failed to update generation",
      genUpdateError,
    );
    // Approval row already flipped — log and continue
  }

  // ── 7. releaseReserve — return wallet funds to available balance ───────────
  // Credit stays consumed (deducted at generation-create time, never refunded).
  // Only the wallet INR reservation is released.
  if (costPaise > 0) {
    try {
      await releaseReserve({
        brandId,
        amountPaise: costPaise,
        generationId,
      });
    } catch (err) {
      console.error("[approvals/reject] releaseReserve failed", err);
      // Non-fatal — reconciliation can handle this; rejection is committed
    }
  }

  // ── 8. Return ──────────────────────────────────────────────────────────────
  return NextResponse.json({ status: "rejected" }, { status: 200 });
}
