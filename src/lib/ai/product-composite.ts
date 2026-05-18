/**
 * Phase 6c — server-side 3-panel product composite.
 *
 * Gemini benefits enormously from multiple "views" of the same product when
 * fidelity matters. Real photographers shoot front, 3/4, and detail
 * frames — we simulate that with sharp:
 *   panel 1: full product (resized)
 *   panel 2: label crop using the bbox from the Phase 6a vision call
 *   panel 3: wordmark crop (top 1/3 of label) — captures brand mark detail
 *
 * Composite is one JPEG, 3 panels side-by-side, with white separators.
 * If labelBbox is null, returns the original bytes untouched (graceful
 * fall-through — Gemini still gets a usable single-view reference).
 */

import sharp from "sharp";

const PANEL_WIDTH = 600;
const PANEL_HEIGHT = 800;
const GUTTER_PX = 4;
const JPEG_QUALITY = 92;

export interface CompositeInput {
  productImageBytes: Uint8Array;
  productImageMime: string;
  /**
   * Normalised label bounding box from `suggestBriefFromProduct` (Phase 6a).
   * Null returns the original image untouched.
   */
  labelBbox?: { x: number; y: number; w: number; h: number } | null;
}

export interface CompositeResult {
  bytes: Uint8Array;
  mimeType: string;
  /** True when we actually built a composite; false when we fell back to original. */
  composited: boolean;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Build a 3-panel product composite. Always returns SOMETHING — even on
 * sharp failure we fall back to the original bytes so the caller can keep
 * the generation pipeline moving.
 */
export async function buildProductComposite(
  input: CompositeInput,
): Promise<CompositeResult> {
  if (!input.labelBbox) {
    return {
      bytes: input.productImageBytes,
      mimeType: input.productImageMime,
      composited: false,
    };
  }

  const bbox = {
    x: clamp01(input.labelBbox.x),
    y: clamp01(input.labelBbox.y),
    w: clamp01(input.labelBbox.w),
    h: clamp01(input.labelBbox.h),
  };
  if (bbox.w <= 0 || bbox.h <= 0) {
    return {
      bytes: input.productImageBytes,
      mimeType: input.productImageMime,
      composited: false,
    };
  }

  try {
    const inputBuf = Buffer.from(input.productImageBytes);

    // Need source dimensions to denormalise the bbox.
    const meta = await sharp(inputBuf).metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    if (srcW < 64 || srcH < 64) {
      // Source too small to crop meaningfully — fall back.
      return {
        bytes: input.productImageBytes,
        mimeType: input.productImageMime,
        composited: false,
      };
    }

    // Panel 1 — full product, contain into PANEL_WIDTH x PANEL_HEIGHT.
    const panelFull = await sharp(inputBuf)
      .resize(PANEL_WIDTH, PANEL_HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();

    // Panel 2 — label crop.
    const labelCrop = await sharp(inputBuf)
      .extract({
        left: Math.max(0, Math.floor(bbox.x * srcW)),
        top: Math.max(0, Math.floor(bbox.y * srcH)),
        width: Math.max(1, Math.floor(bbox.w * srcW)),
        height: Math.max(1, Math.floor(bbox.h * srcH)),
      })
      .resize(PANEL_WIDTH, PANEL_HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();

    // Panel 3 — wordmark = top 1/3 of label bbox (where brand wordmark
    // usually sits). Heuristic — works well for liquor bottles, FMCG packs,
    // most consumer goods. If the label is square-ish, this still picks a
    // reasonable wordmark slice.
    const wordmarkCrop = await sharp(inputBuf)
      .extract({
        left: Math.max(0, Math.floor(bbox.x * srcW)),
        top: Math.max(0, Math.floor(bbox.y * srcH)),
        width: Math.max(1, Math.floor(bbox.w * srcW)),
        height: Math.max(1, Math.floor((bbox.h / 3) * srcH)),
      })
      .resize(PANEL_WIDTH, PANEL_HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();

    // Build canvas — 3 panels + 2 gutters wide.
    const totalWidth = PANEL_WIDTH * 3 + GUTTER_PX * 2;
    const composite = await sharp({
      create: {
        width: totalWidth,
        height: PANEL_HEIGHT,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: panelFull, left: 0, top: 0 },
        { input: labelCrop, left: PANEL_WIDTH + GUTTER_PX, top: 0 },
        {
          input: wordmarkCrop,
          left: (PANEL_WIDTH + GUTTER_PX) * 2,
          top: 0,
        },
      ])
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    return {
      bytes: new Uint8Array(composite),
      mimeType: "image/jpeg",
      composited: true,
    };
  } catch (err) {
    // sharp blew up on a corrupt input or unsupported colorspace — fall back.
    console.warn("[product-composite] failed, falling back to original", err);
    return {
      bytes: input.productImageBytes,
      mimeType: input.productImageMime,
      composited: false,
    };
  }
}
