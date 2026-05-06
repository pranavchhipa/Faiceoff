import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/creator/upload-cover
// Body: multipart/form-data { file: File }
// Stores at covers/{creator_id}/cover.{ext} in reference-photos bucket.
// Updates creators.cover_image_path.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 8 MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `covers/${creator.id}/cover.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("reference-photos")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) {
    console.error("[upload-cover]", uploadErr);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  await admin
    .from("creators")
    .update({ cover_image_path: path })
    .eq("id", creator.id);

  // Return a 1h signed URL so the client can show a preview immediately
  const { data: signed } = await admin.storage
    .from("reference-photos")
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    cover_image_path: path,
    cover_image_url: signed?.signedUrl ?? null,
  });
}
