import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/generations/:id/rehost-image
 *
 * Recovery endpoint. Historic generations stored a Replicate CDN URL as
 * `image_url` (upscaler output was not re-hosted). Those URLs expire
 * after ~24h, so approved generations render as broken images the next
 * day. This route fetches whichever working URL is available
 * (image_url → base_image_url → upscaled_url) and re-uploads it to
 * Supabase Storage, then updates image_url with a fresh 1-year signed URL.
 *
 * Access: the owning brand OR the creator of the generation.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: generation_id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load generation + verify access.
  // Cast: base_image_url / upscaled_url were added in migration 00016 but
  // the Supabase generated types haven't been regenerated yet.
  const { data: genRaw, error: genError } = await admin
    .from("generations")
    .select(
      "id, brand_id, creator_id, image_url, base_image_url, upscaled_url",
    )
    .eq("id", generation_id)
    .maybeSingle();

  const gen = genRaw as unknown as {
    id: string;
    brand_id: string;
    creator_id: string;
    image_url: string | null;
    base_image_url: string | null;
    upscaled_url: string | null;
  } | null;

  if (genError || !gen) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 },
    );
  }

  const [{ data: brand }, { data: creator }] = await Promise.all([
    admin.from("brands").select("user_id").eq("id", gen.brand_id).maybeSingle(),
    admin
      .from("creators")
      .select("user_id")
      .eq("id", gen.creator_id)
      .maybeSingle(),
  ]);
  const allowed =
    brand?.user_id === user.id || creator?.user_id === user.id;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Try each known URL; first one that fetches gets rehosted.
  const candidates = [gen.image_url, gen.base_image_url, gen.upscaled_url]
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No image URL available on this generation to rehost" },
      { status: 400 },
    );
  }

  let bytes: Uint8Array | null = null;
  let contentType = "image/png";
  let sourceUsed: string | null = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      bytes = new Uint8Array(await res.arrayBuffer());
      contentType = res.headers.get("content-type") ?? "image/png";
      sourceUsed = url;
      break;
    } catch {
      // try next
    }
  }

  if (!bytes || !sourceUsed) {
    return NextResponse.json(
      {
        error:
          "All stored image URLs failed to fetch. The images have expired permanently — regenerate required.",
      },
      { status: 410 },
    );
  }

  const storagePath = `generations/${generation_id}/rehosted.png`;
  const { error: uploadErr } = await admin.storage
    .from("reference-photos")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (uploadErr) {
    Sentry.captureException(uploadErr, {
      tags: { route: "generations/rehost-image" },
      extra: { generation_id },
    });
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("reference-photos")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: `Sign failed: ${signErr?.message ?? "no URL returned"}` },
      { status: 500 },
    );
  }

  await admin
    .from("generations")
    .update({ image_url: signed.signedUrl })
    .eq("id", generation_id);

  return NextResponse.json({
    image_url: signed.signedUrl,
    source_used: sourceUsed,
  });
}
