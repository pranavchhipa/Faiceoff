import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/creator/likeness-data
 *
 * Returns everything the /dashboard/likeness page needs:
 *   - creator row (or null if the signed-in user isn't a creator)
 *   - latest LoRA model (if any)
 *   - reference photos (sorted newest first)
 *   - blocked concepts (compliance vectors)
 *
 * Uses the admin client to bypass RLS. Auth is enforced at the top via the
 * session from cookies — without a session this returns 401.
 *
 * Why: client-side `supabase.from("creators")` reads were failing (returning
 * null for valid creators), which tripped the "non-creator" guard on the page
 * even though the user is authenticated as a creator. Same RLS pattern we've
 * had to route around elsewhere — move the read to the server with the
 * service-role client.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Find the creator row for this user
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, user_id, onboarding_step, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[likeness-data] creator lookup failed", creatorErr);
    return NextResponse.json(
      { error: "Failed to load creator profile" },
      { status: 500 }
    );
  }

  if (!creator) {
    // User is authenticated but isn't a creator (probably a brand account)
    return NextResponse.json({
      isCreator: false,
      creator: null,
      loraModel: null,
      photos: [],
      blockedConcepts: [],
    });
  }

  // 2. Fetch LoRA model + photos + blocked concepts in parallel
  const [loraRes, photosRes, complianceRes] = await Promise.all([
    admin
      .from("creator_lora_models")
      .select("*")
      .eq("creator_id", creator.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("creator_reference_photos")
      .select("id, storage_path, is_primary, uploaded_at")
      .eq("creator_id", creator.id)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("creator_compliance_vectors")
      .select("id, blocked_concept, created_at")
      .eq("creator_id", creator.id),
  ]);

  if (loraRes.error) {
    console.error("[likeness-data] lora lookup failed", loraRes.error);
  }
  if (photosRes.error) {
    console.error("[likeness-data] photos lookup failed", photosRes.error);
  }
  if (complianceRes.error) {
    console.error("[likeness-data] compliance lookup failed", complianceRes.error);
  }

  // 3. Sign each photo's storage_path so the browser can render it.
  //    We use signed URLs (1-hour TTL) so it works even if the bucket is
  //    private. The admin client handles the signing.
  const rawPhotos = photosRes.data ?? [];
  const signedPhotos = await Promise.all(
    rawPhotos.map(async (photo) => {
      const { data, error } = await admin.storage
        .from("reference-photos")
        .createSignedUrl(photo.storage_path, 60 * 60);

      if (error) {
        console.error(
          `[likeness-data] sign failed for ${photo.storage_path}`,
          error
        );
      }

      return {
        id: photo.id,
        storage_path: photo.storage_path,
        is_primary: photo.is_primary,
        uploaded_at: photo.uploaded_at,
        url: data?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({
    isCreator: true,
    creator: {
      id: creator.id,
      onboarding_step: creator.onboarding_step,
      is_active: creator.is_active,
    },
    loraModel: loraRes.data ?? null,
    photos: signedPhotos,
    blockedConcepts: complianceRes.data ?? [],
  });
}
