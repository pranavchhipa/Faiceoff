import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";

export interface UpscaleInput {
  /** Source image URL to upscale */
  imageUrl: string;
  /** Scale factor (default 2 = 2x resolution) */
  scale?: 2 | 4;
  /** Creativity / detail vs fidelity knob (0-1, lower = more faithful) */
  creativity?: number;
}

export interface UpscaleResult {
  upscaledUrl: string;
}

/**
 * Run philz1337x/clarity-upscaler for detail + resolution enhancement.
 *
 * Nano Banana Pro typically outputs 2048-4096px natively, so this stage is
 * SKIPPED most of the time. Only called when Stage 1 output's long edge is
 * below UPSCALE_MIN_EDGE (2048). See generation-pipeline.ts Step 3 for the
 * conditional gate.
 */
export async function upscale(input: UpscaleInput): Promise<UpscaleResult> {
  const output = await replicate.run(
    MODELS.upscaler as `${string}/${string}`,
    {
      input: {
        image: input.imageUrl,
        scale_factor: input.scale ?? 2,
        creativity: input.creativity ?? 0.3,
        resemblance: 0.6,
        num_inference_steps: 18,
        output_format: "png",
      },
    }
  );

  const outputs = Array.isArray(output) ? output : [output];
  const first = outputs[0] as unknown;
  let upscaledUrl: string | null = null;

  if (typeof first === "string") {
    upscaledUrl = first;
  } else if (
    first &&
    typeof first === "object" &&
    "url" in first &&
    typeof (first as { url: unknown }).url === "function"
  ) {
    const u = (first as { url: () => URL | string }).url();
    upscaledUrl = u instanceof URL ? u.toString() : u;
  }

  if (!upscaledUrl) {
    throw new Error(
      `Upscaler returned unexpected shape: ${JSON.stringify(outputs).slice(0, 200)}`
    );
  }

  return { upscaledUrl };
}

/**
 * Read the long-edge pixel size from an image URL (supports http(s) and data:).
 * Uses sharp since it's already a dependency (see scripts/build-favicon.mjs).
 */
export async function getLongEdge(imageUrl: string): Promise<number> {
  const sharp = (await import("sharp")).default;
  let bytes: Buffer;
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    const b64 = imageUrl.slice(comma + 1);
    bytes = Buffer.from(b64, "base64");
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Cannot fetch for sizing: ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const meta = await sharp(bytes).metadata();
  return Math.max(meta.width ?? 0, meta.height ?? 0);
}
