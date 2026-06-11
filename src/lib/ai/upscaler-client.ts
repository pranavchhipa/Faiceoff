/**
 * Real-ESRGAN upscaler client.
 *
 * Phase 3.1 — true 4× super-resolution via `nightmareai/real-esrgan` on
 * Replicate. We default to 2× (still produces 2048-4096px on most Gemini
 * outputs) to keep cost down and avoid going past the R2 1-image upload limit.
 *
 * Why Real-ESRGAN and not Clarity Upscaler:
 *   Clarity Upscaler is creative-interpretation upscaling — it CAN hallucinate
 *   facial features when guessing detail. That directly contradicts the
 *   identity lock Phase 2 hardened. Real-ESRGAN is true SR — bilinear-style
 *   detail recovery, no creative reinterpretation. `face_enhance: false` keeps
 *   it firmly in the "make pixels sharper, do not reimagine" lane.
 *
 * Failure mode: any throw from this module is the caller's signal to fall
 * back to the non-upscaled bytes (fail-open). Pipeline never blocks because
 * the upscaler is having a bad day.
 */

import Replicate from "replicate";
import {
  trackCost,
  perCallCostMicros,
} from "@/lib/observability/cost-tracker";

const UPSCALER_TIMEOUT_MS = 20_000;
const DEFAULT_SCALE = 2;

function getUpscalerModel(): `${string}/${string}` | `${string}/${string}:${string}` {
  // env override allows pinning to a specific version hash; default is "always
  // latest" of the slug (Replicate picks the latest version automatically).
  const slug = process.env.REPLICATE_UPSCALER_MODEL ?? "nightmareai/real-esrgan";
  if (!/^[^/]+\/[^/]+(:[^/]+)?$/.test(slug)) {
    throw new Error(
      `REPLICATE_UPSCALER_MODEL must be in owner/name[:version] form. Got: ${slug}`,
    );
  }
  return slug as `${string}/${string}` | `${string}/${string}:${string}`;
}

let _replicate: Replicate | null = null;
function getReplicate(): Replicate {
  if (_replicate) return _replicate;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is required for upscaling");
  }
  _replicate = new Replicate({ auth: token });
  return _replicate;
}

export interface UpscaleResult {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Upscale an image via Real-ESRGAN. Returns new bytes + mime type.
 *
 * Throws on network/API/timeout failure; caller is expected to fail-open and
 * use the original bytes.
 */
export async function upscaleImage(
  bytes: Uint8Array,
  mimeType: string,
  opts?: { scale?: number; signal?: AbortSignal; generationId?: string | null },
): Promise<UpscaleResult> {
  const scale = opts?.scale ?? DEFAULT_SCALE;
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const startedAt = Date.now();

  const replicate = getReplicate();
  const model = getUpscalerModel();

  // Race the Replicate run against a 20s timeout. We accept the slight risk
  // that the prediction continues server-side after timeout (Replicate
  // charges for it) because hanging the pipeline for >20s on an optional
  // post-processing step is the worse outcome.
  const run = replicate.run(
    model,
    {
      input: {
        image: dataUrl,
        scale,
        face_enhance: false,
      },
      signal: opts?.signal,
    },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`upscale timeout after ${UPSCALER_TIMEOUT_MS}ms`)),
      UPSCALER_TIMEOUT_MS,
    );
  });

  let output: unknown;
  try {
    output = await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Real-ESRGAN returns either a single URL string OR a single FileOutput
  // object (depending on SDK version + model variant). Normalise to a fetch-
  // able URL.
  const outputUrl = await normalizeReplicateOutput(output);
  if (!outputUrl) {
    throw new Error("upscaler: Replicate returned no usable output URL");
  }

  // Bounded download — an unbounded fetch here can hang the whole generation
  // pipeline (function killed by the platform → row stuck in 'generating').
  const res = await fetch(outputUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(
      `upscaler: failed to fetch upscaled image (HTTP ${res.status})`,
    );
  }
  const outBytes = new Uint8Array(await res.arrayBuffer());
  const outMime = res.headers.get("content-type") ?? "image/png";

  await trackCost({
    generationId: opts?.generationId ?? null,
    provider: "replicate",
    callType: "upscale",
    costUsdMicros: perCallCostMicros("real-esrgan"),
    durationMs: Date.now() - startedAt,
  });

  return { bytes: outBytes, mimeType: outMime.split(";")[0].trim() };
}

async function normalizeReplicateOutput(output: unknown): Promise<string | null> {
  // Replicate.run() returns one of:
  //   - string URL
  //   - string[] (first element is the URL)
  //   - FileOutput (has .url() method returning URL)
  //   - FileOutput[] (first element exposes .url())
  if (typeof output === "string") return output;

  if (Array.isArray(output) && output.length > 0) {
    return normalizeReplicateOutput(output[0]);
  }

  if (
    output &&
    typeof output === "object" &&
    "url" in (output as Record<string, unknown>) &&
    typeof (output as { url: unknown }).url === "function"
  ) {
    try {
      const u = await (output as { url: () => URL | Promise<URL> }).url();
      return u instanceof URL ? u.toString() : String(u);
    } catch {
      return null;
    }
  }

  return null;
}
