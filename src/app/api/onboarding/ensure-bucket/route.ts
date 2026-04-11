import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKETS = ["reference-photos", "kyc-documents"] as const;

export async function POST() {
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

  const { data: existing } = await admin.storage.listBuckets();
  const existingNames = new Set(existing?.map((b) => b.name) ?? []);

  for (const bucket of BUCKETS) {
    if (!existingNames.has(bucket)) {
      await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      });
    }
  }

  return NextResponse.json({ success: true, creator_id: creator.id });
}
