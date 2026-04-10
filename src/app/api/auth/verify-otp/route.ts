import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email, token } = await request.json();

  if (!email || !token) {
    return NextResponse.json(
      { error: "Email and verification code are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create public.users row if it doesn't exist yet (first login after signup)
  if (data.user) {
    const meta = data.user.user_metadata;
    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id: data.user.id,
        email: data.user.email!,
        role: meta?.role ?? "creator",
        display_name: meta?.display_name ?? data.user.email!.split("@")[0],
        phone: meta?.phone ?? null,
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      console.error("Failed to upsert user profile:", upsertError.message);
    }

    // Create role-specific row
    const role = meta?.role ?? "creator";
    if (role === "creator") {
      await supabase.from("creators").upsert(
        { user_id: data.user.id },
        { onConflict: "user_id" }
      );
    } else if (role === "brand") {
      await supabase.from("brands").upsert(
        {
          user_id: data.user.id,
          company_name: meta?.display_name ?? "Unnamed Brand",
        },
        { onConflict: "user_id" }
      );
    }
  }

  return NextResponse.json({ success: true });
}
