import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 5MB" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Generate unique path
    const ext = file.name.split(".").pop() || "jpg";
    const path = `avatars/${user.id}/avatar.${ext}`;

    // Ensure avatars bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === "avatars");
    if (!exists) {
      await admin.storage.createBucket("avatars", { public: true });
    }

    // Upload (overwrite existing)
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[avatar] upload error:", uploadError.message);
      return NextResponse.json(
        { error: "Upload failed: " + uploadError.message },
        { status: 500 },
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = admin.storage.from("avatars").getPublicUrl(path);

    // Add cache-buster to URL
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    // Update user row
    await admin
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    // Also update auth metadata
    await supabase.auth.updateUser({
      data: { avatar_url: avatarUrl },
    });

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error("[avatar] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
