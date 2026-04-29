/**
 * POST /api/vault/bulk-download
 *
 * Multi-image ZIP download. Brand passes a list of vault item IDs; we
 * fetch each image, bundle them into a single ZIP with sequential
 * filenames (`01_<product>.jpg`, `02_<product>.jpg`, ...) and stream
 * the result back. Single response, no S3 staging.
 *
 * Access: brand owner only. Caps at 50 images per request to keep
 * Vercel function memory predictable.
 */

import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordDownload } from "@/lib/vault";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ITEMS = 50;

export async function POST(req: NextRequest) {
  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids_provided" }, { status: 400 });
  }
  if (ids.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Max ${MAX_ITEMS} items per bulk download` },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Verify brand ownership of all requested items ──
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "brand_not_found" }, { status: 403 });
  }

  // Vault items live in `licenses` (post Chunk D) — a license row is the
  // canonical "delivered, downloadable creative". We read by license.id and
  // join the underlying generation for the image_url + brief.
  const { data: rows, error } = await admin
    .from("licenses")
    .select(
      `
      id, brand_id, generation_id,
      generations!licenses_generation_id_fkey ( image_url, structured_brief )
      `,
    )
    .in("id", ids)
    .eq("brand_id", brand.id);

  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "no_images_found" }, { status: 404 });
  }

  // ── Build ZIP ──
  const zip = new JSZip();
  let added = 0;
  let i = 0;
  for (const row of rows) {
    i++;
    const gen = row.generations as
      | { image_url: string | null; structured_brief: Record<string, unknown> | null }
      | null;
    const url = gen?.image_url;
    if (!url) continue;

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const ext = (url.split(".").pop() ?? "jpg").split("?")[0];
      const productName =
        (gen?.structured_brief as { product_name?: string } | null)
          ?.product_name ?? "image";
      const safeName = productName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 40);
      const filename = `${String(i).padStart(2, "0")}_${safeName}.${ext}`;
      zip.file(filename, bytes);
      added++;

      // Fire-and-forget download counter
      void recordDownload(row.id, "original").catch(() => {});
    } catch (err) {
      console.warn(`[vault/bulk-download] item ${row.id} fetch failed`, err);
    }
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "all_image_fetches_failed" },
      { status: 502 },
    );
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const ts = new Date().toISOString().slice(0, 10);

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="faiceoff-vault-${ts}-${added}images.zip"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
