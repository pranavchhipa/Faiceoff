import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";
import {
  QUALITY_GATE_THRESHOLDS,
  type QualityScores,
} from "@/domains/generation/types";

/**
 * Retry wrapper for Replicate predictions.
 *
 * Why: a single run of the quality gate fires up to ~11 concurrent CLIP /
 * aesthetic calls against one Replicate account:
 *   - 1 output embed (clipSimilarity)
 *   - 1 product embed (clipSimilarity)
 *   - up to 8 creator-reference embeds (faceSimilarity)
 *   - 1 aesthetic call
 *
 * Replicate throttles low-credit accounts to "burst of 1" concurrent
 * prediction — meaning 10 of those 11 calls 429 immediately. The rejections
 * were previously caught by `Promise.allSettled` in runQualityGate() and
 * defaulted to score=0, producing the "Face similarity 0.00" failures
 * observed in prod (2026-04-21). This is the same throttling behavior that
 * face-anchor.ts already documents and sidesteps by running LoRA calls
 * sequentially; we apply the same pattern here.
 *
 * Backoff: 500ms → 1s → 2s → 4s (4 retries by default). On any non-429
 * error, throws immediately (no silent swallow).
 */
async function replicateRunWithRetry<T = unknown>(
  modelRef: `${string}/${string}`,
  input: Record<string, unknown>,
  opName: string,
  maxRetries = 4,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return (await replicate.run(modelRef, { input })) as T;
    } catch (err) {
      attempt += 1;
      const msg = err instanceof Error ? err.message : String(err);
      const is429 =
        /\b429\b|rate.?limit|too many|concurrency|RESOURCE_EXHAUSTED/i.test(msg);
      if (!is429 || attempt > maxRetries) {
        console.error(
          `[quality-gate:${opName}] ${is429 ? "429 after max retries" : "non-429 error"} — giving up after ${attempt} attempt(s): ${msg.slice(0, 200)}`,
        );
        throw err;
      }
      const delayMs = 500 * Math.pow(2, attempt - 1);
      console.warn(
        `[quality-gate:${opName}] 429 on attempt ${attempt}, backing off ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

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
  const output = await replicateRunWithRetry<unknown>(
    MODELS.clip as `${string}/${string}`,
    { inputs: imageUrl },
    "clip-embed",
  );

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
        `URL=${imageUrl.slice(0, 100)}. ` +
        `Got: ${JSON.stringify(output).slice(0, 200)}`,
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
 *
 * Sequential (not Promise.all) because Replicate throttles low-credit accounts
 * to "burst of 1" — firing both embeds in parallel immediately 429s one of
 * them. The retry wrapper in clipEmbed handles transient 429s but we avoid
 * creating them in the first place by not fanning out.
 */
export async function clipSimilarity(
  outputImageUrl: string,
  referenceImageUrl: string
): Promise<number> {
  const a = await clipEmbed(outputImageUrl);
  const b = await clipEmbed(referenceImageUrl);
  return cosine(a, b);
}

/**
 * Face similarity: max cosine similarity of output vs any of the creator's
 * reference photos (we use the anchor pack + original reference photos).
 * CLIP is a pragmatic face proxy; swap for a dedicated face embedder later
 * without changing the interface.
 *
 * Two changes from the previous implementation — both targeting the
 * "face similarity 0.00" failures observed in prod (2026-04-21):
 *
 * 1. Sequential ref embeds instead of Promise.all: Replicate's burst-of-1
 *    concurrency limit 429s all-but-one of the parallel calls, and the
 *    previous caller (`Promise.allSettled` in runQualityGate) swallowed
 *    those rejections and defaulted face=0. Same pattern already proven
 *    in face-anchor.ts (4 LoRA calls sequential). Adds latency but
 *    reliability > speed on a step we run at most 1–2× per generation.
 *
 * 2. Per-ref try/catch so one bad URL (expired signed URL, 404, corrupt
 *    image) doesn't kill the whole face score. We only throw if ZERO
 *    refs succeeded — an all-refs-failed case is a real problem worth
 *    surfacing, but a single bad ref should just be skipped.
 */
export async function faceSimilarity(
  outputImageUrl: string,
  creatorReferenceUrls: string[]
): Promise<number> {
  if (creatorReferenceUrls.length === 0) return 0;

  // outEmbed failure IS fatal — no point continuing without it. Caller
  // (runQualityGate) converts this to face=0 and fails the gate, which is
  // the correct behavior: we genuinely can't measure similarity.
  const outEmbed = await clipEmbed(outputImageUrl);

  const refUrls = creatorReferenceUrls.slice(0, 8);
  let best = 0;
  let succeeded = 0;
  const failures: string[] = [];

  for (let i = 0; i < refUrls.length; i++) {
    const url = refUrls[i];
    try {
      const r = await clipEmbed(url);
      const s = cosine(outEmbed, r);
      if (s > best) best = s;
      succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`ref[${i}]: ${msg.slice(0, 120)}`);
      console.warn(
        `[quality-gate:face-ref] ref ${i + 1}/${refUrls.length} failed — ${msg.slice(0, 200)}. URL=${url.slice(0, 100)}`,
      );
    }
  }

  if (succeeded === 0) {
    throw new Error(
      `Face similarity: all ${refUrls.length} reference embeds failed. ` +
        `Failures: ${failures.join(" | ")}`,
    );
  }

  console.log(
    `[quality-gate:face] ${succeeded}/${refUrls.length} ref embeds succeeded, best=${best.toFixed(3)}`,
  );
  return best;
}

/**
 * Aesthetic score via improved-aesthetic-predictor (0-10 scale).
 *
 * Uses replicateRunWithRetry to survive transient 429s from the shared
 * Replicate concurrency budget — the aesthetic call fires at the same time
 * as CLIP embeds in runQualityGate() (via Promise.allSettled), so it's
 * competing for the same burst-of-1 slot and needs the same backoff.
 */
export async function aestheticScore(imageUrl: string): Promise<number> {
  const output = await replicateRunWithRetry<unknown>(
    MODELS.aesthetic as `${string}/${string}`,
    { image: imageUrl },
    "aesthetic",
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
  throw new Error(
    `Aesthetic predictor returned unexpected shape. Model=${MODELS.aesthetic}. ` +
      `Got: ${JSON.stringify(output).slice(0, 200)}`,
  );
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
