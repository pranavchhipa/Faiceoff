import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storage_paths, set_primary } = await request.json();

  if (!Array.isArray(storage_paths) || storage_paths.length === 0) {
    return NextResponse.json(
      { error: "At least one photo path is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Get creator record. maybeSingle() so a missing row returns null instead
  // of throwing — consistent with the rest of the self-healing onboarding
  // routes.
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // Is this true first-time onboarding, or is an already-onboarded creator
  // adding more photos (e.g. via /creator/likeness "Add photos")? Only the
  // former may delete-then-replace — doing that for an already-onboarded
  // creator would wipe their whole library (including their chosen primary
  // and its face embedding) out from under them. See save-photos data-loss
  // finding.
  const { count: existingCount, error: countErr } = await admin
    .from("creator_reference_photos")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  const isFirstTimeOnboarding = (existingCount ?? 0) === 0;

  if (isFirstTimeOnboarding) {
    // Defensive cleanup for true first-timers (e.g. a retried/partial
    // submission) — harmless since nothing meaningful exists yet.
    await admin
      .from("creator_reference_photos")
      .delete()
      .eq("creator_id", creator.id);
  }

  // First-time onboarding always needs a primary chosen from this batch.
  // A post-onboarding "add more photos" batch only shifts the primary if
  // the creator explicitly picked one of the new uploads as their main
  // photo — otherwise their existing primary (and its embedding) stays put.
  const shouldSetPrimary = isFirstTimeOnboarding || Boolean(set_primary);

  if (shouldSetPrimary && !isFirstTimeOnboarding) {
    // is_primary isn't DB-enforced as exclusive — demote the creator's
    // current primary before promoting the new one.
    const { error: demoteErr } = await admin
      .from("creator_reference_photos")
      .update({ is_primary: false })
      .eq("creator_id", creator.id)
      .eq("is_primary", true);
    if (demoteErr) {
      return NextResponse.json({ error: demoteErr.message }, { status: 500 });
    }
  }

  // Insert photo records — appended alongside any existing rows.
  const inserts = storage_paths.map((path: string, i: number) => ({
    creator_id: creator.id,
    storage_path: path,
    is_primary: shouldSetPrimary && i === 0,
  }));

  const { error: insertErr } = await admin
    .from("creator_reference_photos")
    .insert(inserts);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Advance onboarding step directly to pricing. The old `lora_review` step
  // kicked off a LoRA training job, but the current generation pipeline
  // (Nano Banana Pro / Gemini 3 Pro Image / Kontext Max) uses the reference
  // photos as face anchors at generation time — no per-creator training
  // needed. The lora_review page/route is kept as a redirect shim for any
  // creator whose DB row still says "lora_review".
  await admin
    .from("creators")
    .update({ onboarding_step: "complete" })
    .eq("user_id", user.id);

  // ── Generate face embeddings in the background ──
  // Only when this submission actually changed who the primary is — if the
  // creator's existing primary was left untouched, its embedding already on
  // file is still correct and shouldn't be overwritten with a random
  // appended photo. Fires after the response so the creator isn't blocked.
  // Best-effort: if Replicate is down, the row stays empty and the gate
  // falls open until the next photo upload.
  if (shouldSetPrimary) {
    after(async () => {
      try {
        const primaryPath = storage_paths[0];
        if (!primaryPath) return;

        // Sign a 10-min URL so Replicate can fetch the photo from Supabase
        // Storage (private bucket).
        const { data: signed } = await admin.storage
          .from("reference-photos")
          .createSignedUrl(primaryPath, 600);
        const photoUrl = signed?.signedUrl;
        if (!photoUrl) return;

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
          console.warn("[save-photos] REPLICATE_API_TOKEN missing, skipping embed");
          return;
        }

        // ArcFace embedding via Replicate. Stores 512-dim vector on the
        // creator row; the face-similarity gate compares generated outputs
        // against this at gen time.
        const res = await fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
            Prefer: "wait=30",
          },
          body: JSON.stringify({
            version: process.env.FACE_EMBED_MODEL_VERSION ?? "",
            input: { image: photoUrl },
          }),
        });

        if (!res.ok) {
          console.warn(
            "[save-photos] face embed failed, will retry later",
            res.status,
          );
          return;
        }

        const json = await res.json();
        const embedding =
          Array.isArray(json?.output) ? json.output : json?.output?.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) return;

        // Persist on the creator's primary reference photo row
        await admin
          .from("creator_reference_photos")
          .update({ face_embedding: embedding })
          .eq("creator_id", creator.id)
          .eq("is_primary", true);
      } catch (err) {
        console.warn("[save-photos] face embed background job failed", err);
        Sentry.captureException(err, {
          tags: { route: "onboarding/save-photos", phase: "face_embed" },
          extra: { creator_id: creator.id },
        });
      }
    });
  }

  return NextResponse.json({ success: true });
}
