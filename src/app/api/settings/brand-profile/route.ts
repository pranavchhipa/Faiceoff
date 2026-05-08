import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// Lenient: accept "acme.com" or "https://acme.com" — we normalize on save.
const BrandProfileSchema = z.object({
  company_name: z.string().min(1).max(200),
  industry: z.string().max(100).optional().nullable(),
  website_url: z.string().max(255).optional().nullable(),
  gst_number: z.string().max(15).optional().nullable(),
});

function normalizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

// PUT /api/settings/brand-profile — upsert brand profile fields
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = BrandProfileSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join(".") || "field"}: ${first.message}` : "Validation failed";
    return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;
  const { error: updateErr } = await admin
    .from("brands")
    .update({
      company_name: parsed.data.company_name,
      ...(parsed.data.industry !== undefined ? { industry: parsed.data.industry } : {}),
      ...(parsed.data.website_url !== undefined ? { website_url: normalizeUrl(parsed.data.website_url) } : {}),
      ...(parsed.data.gst_number !== undefined ? { gst_number: parsed.data.gst_number } : {}),
    })
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[brand-profile] update failed", updateErr);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
