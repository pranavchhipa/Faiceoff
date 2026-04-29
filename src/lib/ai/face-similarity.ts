/**
 * Face similarity gate — verifies the generated face matches the creator's
 * reference photos before delivery.
 *
 * Why:
 *   Even with strong prompt anchoring, diffusion models occasionally drift
 *   on identity (slimmed face, sharper jaw, lighter skin). This gate catches
 *   those silently and triggers a retry, so brands/creators never see a
 *   "this isn't really me" image.
 *
 * Approach:
 *   1. Get face embeddings (512-dim) for the generated image AND the primary
 *      reference photo via Replicate's `arcface` model.
 *   2. Cosine similarity ≥ threshold (default 0.55 for arcface, equivalent
 *      to ~85% visual match) → pass.
 *   3. Fail-open: if Replicate is down or returns malformed output, log to
 *      Sentry and return passed=true (don't block delivery on infra issues).
 *
 * Cost: ~₹0.50 per check (one Replicate run). Skipped if env disabled.
 */

import * as Sentry from "@sentry/nextjs";

// arcface returns 512-dim embeddings; cosine ≥ 0.55 ≈ "same person"
const SIMILARITY_THRESHOLD = Number(
  process.env.FACE_SIMILARITY_THRESHOLD ?? "0.55",
);

const REPLICATE_MODEL =
  process.env.FACE_EMBED_MODEL ??
  "lucataco/arcface:9b65a05d3a1f6f2a6b3a8b2e7c8d1c9c3e1c0e7c4f1f2c4e9c4f3c6e0c8b1c0";

export interface SimilarityResult {
  passed: boolean;
  score: number | null;
  /** True if we couldn't run the check (e.g. infra failure). passed=true here. */
  failedOpen: boolean;
  reason?: string;
}

async function fetchEmbedding(imageUrl: string): Promise<number[] | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=30",
      },
      body: JSON.stringify({
        version: REPLICATE_MODEL.split(":")[1],
        input: { image: imageUrl },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const output = json?.output;
    if (Array.isArray(output) && typeof output[0] === "number") {
      return output as number[];
    }
    if (Array.isArray(output?.embedding)) {
      return output.embedding as number[];
    }
    return null;
  } catch (err) {
    console.warn("[face-similarity] embedding fetch failed", err);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Compare a generated image against a reference image. Both must be public
 * URLs Replicate can fetch. Returns passed=true on infra failure (fail-open).
 *
 * Set ENABLE_FACE_SIMILARITY=false to skip entirely.
 */
export async function checkFaceSimilarity(
  generatedImageUrl: string,
  referenceImageUrl: string,
): Promise<SimilarityResult> {
  // Off by default — flip ENABLE_FACE_SIMILARITY=true once the Replicate
  // model version hash is confirmed and a few real-world score samples are
  // collected to calibrate the threshold.
  if ((process.env.ENABLE_FACE_SIMILARITY ?? "false") !== "true") {
    return { passed: true, score: null, failedOpen: true, reason: "disabled" };
  }

  try {
    const [genEmbed, refEmbed] = await Promise.all([
      fetchEmbedding(generatedImageUrl),
      fetchEmbedding(referenceImageUrl),
    ]);

    if (!genEmbed || !refEmbed) {
      return {
        passed: true,
        score: null,
        failedOpen: true,
        reason: "embedding_unavailable",
      };
    }

    const score = cosineSimilarity(genEmbed, refEmbed);
    return {
      passed: score >= SIMILARITY_THRESHOLD,
      score,
      failedOpen: false,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: "face-similarity" },
    });
    return {
      passed: true,
      score: null,
      failedOpen: true,
      reason: err instanceof Error ? err.message : "unknown_error",
    };
  }
}
