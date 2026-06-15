// GET /api/brand/verification/captcha
//
// Flow B step 1: fetch a fresh GST captcha from the GSTVerify API so the brand
// can solve it before pulling their official GST details. The API key stays
// server-side — only { sessionId, image } (a data:image/png;base64 URL) is
// returned to the client.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGstCaptcha } from "@/lib/gst/gstverify-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient() as Admin;

    const { data: brand } = await admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand)
      return NextResponse.json({ error: "Brand not found" }, { status: 403 });

    const { sessionId, image } = await getGstCaptcha();
    return NextResponse.json({ sessionId, image });
  } catch (err) {
    console.error("[brand/verification/captcha]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load GST captcha" },
      { status: 500 },
    );
  }
}
