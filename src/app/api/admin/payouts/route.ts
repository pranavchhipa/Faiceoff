import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/admin/payouts — list pending withdrawal requests with creator bank info
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const { data: adminUser } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (adminUser?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: withdrawals, error } = await admin
    .from("withdrawal_requests")
    .select("id, gross_paise, status, created_at, creator_id")
    .in("status", ["requested", "processing", "deductions_applied"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });

  // Normalize field name (gross_paise → amount_paise for frontend compat)
  const rows = (withdrawals ?? []).map((w: Record<string, unknown>) => ({
    ...w,
    amount_paise: w.gross_paise ?? w.amount_paise ?? 0,
  }));
  const creatorIds = [...new Set(rows.map((w: { creator_id: string }) => w.creator_id))];

  const bankMap: Record<string, { holder_name: string; ifsc: string; account_masked: string; user_display_name: string }> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await admin
      .from("creators")
      .select("id, user_id, bank_account_holder_name, bank_ifsc, bank_account_number_encrypted")
      .in("id", creatorIds);

    const userIds = (creators ?? []).map((c: { user_id: string }) => c.user_id);
    const { data: users } = userIds.length > 0
      ? await admin.from("users").select("id, display_name").in("id", userIds)
      : { data: [] };

    const userNameById: Record<string, string> = {};
    for (const u of users ?? []) userNameById[u.id] = u.display_name;

    for (const c of creators ?? []) {
      const enc = c.bank_account_number_encrypted ?? "";
      const masked = enc.length > 0 ? "••••" + enc.slice(-4) : "Not set";
      bankMap[c.id] = {
        holder_name: c.bank_account_holder_name ?? "Unknown",
        ifsc: c.bank_ifsc ?? "Unknown",
        account_masked: masked,
        user_display_name: userNameById[c.user_id] ?? "Unknown",
      };
    }
  }

  const enriched = rows.map((w: Record<string, unknown>) => ({
    ...w,
    ...bankMap[w.creator_id as string],
  }));

  return NextResponse.json({ withdrawals: enriched });
}

const MarkPaidSchema = z.object({
  withdrawal_id: z.string().uuid(),
  utr: z.string().min(1).max(50).optional(),
});

// POST /api/admin/payouts — mark withdrawal as paid
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const { data: adminUser } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (adminUser?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = MarkPaidSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { withdrawal_id, utr } = parsed.data;

  const { error: updateErr } = await admin
    .from("withdrawal_requests")
    .update({ status: "processing", ...(utr ? { cf_utr: utr } : {}), completed_at: new Date().toISOString() })
    .eq("id", withdrawal_id)
    .in("status", ["requested", "deductions_applied", "processing"]);

  if (updateErr) return NextResponse.json({ error: "Failed to update withdrawal" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
