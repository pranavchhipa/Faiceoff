/**
 * POST /api/chat/upload
 *
 * Upload a chat attachment (image) to Supabase Storage. Returns the public
 * URL + metadata that the client can include in the next message POST.
 *
 * Auth: any authenticated user.
 * Storage path: chat-attachments/<user_id>/<uuid>.<ext>
 * Bucket is public-read (CDN-cached) so chat clients can render inline.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/redis/rate-limiter";

const BUCKET = "chat-attachments";
const MAX_BYTES = 6 * 1024 * 1024; // 6MB — slightly bigger than product images
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const runtime = "nodejs";
export const maxDuration = 30;

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

    // 20 uploads / minute per user — generous for a chat session
    const rl = await rateLimit(`chat-upload:${user.id}`, 20, "1 m");
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many uploads. Slow down." },
        { status: 429 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Lazily create the bucket if missing (idempotent on first run)
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b: { name: string }) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: Array.from(ALLOWED_MIME),
      });
    }

    const formData = await request.formData();
    const file = (formData.get("file") as File | null) ?? null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided (expected form field 'file')" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPG, PNG, WebP, or GIF." },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image too large. Max 6MB." },
        { status: 413 },
      );
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${safeExt}`;
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

    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      url: publicUrl,
      path,
      type: file.type,
      name: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error("[chat/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
