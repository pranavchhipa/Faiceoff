// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vault/[id]/download?format=original|pdf|docx
// Task E13 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// Generates and streams a download package for the given vault image.
// Increments the per-format download counter atomically.
//
// Formats:
//   original → ZIP (image + cert + readme), Content-Type: application/zip
//   pdf      → PDF package (image + brief), Content-Type: application/pdf
//   docx     → DOCX package, Content-Type: application/vnd.openxml...
//
// Access: brand users only, scoped to their own generations.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getVaultImage,
  recordDownload,
  generateOriginalZip,
  generatePdfPackage,
  generateDocxPackage,
  VaultError,
} from "@/lib/vault";
import type { DownloadFormat } from "@/lib/vault";

const VALID_FORMATS: DownloadFormat[] = ["original", "pdf", "docx"];

const FORMAT_CONTENT_TYPES: Record<DownloadFormat, string> = {
  original: "application/zip",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve brand ─────────────────────────────────────────────────────────
  const admin = createAdminClient() as any;
  const { data: brandRow } = await admin
    .from("brands")
    .select("id, company_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brandRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "brands_only" },
      { status: 403 },
    );
  }
  const brandId = (brandRow as { id: string }).id;
  const brandCompanyName = (brandRow as { company_name: string }).company_name ?? "Brand";

  // ── 3. Validate format ───────────────────────────────────────────────────────
  const url = new URL(req.url);
  const rawFormat = url.searchParams.get("format") ?? "";
  if (!VALID_FORMATS.includes(rawFormat as DownloadFormat)) {
    return NextResponse.json(
      {
        error: "invalid_format",
        message: `format must be one of: ${VALID_FORMATS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const format = rawFormat as DownloadFormat;

  // ── 4. Fetch vault image ─────────────────────────────────────────────────────
  let image;
  try {
    image = await getVaultImage({ brandId, imageId: id });
  } catch (err) {
    if (err instanceof VaultError) {
      if (err.code === "NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 500 },
      );
    }
    console.error("[vault/[id]/download] fetch error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!image.image_url) {
    return NextResponse.json(
      { error: "image_not_ready", message: "Generation has no image URL yet" },
      { status: 422 },
    );
  }

  // ── 5. Record the download (non-fatal if it fails) ───────────────────────────
  try {
    await recordDownload({ brandId, imageId: id, format });
  } catch (err) {
    console.warn("[vault/[id]/download] recordDownload failed (non-fatal)", err);
  }

  // ── 6. Generate the package buffer ───────────────────────────────────────────
  let buffer: Buffer;
  try {
    switch (format) {
      case "original": {
        buffer = await generateOriginalZip({
          imageUrl: image.image_url,
          certUrl: image.cert_url ?? undefined,
          generationId: id,
        });
        break;
      }
      case "pdf": {
        buffer = await generatePdfPackage({
          imageUrl: image.image_url,
          certUrl: image.cert_url ?? undefined,
          generationId: id,
          brief: image.brief,
        });
        break;
      }
      case "docx": {
        buffer = await generateDocxPackage({
          imageUrl: image.image_url,
          certUrl: image.cert_url ?? undefined,
          generationId: id,
          brief: image.brief,
          creator: {
            display_name: image.creator.display_name,
            instagram_handle: image.creator.instagram_handle ?? undefined,
          },
          brand: {
            company_name: brandCompanyName,
          },
        });
        break;
      }
    }
  } catch (err) {
    console.error("[vault/[id]/download] package generation failed", err);
    const message = err instanceof Error ? err.message : "generation_failed";
    return NextResponse.json(
      { error: "package_generation_failed", message },
      { status: 500 },
    );
  }

  // ── 7. Return binary response ────────────────────────────────────────────────
  const contentType = FORMAT_CONTENT_TYPES[format];
  const fileExtensions: Record<DownloadFormat, string> = {
    original: "zip",
    pdf: "pdf",
    docx: "docx",
  };
  const ext = fileExtensions[format];
  const filename = `faiceoff-${id}.${ext}`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
