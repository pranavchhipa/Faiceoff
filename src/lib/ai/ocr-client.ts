/**
 * Phase 6e — Tesseract OCR client for post-generation pack_text validation.
 *
 * After upscale, we OCR the generated image, normalise the result, and
 * compare against the brand's `pack_text` using Levenshtein. If drift >
 * 0.3, that's the signal to trigger Stage 2 refinement (or just log it
 * when refinement isn't enabled / already ran).
 *
 * Tesseract is heavy (worker boot ~1s, English lang pack lazy-loaded
 * ~7MB). We keep a single module-scoped worker per Node process and reuse
 * it. The whole call is timeout-guarded so a hung worker can't stall the
 * pipeline.
 */

import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

const OCR_TIMEOUT_MS = 5_000;
const STAGE2_DRIFT_THRESHOLD = 0.3;

let _worker: Worker | null = null;
let _workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (_worker) return _worker;
  if (_workerPromise) return _workerPromise;
  _workerPromise = (async () => {
    const w = await createWorker("eng");
    _worker = w;
    return w;
  })();
  return _workerPromise;
}

export interface ExtractTextInput {
  imageBytes: Uint8Array;
  /**
   * Optional normalised label bbox. When provided, we crop with sharp before
   * sending to Tesseract — better OCR confidence on small labels because
   * Tesseract gets a 100% label image rather than a label inside a scene.
   */
  bbox?: { x: number; y: number; w: number; h: number } | null;
}

export interface ExtractTextResult {
  text: string;
  /** Tesseract page-level confidence, 0..1 (Tesseract returns 0..100; normalised). */
  confidence: number;
}

/**
 * Extract text from an image. Never throws — returns empty string + 0
 * confidence on any failure so the caller can keep going.
 */
export async function extractTextFromImage(
  input: ExtractTextInput,
): Promise<ExtractTextResult> {
  try {
    let sourceBytes: Uint8Array = input.imageBytes;

    // Crop to label bbox if provided. Skip on metadata failure / tiny image.
    if (input.bbox && input.bbox.w > 0 && input.bbox.h > 0) {
      try {
        const meta = await sharp(Buffer.from(input.imageBytes)).metadata();
        const srcW = meta.width ?? 0;
        const srcH = meta.height ?? 0;
        if (srcW >= 32 && srcH >= 32) {
          const cropped = await sharp(Buffer.from(input.imageBytes))
            .extract({
              left: Math.max(0, Math.floor(input.bbox.x * srcW)),
              top: Math.max(0, Math.floor(input.bbox.y * srcH)),
              width: Math.max(1, Math.floor(input.bbox.w * srcW)),
              height: Math.max(1, Math.floor(input.bbox.h * srcH)),
            })
            .toBuffer();
          sourceBytes = new Uint8Array(cropped);
        }
      } catch {
        // sharp blew up — fall back to full image
      }
    }

    const ocrPromise = (async () => {
      const worker = await getWorker();
      const result = await worker.recognize(Buffer.from(sourceBytes));
      return result;
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`OCR timeout after ${OCR_TIMEOUT_MS}ms`)),
        OCR_TIMEOUT_MS,
      );
    });

    try {
      const { data } = await Promise.race([ocrPromise, timeout]);
      return {
        text: (data.text ?? "").trim(),
        confidence: Math.max(
          0,
          Math.min(1, (data.confidence ?? 0) / 100),
        ),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return { text: "", confidence: 0 };
  }
}

/**
 * Levenshtein distance with light optimisation — single-row table.
 * O(m*n) time, O(min(m,n)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter for less memory.
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  let prev = new Array<number>(b.length + 1);
  for (let i = 0; i <= b.length; i++) prev[i] = i;

  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insert
        prev[j] + 1,            // delete
        prev[j - 1] + cost,     // substitute
      );
    }
    prev = [...curr];
  }
  return prev[b.length];
}

/**
 * Normalised edit distance — 0.0 (identical) to 1.0 (completely different).
 * Both strings are lower-cased + whitespace-collapsed before comparison so
 * "Glenfiddich 12" and "glenfiddich  12 " match exactly.
 */
export function normalizedEditDistance(a: string, b: string): number {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!na && !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return levenshtein(na, nb) / maxLen;
}

export const OCR_CONSTANTS = {
  STAGE2_DRIFT_THRESHOLD,
} as const;

/**
 * Phase 6e — decide whether to trigger Stage 2 refinement.
 *
 * Triggers:
 *   - high_detail_mode = true  → 'manual'
 *   - ocrDrift > 0.3           → 'ocr_fail'
 *   - pack_text > 50 chars     → 'dense_label' (proactive on dense packaging)
 *
 * Returns { trigger: false, reason: 'skipped' } when none fire.
 */
export function shouldTriggerStage2(input: {
  highDetailMode: boolean;
  ocrDrift: number | null;
  packTextLength: number;
}): { trigger: boolean; reason: "manual" | "ocr_fail" | "dense_label" | "skipped" } {
  if (input.highDetailMode) return { trigger: true, reason: "manual" };
  if (input.ocrDrift !== null && input.ocrDrift > STAGE2_DRIFT_THRESHOLD) {
    return { trigger: true, reason: "ocr_fail" };
  }
  if (input.packTextLength > 50) return { trigger: true, reason: "dense_label" };
  return { trigger: false, reason: "skipped" };
}
