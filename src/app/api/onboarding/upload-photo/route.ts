import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "reference-photos";

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

    // Get creator ID
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }

    // Parse single file from FormData
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${creator.id}/${crypto.randomUUID()}.${ext}`;
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
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, path });
  } catch (err) {
    console.error("[upload-photo]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
