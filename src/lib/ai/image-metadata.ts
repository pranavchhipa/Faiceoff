/**
 * EXIF metadata embedder for generated images.
 *
 * Stamps every Faiceoff-produced image with provenance + license info so:
 *   1. AI provenance is machine-readable (EU AI Act, India's emerging
 *      transparency rules, content-credentials standards like C2PA).
 *   2. If a brand re-uses the asset and gets flagged on Meta/Flipkart, they
 *      can pull the EXIF to prove license ownership.
 *   3. Forensic audit trail — generation_id is embedded forever.
 *
 * Implementation: sharp's `withMetadata({ exif: ... })` writes IFD0 tags.
 * We use the standard `Software`, `Artist`, `Copyright`, `ImageDescription`
 * fields plus a custom `XPComment` for our own JSON blob (Windows + most
 * editors preserve it).
 */

import sharp from "sharp";

export interface ImageMetadataInput {
  generationId: string;
  brandId: string;
  creatorId: string;
  modelName: string;
  generatedAt?: Date;
  /** Public R2 URL where the image will live. */
  publicUrl?: string;
}

/**
 * Returns a new image buffer with embedded EXIF + JSON sidecar metadata.
 * If sharp errors (corrupt input, unsupported format), returns the original
 * buffer unchanged — never throws, never blocks the pipeline.
 */
export async function embedFaiceoffMetadata(
  imageBytes: Uint8Array,
  meta: ImageMetadataInput,
): Promise<Uint8Array> {
  try {
    const generatedAt = meta.generatedAt ?? new Date();
    const sidecar = {
      v: "1",
      platform: "Faiceoff",
      generation_id: meta.generationId,
      brand_id: meta.brandId,
      creator_id: meta.creatorId,
      model: meta.modelName,
      generated_at: generatedAt.toISOString(),
      public_url: meta.publicUrl ?? null,
      ai_generated: true,
    };

    // sharp needs a Buffer for some platforms; convert defensively.
    const inputBuf = Buffer.from(imageBytes);

    const out = await sharp(inputBuf)
      .withMetadata({
        exif: {
          IFD0: {
            Software: `Faiceoff (${meta.modelName})`,
            Artist: `creator:${meta.creatorId}`,
            Copyright: `Faiceoff license · gen:${meta.generationId}`,
            ImageDescription: `AI-generated · ${generatedAt.toISOString()}`,
            // XPComment is UTF-16 wide string in spec but sharp accepts string.
            // We jam our JSON blob here so anything reading EXIF can parse it.
            XPComment: JSON.stringify(sidecar),
          },
        },
      })
      .toBuffer();

    return new Uint8Array(out);
  } catch (err) {
    // Best-effort: never break the pipeline if metadata write fails.
    console.warn("[image-metadata] embed failed, returning original", err);
    return imageBytes;
  }
}
