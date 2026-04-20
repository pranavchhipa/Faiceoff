import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";
import {
  QUALITY_GATE_THRESHOLDS,
  type QualityScores,
} from "@/domains/generation/types";

/**
 * Run Replicate CLIP features model for one image, return an embedding vector.
 *
 * `andreasjansson/clip-features` — the default model — returns:
 *   [{ input: "url", embedding: [0.012, -0.031, ...] }]
 * The previous parser naively flattened the array and checked for a numeric
 * first element, which failed on the object-wrapped shape. That silent throw
 * was swallowed by `Promise.allSettled` in runQualityGate() and every score
 * fell back to 0 — exactly the "all zeros" symptom reported by ops.
 *
 * We now handle three shapes defensively:
 *   1. [{input, embedding: [float, ...]}]   — andreasjansson/clip-features
 *   2. [[float, ...]]                         — alternate CLIP models
 *   3. [float, ...]                           — direct vector (rare)
 */
async function clipEmbed(imageUrl: string): Promise<number[]> {
  const output = await replicate.run(MODELS.clip as `${string}/${string}`, {
    input: { inputs: imageUrl },
  });

  let vector: unknown[] | null = null;

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (
      first &&
      typeof first === "object" &&
      "embedding" in first &&
      Array.isArray((first as { embedding: unknown }).embedding)
    ) {
      vector = (first as { embedding: unknown[] }).embedding;
    } else if (Array.isArray(first)) {
      vector = first;
    } else if (typeof first === "number") {
      vector = output;
    }
  }

  if (!vector || vector.length === 0 || typeof vector[0] !== "number") {
    throw new Error(
      `CLIP output shape not recognized. Model=${MODELS.clip}. ` +
        `Got: ${JSON.stringify(output).slice(0, 200)}`
    );
  }

  return vector as number[];
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
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
 * CLIP similarity between output image and product reference image.
 * Higher = output preserved product better.
 */
export async function clipSimilarity(
  outputImageUrl: string,
  referenceImageUrl: string
): Promise<number> {
  const [a, b] = await Promise.all([
    clipEmbed(outputImageUrl),
    clipEmbed(referenceImageUrl),
  ]);
  return cosine(a, b);
}

/**
 * Face similarity: max cosine similarity of output vs any of the creator's
 * reference photos (we use the anchor pack + original reference photos).
 * CLIP is a pragmatic face proxy; swap for a dedicated face embedder later
 * without changing the interface.
 */
export async function faceSimilarity(
  outputImageUrl: string,
  creatorReferenceUrls: string[]
): Promise<number> {
  if (creatorReferenceUrls.length === 0) return 0;

  const outEmbed = await clipEmbed(outputImageUrl);
  const refs = await Promise.all(
    creatorReferenceUrls.slice(0, 8).map(clipEmbed)
  );

  let best = 0;
  for (const r of refs) {
    const s = cosine(outEmbed, r);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Aesthetic score via improved-aesthetic-predictor (0-10 scale).
 */
export async function aestheticScore(imageUrl: string): Promise<number> {
  const output = await replicate.run(
    MODELS.aesthetic as `${string}/${string}`,
    { input: { image: imageUrl } }
  );
  if (typeof output === "number") return output;
  if (
    output &&
    typeof output === "object" &&
    "score" in output &&
    typeof (output as { score: unknown }).score === "number"
  ) {
    return (output as { score: number }).score;
  }
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "number") return first;
  throw new Error("Aesthetic predictor returned unexpected shape");
}

export interface QualityGateInput {
  outputImageUrl: string;
  productReferenceUrl: string;
  creatorReferenceUrls: string[];
}

/**
 * Run all three checks in parallel, produce a QualityScores verdict against
 * thresholds. Never throws on score-level failures — returns passed=false so
 * the pipeline can retry or surface.
 */
export async function runQualityGate(
  input: QualityGateInput
): Promise<QualityScores> {
  const [clipRes, faceRes, aestheticRes] = await Promise.allSettled([
    clipSimilarity(input.outputImageUrl, input.productReferenceUrl),
    faceSimilarity(input.outputImageUrl, input.creatorReferenceUrls),
    aestheticScore(input.outputImageUrl),
  ]);

  // If a model failed, fail-safe to 0 so gate fails and we retry.
  // We don't want to silently pass a generation when a check errored.
  // Log rejection reasons so silent failures surface in Inngest logs —
  // scores of 0.00 across the board usually mean the Replicate model
  // slug is wrong, unversioned, or rate-limited, not that the image
  // is bad.
  if (clipRes.status === "rejected") {
    console.error("[quality-gate] CLIP similarity failed:", clipRes.reason);
  }
  if (faceRes.status === "rejected") {
    console.error("[quality-gate] Face similarity failed:", faceRes.reason);
  }
  if (aestheticRes.status === "rejected") {
    console.error("[quality-gate] Aesthetic score failed:", aestheticRes.reason);
  }

  const clip = clipRes.status === "fulfilled" ? clipRes.value : 0;
  const face = faceRes.status === "fulfilled" ? faceRes.value : 0;
  const aesthetic = aestheticRes.status === "fulfilled" ? aestheticRes.value : 0;

  const failedOn: Array<"clip" | "face" | "aesthetic"> = [];
  if (clip < QUALITY_GATE_THRESHOLDS.clip) failedOn.push("clip");
  if (face < QUALITY_GATE_THRESHOLDS.face) failedOn.push("face");
  if (aesthetic < QUALITY_GATE_THRESHOLDS.aesthetic) failedOn.push("aesthetic");

  return {
    clip,
    face,
    aesthetic,
    passed: failedOn.length === 0,
    failedOn: failedOn.length === 0 ? null : failedOn,
  };
}
