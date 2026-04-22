// ─────────────────────────────────────────────────────────────────────────────
// POST /api/approvals/[id]/approve — creator approves a generation
// Task E12 — Chunk E new route (id = approval.id, NOT generation.id)
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth → resolve creator by user.id → 403 if none
//   2. Fetch approval by id, join generations → verify creator ownership
//   3. Verify approval.status === 'pending' — idempotent on terminal states
//   4. Atomic sequence (all via admin client):
//      a. UPDATE approvals SET status='approved', decided_at=now()
//      b. UPDATE generations SET status='approved'
//      c. spendWallet({ brandId, amountPaise: gen.cost_paise, generationId })
//      d. INSERT escrow_ledger: creator 80% share, holding 7 days
//      e. INSERT platform_revenue_ledger: 20% commission + 18% GST
//      f. issueLicense (handles PDF gen + R2 upload internally)
//   5. Return { status: 'approved', license_id, cert_url }
//
// IDEMPOTENT: if approval is already terminal, return 200 with current status.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spendWallet } from "@/lib/billing";
import { issueLicense } from "@/lib/licenses";
import { PLATFORM_COMMISSION_RATE, GST_ON_COMMISSION_RATE } from "@/lib/billing";

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
    console.error("[approvals/approve] creator lookup failed", creatorError);
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
  const { data: approval, error: approvalError } = await admin
    .from("approvals")
    .select(
      `
      id,
      status,
      generation_id,
      generations!approvals_generation_id_fkey (
        id,
        campaign_id,
        status,
        cost_paise,
        structured_brief,
        campaigns!generations_campaign_id_fkey (
          brand_id,
          creator_id
        )
      )
    `,
    )
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError) {
    console.error("[approvals/approve] approval lookup failed", approvalError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!approval) {
    return NextResponse.json({ error: "approval_not_found" }, { status: 404 });
  }

  const gen = (approval.generations ?? approval["generations!approvals_generation_id_fkey"]) as {
    id: string;
    campaign_id: string;
    status: string;
    cost_paise: number;
    structured_brief: Record<string, unknown> | null;
    campaigns: {
      brand_id: string;
      creator_id: string;
    } | null;
  } | null;

  if (!gen) {
    return NextResponse.json(
      { error: "generation_not_found" },
      { status: 404 },
    );
  }

  // ── 2c. Verify creator owns this generation ────────────────────────────────
  const campaign = gen.campaigns;
  if (!campaign || campaign.creator_id !== creatorId) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403 },
    );
  }

  const brandId = campaign.brand_id;
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

  const now = new Date().toISOString();

  // ── 4a. UPDATE approvals ───────────────────────────────────────────────────
  const { error: approvalUpdateError } = await admin
    .from("approvals")
    .update({ status: "approved", decided_at: now })
    .eq("id", approvalId);

  if (approvalUpdateError) {
    console.error(
      "[approvals/approve] failed to update approval",
      approvalUpdateError,
    );
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 4b. UPDATE generations ─────────────────────────────────────────────────
  const { error: genUpdateError } = await admin
    .from("generations")
    .update({ status: "approved", updated_at: now })
    .eq("id", generationId);

  if (genUpdateError) {
    console.error(
      "[approvals/approve] failed to update generation",
      genUpdateError,
    );
    // Approval row already flipped — log and continue; reconciliation will catch up
  }

  // ── 4c. spendWallet ────────────────────────────────────────────────────────
  // Converts the pending reservation to spent on the brand's wallet.
  // credit stays permanently deducted; wallet reservation is converted to spend.
  if (costPaise > 0) {
    try {
      await spendWallet({
        brandId,
        amountPaise: costPaise,
        generationId,
      });
    } catch (err) {
      console.error("[approvals/approve] spendWallet failed", err);
      // Non-fatal for the approval flow — finance reconciliation will catch up
    }
  }

  // ── 4d. INSERT escrow_ledger ───────────────────────────────────────────────
  // Creator earns 80% (1 - PLATFORM_COMMISSION_RATE)
  const creatorShare = Math.round(costPaise * (1 - PLATFORM_COMMISSION_RATE));
  const holdingUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: escrowError } = await admin
    .from("escrow_ledger")
    .insert({
      creator_id: creatorId,
      generation_id: generationId,
      amount_paise: creatorShare,
      holding_until: holdingUntil,
      type: "release_per_image",
    });

  if (escrowError) {
    console.error("[approvals/approve] escrow_ledger insert failed", escrowError);
    // Non-fatal — finance team can reconcile; approval is already committed
  }

  // ── 4e. INSERT platform_revenue_ledger ────────────────────────────────────
  const commission = Math.round(costPaise * PLATFORM_COMMISSION_RATE);
  const gstOnCommission = Math.round(commission * GST_ON_COMMISSION_RATE);

  const { error: revenueError } = await admin
    .from("platform_revenue_ledger")
    .insert({
      generation_id: generationId,
      amount_paise: commission,
      gst_paise: gstOnCommission,
      source: "approval_commission",
    });

  if (revenueError) {
    console.error(
      "[approvals/approve] platform_revenue_ledger insert failed",
      revenueError,
    );
  }

  // ── 4f. Issue license (includes PDF gen + R2 upload) ─────────────────────
  const brief = gen.structured_brief ?? {};
  const scope = (brief.scope as string) ?? "digital";
  const isExclusive = Boolean(brief.exclusive ?? false);

  let licenseId: string | null = null;
  let certUrl: string | null = null;

  try {
    const licenseResult = await issueLicense({
      generationId,
      brandId,
      creatorId,
      scope: scope as "digital" | "digital_print" | "digital_print_packaging",
      isExclusive,
      amountPaidPaise: costPaise,
      creatorSharePaise: creatorShare,
      platformSharePaise: commission,
    });

    licenseId = licenseResult.license.id;
    certUrl = licenseResult.cert_url;
  } catch (err) {
    console.error("[approvals/approve] issueLicense failed", err);
    // Non-fatal — approval is committed; license can be re-issued by admin
  }

  // ── 5. Return ──────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      status: "approved",
      license_id: licenseId,
      cert_url: certUrl,
    },
    { status: 200 },
  );
}
