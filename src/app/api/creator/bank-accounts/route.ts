// GET /api/creator/bank-accounts
// Returns the authenticated creator's bank accounts (masked — no raw account numbers).
// Maps DB columns (ifsc, is_active) to frontend shape (ifsc_code, is_primary).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Resolve creator_id from user_id
  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorError || !creator) {
    return NextResponse.json({ accounts: [] });
  }

  // Use unknown cast — creator_bank_accounts isn't in the generated Database type yet.
  type BankRow = {
    id: string;
    account_number_last4: string;
    ifsc: string;
    bank_name: string;
    account_holder_name: string;
    is_active: boolean;
  };

  const { data: rawRows, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("creator_bank_accounts" as never)
    .select("id, account_number_last4, ifsc, bank_name, account_holder_name, is_active")
    .eq("creator_id", creator.id)
    .order("is_active", { ascending: false } as never) as unknown as {
      data: BankRow[] | null;
      error: { message: string } | null;
    };

  if (error) {
    console.error("[bank-accounts] query error", error);
    return NextResponse.json({ accounts: [] });
  }

  // Map to frontend shape expected by WithdrawWizard (ifsc → ifsc_code, is_active → is_primary)
  const accounts = (rawRows ?? []).map((r) => ({
    id: r.id,
    account_number_last4: r.account_number_last4,
    ifsc_code: r.ifsc,
    bank_name: r.bank_name,
    account_holder_name: r.account_holder_name,
    is_primary: r.is_active,
  }));

  return NextResponse.json({ accounts });
}
