import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/verify-otp
 *
 * Body: { email, token }
 *
 * Verifies the 8-digit OTP the user received via email and establishes a
 * session by setting auth cookies. Also makes sure the matching
 * `public.users` + role-specific (creators / brands) row exists — uses
 * upserts so this is idempotent across retries.
 *
 * Historical bug: if the profile inserts silently failed (network blip,
 * RLS misconfig, duplicate key race), the user ended up authenticated
 * with NO DB rows — which then stalled onboarding with an infinite
 * spinner on /dashboard/onboarding. We now upsert instead of insert
 * and return 500 if the profile rows truly can't be persisted.
 */
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

  // Create / upsert public.users + role-specific row using admin client
  // (bypasses RLS). This block is idempotent — safe to hit on retries.
  if (data.user) {
    const admin = createAdminClient();
    const meta = data.user.user_metadata ?? {};
    const authUserId = data.user.id;
    const authUserEmail = data.user.email ?? email;

    // Determine role. If the row already exists we respect its stored role
    // (prevents multi-role overwrite vuln); otherwise fall back to metadata.
    const { data: existingUser } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUserId)
      .maybeSingle();

    const role: "creator" | "brand" =
      existingUser?.role === "brand" || existingUser?.role === "creator"
        ? (existingUser.role as "creator" | "brand")
        : meta?.role === "brand"
          ? "brand"
          : "creator";

    // Upsert public.users — always safe to run
    const { error: userUpsertErr } = await admin.from("users").upsert(
      {
        id: authUserId,
        email: authUserEmail,
        role,
        display_name:
          meta?.display_name ?? authUserEmail.split("@")[0] ?? "User",
        phone: meta?.phone ?? null,
      },
      { onConflict: "id" },
    );

    if (userUpsertErr) {
      console.error(
        "[verify-otp] public.users upsert failed:",
        userUpsertErr.message,
      );
      // This is critical — if the profile row can't be created we'll get an
      // infinite spinner on onboarding. Fail loudly so the client shows the
      // error and the user can retry (OTP usually still valid for a minute).
      return NextResponse.json(
        { error: "Couldn't set up your profile. Please try again." },
        { status: 500 },
      );
    }

    // Upsert role-specific row
    if (role === "creator") {
      const { error: creatorUpsertErr } = await admin.from("creators").upsert(
        { user_id: authUserId },
        { onConflict: "user_id" },
      );
      if (creatorUpsertErr) {
        console.error(
          "[verify-otp] creators upsert failed:",
          creatorUpsertErr.message,
        );
        return NextResponse.json(
          { error: "Couldn't set up your creator profile. Please try again." },
          { status: 500 },
        );
      }
    } else {
      const { error: brandUpsertErr } = await admin.from("brands").upsert(
        {
          user_id: authUserId,
          company_name: meta?.display_name ?? "Unnamed Brand",
        },
        { onConflict: "user_id" },
      );
      if (brandUpsertErr) {
        console.error(
          "[verify-otp] brands upsert failed:",
          brandUpsertErr.message,
        );
        return NextResponse.json(
          { error: "Couldn't set up your brand profile. Please try again." },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}
