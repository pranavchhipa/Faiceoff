import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { email, token } = await request.json();

  if (!email || !token) {
    return NextResponse.json(
      { error: "Email and verification code are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Try magiclink type first (from generateLink), then email type (from signInWithOtp)
  let data, error;
  const magicRes = await supabase.auth.verifyOtp({
    email,
    token,
    type: "magiclink",
  });

  if (magicRes.error) {
    // Fallback to email type for backward compatibility
    const emailRes = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    data = emailRes.data;
    error = emailRes.error;
  } else {
    data = magicRes.data;
    error = null;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create public.users + role-specific row using admin client (bypasses RLS)
  if (data.user) {
    const admin = createAdminClient();
    const meta = data.user.user_metadata;
    const role = meta?.role ?? "creator";

    // ── Check if user already exists in public.users ──
    const { data: existingUser } = await admin
      .from("users")
      .select("id, role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (existingUser) {
      // User exists — do NOT overwrite role, just update last login info
      // This prevents the multi-role overwrite vulnerability
    } else {
      // New user — insert profile + role-specific row
      const { error: insertError } = await admin.from("users").insert({
        id: data.user.id,
        email: data.user.email!,
        role,
        display_name: meta?.display_name ?? data.user.email!.split("@")[0],
        phone: meta?.phone ?? null,
      });

      if (insertError) {
        console.error("Failed to insert user profile:", insertError.message);
      }

      // Create role-specific row
      if (role === "creator") {
        await admin.from("creators").upsert(
          { user_id: data.user.id },
          { onConflict: "user_id" }
        );
      } else if (role === "brand") {
        await admin.from("brands").upsert(
          {
            user_id: data.user.id,
            company_name: meta?.display_name ?? "Unnamed Brand",
          },
          { onConflict: "user_id" }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}
