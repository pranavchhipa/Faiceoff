// ─────────────────────────────────────────────────────────────────────────────
// GET /api/earnings/dashboard — creator earnings snapshot
// Reads v_creator_dashboard view + returns min payout threshold.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMinPayoutPaise } from "@/lib/payouts";

interface DashboardRow {
  creator_id: string;
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
}

export async function GET(_req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;

  // ── Resolve creator ────────────────────────────────────────────────────────
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[earnings/dashboard] creator lookup failed", creatorErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json(
      { error: "not_a_creator" },
      { status: 403 },
    );
  }

  // ── Read v_creator_dashboard ───────────────────────────────────────────────
  const { data: dashRow, error: dashErr } = await admin
    .from("v_creator_dashboard")
    .select(
      "creator_id, available_paise, holding_paise, pending_count, lifetime_earned_paise",
    )
    .eq("creator_id", creator.id)
    .maybeSingle();

  if (dashErr) {
    console.error("[earnings/dashboard] view lookup failed", dashErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // View row may be missing if creator has zero activity yet — use defaults.
  const row = (dashRow as DashboardRow | null) ?? {
    creator_id: creator.id,
    available_paise: 0,
    holding_paise: 0,
    pending_count: 0,
    lifetime_earned_paise: 0,
  };

  const min_payout_paise = getMinPayoutPaise();

  return NextResponse.json({
    available_paise: row.available_paise,
    holding_paise: row.holding_paise,
    pending_count: row.pending_count,
    lifetime_earned_paise: row.lifetime_earned_paise,
    min_payout_paise,
    can_withdraw: row.available_paise >= min_payout_paise,
  });
}
