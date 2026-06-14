// POST /api/creator/verification/submit
//
// Creator submits for manual verification: uploads Aadhaar + PAN (images/PDF)
// and confirms they follow @faiceoff.official on Instagram. Files land in the private
// `kyc-documents` bucket; a creator_verifications row is upserted to 'pending'
// for a Control Centre operator to review.
//
// FormData fields: aadhaar (File), pan (File), instagram_followed ("true"/"false")
import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const BUCKET = "kyc-documents";
const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function extFor(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpg|jpeg|png|webp|pdf)$/.test(fromName)) return fromName;
  return "jpg";
}

async function uploadDoc(
  admin: Admin,
  creatorId: string,
  kind: "aadhaar" | "pan",
  file: File,
): Promise<string> {
  const path = `${creatorId}/${kind}-${crypto.randomUUID()}.${extFor(file)}`;
  const buf = await file.arrayBuffer();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (error) throw new Error(`${kind} upload failed: ${error.message}`);
  return path;
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

    const { data: creator } = await admin
      .from("creators")
      .select("id, is_verified")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!creator)
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });

    if (creator.is_verified) {
      return NextResponse.json(
        { error: "already_verified", message: "You're already verified." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const aadhaar = form.get("aadhaar") as File | null;
    const pan = form.get("pan") as File | null;
    const instagramFollowed = String(form.get("instagram_followed") ?? "") === "true";

    if (!aadhaar || !pan) {
      return NextResponse.json(
        { error: "missing_docs", message: "Upload both Aadhaar and PAN." },
        { status: 400 },
      );
    }
    for (const [label, f] of [["Aadhaar", aadhaar], ["PAN", pan]] as const) {
      if (f.size > MAX_BYTES)
        return NextResponse.json(
          { error: "too_large", message: `${label} is over 15 MB.` },
          { status: 413 },
        );
      if (f.type && !OK_TYPES.includes(f.type))
        return NextResponse.json(
          { error: "bad_type", message: `${label} must be JPG, PNG, WebP, or PDF.` },
          { status: 400 },
        );
    }
    if (!instagramFollowed) {
      return NextResponse.json(
        {
          error: "instagram_required",
          message: "Please confirm you follow @faiceoff.official on Instagram.",
        },
        { status: 400 },
      );
    }

    const [aadhaarPath, panPath] = await Promise.all([
      uploadDoc(admin, creator.id, "aadhaar", aadhaar),
      uploadDoc(admin, creator.id, "pan", pan),
    ]);

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin
      .from("creator_verifications")
      .upsert(
        {
          creator_id: creator.id,
          status: "pending",
          aadhaar_path: aadhaarPath,
          pan_path: panPath,
          instagram_followed: instagramFollowed,
          submitted_at: nowIso,
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
          updated_at: nowIso,
        },
        { onConflict: "creator_id" },
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Move kyc_status to in_progress so the payout gate reflects a live review.
    await admin
      .from("creators")
      .update({ kyc_status: "in_progress" })
      .eq("id", creator.id);

    after(async () => {
      await emitNotification(admin, {
        userId: user.id,
        type: "system",
        title: "Verification submitted",
        body: "Your documents are under review. We'll let you know within 1–2 business days.",
        href: "/creator/verify",
      });
    });

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (err) {
    console.error("[verification/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
