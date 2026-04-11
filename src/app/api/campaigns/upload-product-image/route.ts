import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-images";

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
        fileSizeLimit: 5 * 1024 * 1024, // 5MB max
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }

    // Parse file from FormData
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Validate file size client-side already, but double check
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 5MB" },
        { status: 400 }
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
