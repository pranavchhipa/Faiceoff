import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "reference-photos";
// Per-photo soft cap. Vercel's platform limit (~4.5 MB) kicks in first
// on deployed Hobby/Pro; this cap is a belt-and-suspenders guard for
// self-hosted deployments and also gives us a clean error message.
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // Fast-path content-length check so we can return a helpful 413 before
    // buffering. (If the body is chunked / no Content-Length, this no-ops
    // and the file.size check below still catches it.)
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        {
          error: `Photo is too large (${Math.round(declaredLength / 1024 / 1024)} MB). Please pick one under 10 MB — the client-side compression should shrink most phone photos below this.`,
        },
        { status: 413 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get creator ID — maybeSingle() so a missing row returns null instead
    // of throwing. (verify-otp + current-step should have self-healed it
    // already, but we defend-in-depth.)
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_PHOTO_BYTES,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }

    // Parse single file from FormData
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        {
          error: `Photo is too large (${Math.round(file.size / 1024 / 1024)} MB). Please pick one under 10 MB.`,
        },
        { status: 413 },
      );
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
