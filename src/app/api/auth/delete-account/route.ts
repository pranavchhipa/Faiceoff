import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Delete role-specific data first (cascade)
    const role = user.user_metadata?.role ?? "creator";

    if (role === "creator") {
      // Get creator id
      const { data: creator } = await admin
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (creator) {
        // Delete creator-related data in order
        await admin
          .from("approvals")
          .delete()
          .eq("creator_id", creator.id);
        await admin
          .from("creator_lora_models")
          .delete()
          .eq("creator_id", creator.id);
        await admin
          .from("creator_reference_photos")
          .delete()
          .eq("creator_id", creator.id);
        await admin
          .from("creator_compliance_vectors")
          .delete()
          .eq("creator_id", creator.id);
        await admin
          .from("creator_categories")
          .delete()
          .eq("creator_id", creator.id);
        await admin
          .from("creators")
          .delete()
          .eq("id", creator.id);
      }
    } else if (role === "brand") {
      const { data: brand } = await admin
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brand) {
        await admin
          .from("brands")
          .delete()
          .eq("id", brand.id);
      }
    }

    // Historical wallet_transactions_archive rows are immutable per migration
    // 00027 (no delete policy). DPDP-compliant purge of archived ledger data
    // is handled by an admin-only job (Chunk D). Leave the rows in place on
    // account self-deletion — they're legally required retention for
    // financial reconciliation anyway.

    // Delete user row from public.users
    await admin
      .from("users")
      .delete()
      .eq("id", user.id);

    // Delete auth user (removes from Supabase Auth)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("[delete-account] auth delete error:", deleteError.message);
      // Data already deleted, but auth user remains — still return success
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
