// POST /api/brand/verification/document
//
// Flow B step 3: brand uploads its GST registration certificate (image/PDF).
// The file lands in the private `brand-documents` bucket and the storage path
// is recorded on brand_verifications.gst_certificate_path. Access is later via
// short-lived signed URLs (service role only) — mirrors creator KYC docs.
//
// FormData field: file (File)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const BUCKET = "brand-documents";
const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function extFor(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpg|jpeg|png|webp|pdf)$/.test(fromName)) return fromName;
  return "jpg";
}

export async function POST(request: Request) {
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
      .select("id, is_verified")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand)
      return NextResponse.json({ error: "Brand not found" }, { status: 403 });

    if (brand.is_verified) {
      return NextResponse.json(
        { error: "already_verified", message: "Your brand is already verified." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "missing_file", message: "Attach your GST certificate." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "too_large", message: "Certificate is over 15 MB." },
        { status: 413 },
      );
    }
    if (file.type && !OK_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "bad_type", message: "Certificate must be JPG, PNG, WebP, or PDF." },
        { status: 400 },
      );
    }

    const path = `${brand.id}/gst-cert-${crypto.randomUUID()}.${extFor(file)}`;
    const buf = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (uploadErr) {
      return NextResponse.json(
        { error: `Certificate upload failed: ${uploadErr.message}` },
        { status: 500 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin
      .from("brand_verifications")
      .upsert(
        {
          brand_id: brand.id,
          gst_certificate_path: path,
          updated_at: nowIso,
        },
        { onConflict: "brand_id" },
      );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    console.error("[brand/verification/document]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
