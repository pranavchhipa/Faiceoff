import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-images";

// Server-side cap matched to the client-side compression ceiling enforced by
// both upload paths (Studio + brand-request page both abort if compressed
// output > 3.8 MB). Tightening from the legacy 4 MB so any future caller
// that forgets to compress fails fast with a clear 413, rather than
// squeaking through under Vercel's 4.5 MB platform limit. (Phase 1, fix 1.5.)
const MAX_BYTES = 3_800_000;

// Run on Node (not Edge) — needed for FormData with binary blobs.
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/campaigns/upload-product-image
 *
 * Uploads a brand's product image to Supabase Storage.
 * Returns the public URL to be stored in the generation's structured_brief.
 */
export async function POST(request: Request) {
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

    // Ensure bucket exists (public so images are accessible)
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }

    // Parse file from FormData. Different callers historically used either
    // 'image' (legacy /dashboard/campaigns flow) or 'file' (new /brand
    // request + studio flows) — accept both so we don't break either.
    const formData = await request.formData();
    const file =
      (formData.get("image") as File | null) ??
      (formData.get("file") as File | null);

    if (!file) {
      return NextResponse.json(
        { error: "No image provided (expected form field 'image' or 'file')" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error:
            "Image too large (cap is 3.8 MB after compression). The client compressor should reduce most phone photos under this — make sure compressImageForUpload() ran before this POST.",
        },
        { status: 413 }
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: publicUrl, path });
  } catch (err) {
    console.error("[upload-product-image]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
