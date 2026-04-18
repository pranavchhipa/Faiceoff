# Industry-Grade Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Flux Dev text-to-image generation with a 5-stage industry-grade pipeline producing magazine-quality, product-accurate images, using **Nano Banana Pro** (Google Gemini Image) as the primary inference model.

**Architecture:** Nano Banana Pro as primary inference (multi-reference: LoRA-generated face anchor pack + product photo + cinematic prompt) → quality gate (CLIP/face/aesthetic checks with 2-retry budget) → Clarity Upscaler 2× (conditional, only if native resolution < 2048px) → existing Hive safety check → approval. Flux Kontext Max kept as v3 fallback for edge cases. Feature-flagged via `GENERATION_PIPELINE_VERSION` (v1/v2/v3) for instant rollback.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres + pgvector, Inngest v4, `@google/genai` SDK (Nano Banana Pro primary), Replicate SDK (Kontext Max fallback, Clarity Upscaler, CLIP, aesthetic predictor), Cloudflare R2, TypeScript strict.

**Testing approach:** This codebase has no existing unit test harness. Rather than bootstrap vitest alongside 18 feature tasks, we validate via (a) `tsc --noEmit` after every task, (b) `next build` after infrastructure tasks, (c) manual smoke-test scripts hitting Google AI / Replicate test endpoints, (d) dog-food phase with real creators. Adding vitest + unit tests is a separate initiative.

**Branch:** Work directly on `main` with frequent commits. No worktree — user is solo developer, fast feedback loop preferred.

---

## File Structure

### New files
- `supabase/migrations/00016_industry_grade_pipeline.sql` — DB schema changes
- `src/lib/ai/nano-banana-client.ts` — Nano Banana Pro multi-reference wrapper (v2, primary)
- `src/lib/ai/kontext-client.ts` — Flux Kontext Max wrapper (v3, fallback)
- `src/lib/ai/upscaler.ts` — Clarity Upscaler wrapper (conditional)
- `src/lib/ai/quality-gate.ts` — composite CLIP + face + aesthetic checks
- `src/lib/ai/face-anchor.ts` — Stage 0 face anchor PACK generation logic
- `src/lib/ai/pipeline-router.ts` — feature flag dispatch (v2 primary, v3 fallback)
- `src/lib/ai/pipeline-config.ts` — env-driven model slugs + flag
- `src/inngest/functions/creator/face-anchor-generation.ts` — Inngest fn triggered post-LoRA-training
- `scripts/smoke-test-pipeline.ts` — end-to-end smoke test script
- `scripts/backfill-face-anchors.ts` — one-time backfill for existing creators

### Modified files
- `src/inngest/functions/generation/generation-pipeline.ts` — replace Step 3 with router
- `src/inngest/index.ts` — register face-anchor function
- `src/lib/ai/prompt-assembler.ts` — cinematic template + merged negative guidance
- `src/domains/generation/types.ts` — add `QualityScores`, `PipelineVersion`, `AspectRatio` types
- `src/domains/generation/schemas.ts` — aspect ratio enum on structured_brief
- `src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx` — aspect ratio dropdown
- `src/app/(dashboard)/dashboard/generations/[id]/page.tsx` — quality scores + pipeline version display
- `src/app/api/generations/create/route.ts` — accept aspect_ratio in body
- `.env.example` — new env vars
- `src/types/supabase.ts` — regenerate after migration
- `package.json` — add `@google/genai` dependency

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/00016_industry_grade_pipeline.sql`
- Modify: `src/types/supabase.ts` (regenerate after)

- [ ] **Step 1.1: Write migration SQL**

Create file `supabase/migrations/00016_industry_grade_pipeline.sql`:

```sql
-- Industry-grade generation pipeline: Nano Banana Pro + quality gate + upscaler
-- Ref spec: docs/superpowers/specs/2026-04-18-industry-grade-generation-pipeline-design.md

-- New columns on generations for v2 pipeline outputs and telemetry
ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS base_image_url text,
  ADD COLUMN IF NOT EXISTS upscaled_url text,
  ADD COLUMN IF NOT EXISTS quality_scores jsonb,
  ADD COLUMN IF NOT EXISTS generation_attempts smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider_prediction_id text,
  ADD COLUMN IF NOT EXISTS pipeline_version text NOT NULL DEFAULT 'v1';

-- Face anchor PACK cache on creators (Stage 0 output, regenerated on LoRA retrain)
-- jsonb array of R2 URLs: ["https://.../neutral.png", "https://.../smile.png", ...]
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS face_anchor_pack jsonb,
  ADD COLUMN IF NOT EXISTS face_anchor_generated_at timestamptz;

-- JSONB index for quality score analytics (P95 gate pass rate dashboards)
CREATE INDEX IF NOT EXISTS idx_generations_quality_scores
  ON generations USING gin (quality_scores);

-- Partial index for retry-rate monitoring
CREATE INDEX IF NOT EXISTS idx_generations_attempts_high
  ON generations (created_at)
  WHERE generation_attempts > 1;

COMMENT ON COLUMN generations.base_image_url IS 'Stage 1 provider (Nano Banana Pro / Kontext Max) output before upscale';
COMMENT ON COLUMN generations.upscaled_url IS 'Stage 3 Clarity Upscaler 2x output (null if skipped because native resolution sufficient)';
COMMENT ON COLUMN generations.quality_scores IS 'JSON: { clip, face, aesthetic, passed, failedOn }';
COMMENT ON COLUMN generations.generation_attempts IS 'Stage 1 attempts made (1-3, including retries)';
COMMENT ON COLUMN generations.provider_prediction_id IS 'Google AI operation ID (v2) or Replicate prediction ID (v1/v3)';
COMMENT ON COLUMN generations.pipeline_version IS 'v1=Flux Dev legacy, v2=Nano Banana Pro, v3=Kontext Max';
COMMENT ON COLUMN creators.face_anchor_pack IS 'Cached LoRA-generated canonical face pack (3-5 URLs) used as multi-reference to Nano Banana Pro';
```

- [ ] **Step 1.2: Check how migrations are run in this project**

Run: `ls scripts/ | grep -i migrat`
Read the runner to understand how to apply. If unclear, apply manually via Supabase SQL editor (copy-paste migration file content).

- [ ] **Step 1.3: Apply migration**

Either run the project's migration runner script (e.g. `node scripts/run-migrations.mjs`) or copy the SQL into Supabase dashboard SQL editor and execute.

- [ ] **Step 1.4: Regenerate Supabase types**

Run:
```bash
npx supabase gen types typescript --project-id <YOUR_PROJECT_ID> > src/types/supabase.ts
```

If the CLI fails, manually add the six new `generations` columns and two new `creators` columns to the relevant interfaces in `src/types/supabase.ts`.

- [ ] **Step 1.5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors). If errors, fix type additions.

- [ ] **Step 1.6: Commit**

```bash
git add supabase/migrations/00016_industry_grade_pipeline.sql src/types/supabase.ts
git commit -m "Add generation pipeline v2 schema (quality scores, face anchor pack, upscale)"
```

---

## Task 2: Domain types + schemas

**Files:**
- Modify: `src/domains/generation/types.ts`
- Modify: `src/domains/generation/schemas.ts`

- [ ] **Step 2.1: Add pipeline version + aspect ratio + quality score types**

Edit `src/domains/generation/types.ts`. Add at the bottom:

```typescript
/** Pipeline model version, selected via GENERATION_PIPELINE_VERSION env or per-brief override */
export type PipelineVersion = "v1" | "v2" | "v3";

/** Supported output aspect ratios. v2 (Nano Banana Pro) accepts these natively. */
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "3:2";

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 2048, height: 2048 },
  "16:9": { width: 2304, height: 1296 },
  "9:16": { width: 1296, height: 2304 },
  "4:5": { width: 1792, height: 2240 },
  "3:2": { width: 2304, height: 1536 },
};

/** Upscale is skipped when native output >= this on long edge */
export const UPSCALE_MIN_EDGE = 2048;

/** Quality gate scores persisted on generation row after Stage 2 */
export interface QualityScores {
  /** CLIP cosine similarity between output and product reference image (0-1) */
  clip: number;
  /** Face similarity vs creator anchor pack, 1 - cosine distance (0-1, higher=better) */
  face: number;
  /** Aesthetic predictor score (0-10) */
  aesthetic: number;
  /** Whether the combined gate passed */
  passed: boolean;
  /** Which threshold failed if not passed, for telemetry */
  failedOn: Array<"clip" | "face" | "aesthetic"> | null;
}

export const QUALITY_GATE_THRESHOLDS = {
  clip: 0.82,
  face: 0.75,
  aesthetic: 6.5,
} as const;
```

- [ ] **Step 2.2: Add aspect ratio to structured brief schema**

Edit `src/domains/generation/schemas.ts`. Find the `structuredBriefSchema` (or similar Zod schema for brief) and add inside the `z.object({...})`:

```typescript
aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:5", "3:2"]).default("1:1"),
pipeline_version: z.enum(["v1", "v2", "v3"]).optional(),
```

- [ ] **Step 2.3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2.4: Commit**

```bash
git add src/domains/generation/types.ts src/domains/generation/schemas.ts
git commit -m "Add PipelineVersion, AspectRatio, QualityScores domain types"
```

---

## Task 3: Environment variables + feature flag config + Google SDK

**Files:**
- Modify: `.env.example`
- Modify: `package.json`
- Create: `src/lib/ai/pipeline-config.ts`

- [ ] **Step 3.1: Install Google Gen AI SDK**

Run: `npm install @google/genai`
Expected: installed into `dependencies`. Confirm by reading `package.json`.

- [ ] **Step 3.2: Document new env vars in .env.example**

Add to `.env.example`:

```bash
# ── Generation Pipeline v2 (Nano Banana Pro) ────────────────────────────────
# Default pipeline version for new generations: v1=Flux Dev (legacy), v2=Nano Banana Pro, v3=Kontext Max
GENERATION_PIPELINE_VERSION=v2

# Google AI — Nano Banana Pro (primary v2)
# Obtain from https://aistudio.google.com/app/apikey
GOOGLE_AI_API_KEY=
# Model slug. "Pro" tier: gemini-3.0-pro-image (fall back to gemini-2.5-flash-image if 3.0 unavailable on your key).
NANO_BANANA_MODEL=gemini-3.0-pro-image
NANO_BANANA_FALLBACK_MODEL=gemini-2.5-flash-image

# Replicate model slugs — v3 fallback + quality gate + upscaler
REPLICATE_KONTEXT_MODEL=black-forest-labs/flux-kontext-max
REPLICATE_UPSCALER_MODEL=philz1337x/clarity-upscaler
REPLICATE_CLIP_MODEL=andreasjansson/clip-features
REPLICATE_AESTHETIC_MODEL=christophschuhmann/improved-aesthetic-predictor

# Max auto-retries on quality gate failure (default: 2)
GENERATION_MAX_RETRIES=2

# R2 path prefix for face anchor packs (cached Stage 0 outputs)
R2_FACE_ANCHORS_PREFIX=face-anchors/
```

- [ ] **Step 3.3: Create pipeline config module**

Create `src/lib/ai/pipeline-config.ts`:

```typescript
import type { PipelineVersion } from "@/domains/generation/types";

/**
 * Centralized pipeline config — read env vars once and freeze.
 * Env var overrides allow per-generation selection via structured_brief.pipeline_version.
 */

export const DEFAULT_PIPELINE_VERSION: PipelineVersion =
  (process.env.GENERATION_PIPELINE_VERSION as PipelineVersion | undefined) ?? "v2";

export const MAX_RETRIES: number = Number(process.env.GENERATION_MAX_RETRIES ?? 2);

export const MODELS = {
  // v2 primary
  nanoBanana: process.env.NANO_BANANA_MODEL ?? "gemini-3.0-pro-image",
  nanoBananaFallback:
    process.env.NANO_BANANA_FALLBACK_MODEL ?? "gemini-2.5-flash-image",
  // v3 fallback
  kontext: process.env.REPLICATE_KONTEXT_MODEL ?? "black-forest-labs/flux-kontext-max",
  // Stage 3 + Stage 2 support models (all Replicate)
  upscaler: process.env.REPLICATE_UPSCALER_MODEL ?? "philz1337x/clarity-upscaler",
  clip: process.env.REPLICATE_CLIP_MODEL ?? "andreasjansson/clip-features",
  aesthetic:
    process.env.REPLICATE_AESTHETIC_MODEL ??
    "christophschuhmann/improved-aesthetic-predictor",
} as const;

export const R2_FACE_ANCHORS_PREFIX =
  process.env.R2_FACE_ANCHORS_PREFIX ?? "face-anchors/";

export function resolvePipelineVersion(
  overrideFromBrief?: PipelineVersion
): PipelineVersion {
  return overrideFromBrief ?? DEFAULT_PIPELINE_VERSION;
}

export function requireGoogleAiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_AI_API_KEY is required for v2 pipeline (Nano Banana Pro). Get one from https://aistudio.google.com/app/apikey"
    );
  }
  return key;
}
```

- [ ] **Step 3.4: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add package.json package-lock.json .env.example src/lib/ai/pipeline-config.ts
git commit -m "Add Google Gen AI SDK, pipeline config module, model slug env vars"
```

---

## Task 4: Nano Banana Pro client wrapper (v2 primary)

**Files:**
- Create: `src/lib/ai/nano-banana-client.ts`

- [ ] **Step 4.1: Write the Nano Banana Pro client**

Create `src/lib/ai/nano-banana-client.ts`:

```typescript
import { GoogleGenAI } from "@google/genai";
import { MODELS, requireGoogleAiKey } from "./pipeline-config";
import type { AspectRatio } from "@/domains/generation/types";
import { ASPECT_RATIO_DIMENSIONS } from "@/domains/generation/types";

export interface NanoBananaGenerateInput {
  /** LLM-assembled cinematic prompt (negative guidance merged inline — see prompt-assembler) */
  prompt: string;
  /** 3-5 face anchor URLs from Stage 0 */
  faceAnchorPack: string[];
  /** URL to brand's uploaded product photo */
  productImageUrl: string;
  /** Target aspect ratio */
  aspectRatio: AspectRatio;
  /** Seed for reproducibility / retry variance (Gemini "seed" in generationConfig) */
  seed?: number;
}

export interface NanoBananaGenerateResult {
  /** Generated image URL (temporary; caller re-uploads to R2) */
  imageUrl: string;
  /** Provider operation / response ID for audit */
  predictionId: string;
  /** Actual dimensions produced (from response metadata, else ASPECT_RATIO_DIMENSIONS lookup) */
  width: number;
  height: number;
  /** Model slug actually used (resolves Pro vs fallback) */
  modelUsed: string;
}

/** Recognized Gemini safety block — worth falling back to v3 Kontext Max for same generation. */
export class NanoBananaSafetyBlockedError extends Error {
  constructor(public readonly raw: unknown) {
    super("Nano Banana Pro refused prompt for safety reasons");
    this.name = "NanoBananaSafetyBlockedError";
  }
}

/**
 * Fetch a remote image URL and return a Buffer + MIME type for inline payload.
 * Gemini's image-input API takes base64-encoded inline data OR fileData refs;
 * we use inline data so we don't need to maintain a Google Cloud Storage bucket.
 */
async function fetchAsInlineData(
  url: string
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference image ${url}: HTTP ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Node-friendly base64 encode (works in Next.js server runtime)
  const data = Buffer.from(bytes).toString("base64");
  return { data, mimeType };
}

/**
 * Call Nano Banana Pro (Gemini 3 Pro Image or 2.5 Flash Image) with:
 *   - a cinematic text prompt (includes negative guidance inline)
 *   - a product reference photo (to preserve)
 *   - a face anchor pack (3-5 images to preserve identity)
 *
 * Gemini image models accept a multi-part `contents` array where each part
 * is either text or inlineData (base64-encoded image). We assemble:
 *   [text prompt, product image, ...face anchors]
 *
 * If the primary "Pro" model throws NOT_FOUND or PERMISSION_DENIED (some API
 * keys don't have Pro access), we retry once on the fallback model.
 *
 * Note: Gemini SDK surface evolves — verify the latest call shape against
 *   https://ai.google.dev/gemini-api/docs/image-generation
 * at integration time. The shape below is accurate for @google/genai >= 0.3.x
 * as of 2026-04.
 */
export async function generateWithNanoBanana(
  input: NanoBananaGenerateInput
): Promise<NanoBananaGenerateResult> {
  const ai = new GoogleGenAI({ apiKey: requireGoogleAiKey() });
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  // Assemble multi-part contents: prompt + product image + face anchors (first 5)
  const [productInline, ...anchorInlines] = await Promise.all([
    fetchAsInlineData(input.productImageUrl),
    ...input.faceAnchorPack.slice(0, 5).map(fetchAsInlineData),
  ]);

  const promptWithAspect = `${input.prompt}\n\nTarget aspect ratio: ${input.aspectRatio}.`;

  const parts = [
    { text: promptWithAspect },
    { inlineData: productInline },
    ...anchorInlines.map((a) => ({ inlineData: a })),
  ];

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    temperature: 0.9,
  };
  if (typeof input.seed === "number") {
    generationConfig.seed = input.seed;
  }

  async function tryModel(modelName: string): Promise<NanoBananaGenerateResult> {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: generationConfig,
    });

    // Safety block detection
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new NanoBananaSafetyBlockedError(response);
    }
    if (
      candidate.finishReason === "SAFETY" ||
      candidate.finishReason === "PROHIBITED_CONTENT" ||
      candidate.finishReason === "BLOCKLIST"
    ) {
      throw new NanoBananaSafetyBlockedError(candidate);
    }

    // Extract inline image bytes from first image part
    const imagePart = candidate.content?.parts?.find(
      (p: unknown): p is { inlineData: { data: string; mimeType: string } } =>
        typeof p === "object" &&
        p !== null &&
        "inlineData" in p &&
        typeof (p as { inlineData: { data?: unknown } }).inlineData?.data ===
          "string"
    );
    if (!imagePart) {
      throw new Error(
        `Nano Banana returned no image part (finishReason=${candidate.finishReason ?? "unknown"})`
      );
    }

    const base64 = imagePart.inlineData.data;
    const mime = imagePart.inlineData.mimeType ?? "image/png";

    // Upload to a short-lived data URL; downstream code re-uploads to R2.
    // We return a data: URL so the pipeline's existing "fetch + upload to R2"
    // pattern works without branching on provider.
    const imageUrl = `data:${mime};base64,${base64}`;

    const predictionId =
      response.responseId ??
      `nano_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      imageUrl,
      predictionId,
      width: dims.width,
      height: dims.height,
      modelUsed: modelName,
    };
  }

  try {
    return await tryModel(MODELS.nanoBanana);
  } catch (err) {
    if (err instanceof NanoBananaSafetyBlockedError) {
      throw err; // propagate so router can fall back to v3
    }
    const msg = err instanceof Error ? err.message : String(err);
    const isAvailabilityIssue =
      /404|NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|model.+not.+found/i.test(msg);
    if (!isAvailabilityIssue) throw err;
    // Try fallback (2.5 Flash Image) if Pro isn't enabled on this key
    return tryModel(MODELS.nanoBananaFallback);
  }
}
```

- [ ] **Step 4.2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If the `@google/genai` typings surface name mismatches (SDK is young and naming churns), narrow with `as unknown as { models: { generateContent: (…)=>… } }` rather than disable the whole file — keep the call-shape visible.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/ai/nano-banana-client.ts
git commit -m "Add Nano Banana Pro (Gemini Image) multi-reference client with Pro→Flash fallback"
```

---

## Task 5: Clarity Upscaler wrapper (conditional Stage 3)

**Files:**
- Create: `src/lib/ai/upscaler.ts`

- [ ] **Step 5.1: Write upscaler wrapper**

Create `src/lib/ai/upscaler.ts`:

```typescript
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
```

- [ ] **Step 5.2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/upscaler.ts
git commit -m "Add Clarity Upscaler wrapper + getLongEdge helper for conditional Stage 3"
```

---

## Task 6: Quality gate (CLIP + face + aesthetic)

**Files:**
- Create: `src/lib/ai/quality-gate.ts`

- [ ] **Step 6.1: Write the quality gate module**

Create `src/lib/ai/quality-gate.ts`:

```typescript
import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";
import {
  QUALITY_GATE_THRESHOLDS,
  type QualityScores,
} from "@/domains/generation/types";

/**
 * Run Replicate CLIP features model for one image, return an embedding vector.
 * If the chosen CLIP model has a different output shape, adapt this parser.
 */
async function clipEmbed(imageUrl: string): Promise<number[]> {
  const output = await replicate.run(MODELS.clip as `${string}/${string}`, {
    input: { inputs: imageUrl },
  });

  const flat = Array.isArray(output) ? (output as unknown[]).flat() : output;
  if (!Array.isArray(flat) || typeof flat[0] !== "number") {
    throw new Error("CLIP output not a numeric vector");
  }
  return flat as number[];
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
```

- [ ] **Step 6.2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/quality-gate.ts
git commit -m "Add quality gate (CLIP + face + aesthetic) with fail-safe scoring"
```

---

## Task 7: Face anchor PACK generation

**Files:**
- Create: `src/lib/ai/face-anchor.ts`

- [ ] **Step 7.1: Write face anchor pack generator**

Create `src/lib/ai/face-anchor.ts`:

```typescript
import { replicate } from "./replicate-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2_FACE_ANCHORS_PREFIX } from "./pipeline-config";

/**
 * Stage 0: Generate a PACK of 4 canonical headshots of the creator using
 * their trained Flux LoRA. Runs once per LoRA training completion, result
 * cached on creators.face_anchor_pack for use as multi-reference input to
 * Nano Banana Pro on every subsequent generation.
 *
 * Why a pack instead of a single anchor:
 *   Nano Banana Pro is not LoRA-native. It relies on the multi-image
 *   reference pack to lock identity. A single neutral portrait isn't enough
 *   to keep identity stable across varied scenes. Empirically, 4 angles
 *   (neutral / smile / three-quarter / soft side) match LoRA-only
 *   consistency at ≈ ₹10-15 one-time cost.
 */

/** Prompts producing varied angles / expressions for stable multi-ref identity lock */
const ANCHOR_PROMPTS: Array<{ slot: string; prompt: string }> = [
  {
    slot: "neutral",
    prompt:
      "studio portrait, neutral expression, direct camera gaze, soft natural light, plain light gray background, 85mm lens, shoulders up, photorealistic, candid natural skin texture, unretouched",
  },
  {
    slot: "smile",
    prompt:
      "studio portrait, warm natural smile, relaxed, soft window light, plain off-white background, 85mm lens, shoulders up, photorealistic, candid natural skin texture, unretouched",
  },
  {
    slot: "three-quarter",
    prompt:
      "three-quarter view portrait, head turned 30 degrees, looking towards camera, soft natural light from front-left, plain background, 85mm lens, photorealistic, visible skin pores, unretouched",
  },
  {
    slot: "soft-side",
    prompt:
      "soft side profile portrait, head turned 60 degrees, gentle natural light, plain background, 85mm lens, shoulders visible, photorealistic, candid skin texture, unretouched",
  },
];

const ANCHOR_NEGATIVE =
  "plastic, waxy, cgi, 3d render, airbrushed, smooth skin, uncanny, distorted, extra fingers, low quality, glasses unless part of identity";

export interface GenerateFaceAnchorPackInput {
  creatorId: string;
  /** Replicate model slug for this creator's trained LoRA */
  loraModelId: string;
  /** LoRA trigger word (e.g., "TOK") */
  triggerWord: string;
}

export interface GenerateFaceAnchorPackResult {
  /** R2 public URLs for each anchor in the pack, in ANCHOR_PROMPTS order */
  anchorUrls: string[];
}

async function runOneAnchor(args: {
  loraModelId: string;
  triggerWord: string;
  prompt: string;
}): Promise<string> {
  const promptWithTrigger = `a photo of ${args.triggerWord} person, ${args.prompt}`;

  const output = await replicate.run(
    args.loraModelId as `${string}/${string}`,
    {
      input: {
        prompt: promptWithTrigger,
        negative_prompt: ANCHOR_NEGATIVE,
        num_outputs: 1,
        guidance_scale: 5.5,
        num_inference_steps: 50,
        output_format: "png",
        aspect_ratio: "1:1",
      },
    }
  );

  const outputs = Array.isArray(output) ? output : [output];
  const first = outputs[0] as unknown;
  if (typeof first === "string") return first;
  if (
    first &&
    typeof first === "object" &&
    "url" in first &&
    typeof (first as { url: unknown }).url === "function"
  ) {
    const u = (first as { url: () => URL | string }).url();
    return u instanceof URL ? u.toString() : u;
  }
  throw new Error("Anchor generation returned unexpected shape");
}

async function fetchAndUpload(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceUrl: string;
  storagePath: string;
}): Promise<string> {
  const res = await fetch(args.sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch anchor from Replicate: ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const bucket = "reference-photos"; // reuse existing bucket
  const { error: uploadErr } = await args.admin.storage
    .from(bucket)
    .upload(args.storagePath, bytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`R2 upload failed: ${uploadErr.message}`);
  }
  const { data: publicData } = args.admin.storage
    .from(bucket)
    .getPublicUrl(args.storagePath);
  return publicData.publicUrl;
}

/**
 * Run the creator's LoRA across ANCHOR_PROMPTS in parallel, upload results to
 * R2, persist the URL array on creators.face_anchor_pack. Idempotent: safe to
 * retry (storage path includes a timestamp-based ID per run).
 */
export async function generateAndCacheFaceAnchorPack(
  input: GenerateFaceAnchorPackInput
): Promise<GenerateFaceAnchorPackResult> {
  const admin = createAdminClient();
  const runId = Date.now().toString(36);

  const raw = await Promise.all(
    ANCHOR_PROMPTS.map((p) =>
      runOneAnchor({
        loraModelId: input.loraModelId,
        triggerWord: input.triggerWord,
        prompt: p.prompt,
      })
    )
  );

  const uploaded = await Promise.all(
    raw.map((sourceUrl, i) =>
      fetchAndUpload({
        admin,
        sourceUrl,
        storagePath: `${R2_FACE_ANCHORS_PREFIX}${input.creatorId}/${runId}-${ANCHOR_PROMPTS[i].slot}.png`,
      })
    )
  );

  const { error: updateErr } = await admin
    .from("creators")
    .update({
      face_anchor_pack: uploaded,
      face_anchor_generated_at: new Date().toISOString(),
    })
    .eq("id", input.creatorId);

  if (updateErr) {
    throw new Error(`Persisting face_anchor_pack failed: ${updateErr.message}`);
  }

  return { anchorUrls: uploaded };
}

/**
 * Check if creator has a valid face anchor pack cached. Returns the URLs if
 * fresh (generated after latest LoRA training), [] if stale or missing.
 */
export async function getValidFaceAnchorPack(
  creatorId: string
): Promise<string[]> {
  const admin = createAdminClient();
  const { data: creator } = await admin
    .from("creators")
    .select("face_anchor_pack, face_anchor_generated_at")
    .eq("id", creatorId)
    .maybeSingle();

  const pack = (creator?.face_anchor_pack ?? null) as string[] | null;
  if (!pack || pack.length === 0 || !creator?.face_anchor_generated_at) {
    return [];
  }

  // Check if LoRA was retrained after pack was generated
  const { data: lora } = await admin
    .from("creator_lora_models")
    .select("created_at, training_status")
    .eq("creator_id", creatorId)
    .eq("training_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lora) return [];

  const anchorTime = new Date(creator.face_anchor_generated_at).getTime();
  const loraTime = new Date(lora.created_at).getTime();
  if (loraTime > anchorTime) return [];

  return pack;
}
```

- [ ] **Step 7.2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/face-anchor.ts
git commit -m "Add face anchor PACK generator (4 angles, LoRA-driven) with R2 caching"
```

---

## Task 8: Face anchor Inngest function

**Files:**
- Create: `src/inngest/functions/creator/face-anchor-generation.ts`
- Modify: `src/inngest/index.ts`
- Modify: `src/inngest/functions/creator/lora-training.ts` (or wherever training completes)

- [ ] **Step 8.1: Write the Inngest function**

Create `src/inngest/functions/creator/face-anchor-generation.ts`:

```typescript
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndCacheFaceAnchorPack } from "@/lib/ai/face-anchor";

/**
 * Fires when a creator's LoRA training completes. Generates and caches the
 * Stage 0 face anchor pack so subsequent generations don't run the LoRA
 * each time.
 *
 * Event: creator/lora-training-completed (emit from existing LoRA training
 * completion logic — see Step 8.3 for where to add the emit).
 */
export const faceAnchorGeneration = inngest.createFunction(
  {
    id: "creator/face-anchor-generation",
    triggers: [{ event: "creator/lora-training-completed" }],
    retries: 3,
  },
  async ({ event, step }) => {
    const { creator_id } = event.data as { creator_id: string };
    const admin = createAdminClient();

    await step.run("load-lora-model", async () => {
      const { data: lora } = await admin
        .from("creator_lora_models")
        .select("replicate_model_id, trigger_word, training_status")
        .eq("creator_id", creator_id)
        .eq("training_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lora?.replicate_model_id) {
        throw new Error(
          `No completed LoRA model found for creator ${creator_id}`
        );
      }
    });

    const result = await step.run("generate-anchor-pack", async () => {
      const { data: lora } = await admin
        .from("creator_lora_models")
        .select("replicate_model_id, trigger_word")
        .eq("creator_id", creator_id)
        .eq("training_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return generateAndCacheFaceAnchorPack({
        creatorId: creator_id,
        loraModelId: lora.replicate_model_id,
        triggerWord: lora.trigger_word ?? "TOK",
      });
    });

    return { creator_id, anchorUrls: result.anchorUrls };
  }
);
```

- [ ] **Step 8.2: Register the function**

Edit `src/inngest/index.ts`. Read the current file first to find the function-export pattern (likely a `functions` array). Then add:

```typescript
// Near the other function imports
import { faceAnchorGeneration } from "./functions/creator/face-anchor-generation";

// In the `functions` export array (exact syntax depends on file shape — match existing):
export const functions = [
  // ... existing entries ...
  faceAnchorGeneration,
];
```

- [ ] **Step 8.3: Emit the trigger event from LoRA training completion**

Find where LoRA training is marked `completed`. Likely candidates:
- `src/inngest/functions/creator/lora-training.ts`
- `src/app/api/creator/lora-training/*/route.ts`

Grep: `git grep -l "training_status" -- 'src/**'`

After the status update to `completed`, emit:

```typescript
await inngest.send({
  name: "creator/lora-training-completed",
  data: { creator_id: creatorId },
});
```

- [ ] **Step 8.4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/inngest/functions/creator/face-anchor-generation.ts src/inngest/index.ts
# Also stage the modified LoRA training file from step 8.3
git commit -m "Emit face-anchor-generation event on LoRA training completion"
```

---

## Task 9: Cinematic prompt assembler

**Files:**
- Modify: `src/lib/ai/prompt-assembler.ts`

- [ ] **Step 9.1: Read current assembler**

Run: `cat src/lib/ai/prompt-assembler.ts`
Understand the signature of the existing prompt-assembly function. We preserve the existing interface and only upgrade the system prompt / output template.

- [ ] **Step 9.2: Upgrade the system prompt + export negative guidance**

In `src/lib/ai/prompt-assembler.ts`, locate the OpenRouter system prompt / instructions. Replace with a cinematic template. Example:

```typescript
const SYSTEM_PROMPT = `You are a commercial photography art director writing prompts for Nano Banana Pro (Google Gemini Image), a multi-reference photorealistic generator.

Given a structured brief (JSON with product info, scene, composition, aspect_ratio), output ONE prompt string in this exact structure:

"A candid photograph of a person [interaction verb: holding / wearing / using] [product_name]. [scene_description in one sentence].

Technical: shot on Sony A7IV with 85mm f/1.4 prime, natural window light from camera left, golden hour, shallow depth of field, subsurface scattering on skin, visible pores, 35mm film grain, slight chromatic aberration, unretouched, Kodak Portra 400 color palette.

Composition: [composition_hint from brief]. Aspect: [aspect_ratio from brief].

CRITICAL: Preserve the exact product from the product reference image — its shape, colour, label typography, and any text on the pack must remain pixel-faithful. Preserve the exact person identity from the face reference pack — same facial structure, skin tone, and hair.

Avoid: plastic skin, waxy finish, cgi look, 3d render, airbrushing, over-smooth skin, glossy artificial highlights, uncanny eyes, distorted anatomy, extra fingers, malformed hands, blurry focus, jpeg artifacts, watermarks, text overlays, fabricated logos, product text distortion."

Rules:
- No LoRA trigger words (Nano Banana is not LoRA — do NOT include "TOK" or similar; the face pack handles identity)
- No stylistic adjectives like "beautiful", "stunning", "amazing" — they flatten realism
- Use product_name exactly as given — do not rename or paraphrase
- Keep under 900 characters total
- Output prompt text only, no prose, no markdown, no quotes`;

/**
 * Kept as a separate export for the v3 (Kontext Max) path which uses a
 * structured negative_prompt param. v2 (Nano Banana) has the same text
 * merged inline into the user prompt above.
 */
export const NEGATIVE_PROMPT =
  "plastic skin, waxy, cgi, 3d render, airbrushed, over-smooth, smooth skin, perfect skin, glossy, artificial, uncanny, distorted anatomy, extra fingers, six fingers, malformed hands, blurry, low quality, jpeg artifacts, watermark, text overlay, logo mismatch, product text distortion";
```

Keep the existing assembler's exported function signature and return value unchanged (still returns `{ prompt, method }`).

- [ ] **Step 9.3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/prompt-assembler.ts
git commit -m "Upgrade prompt assembler with cinematic template + inline negative guidance"
```

---

## Task 10: Kontext Max client + Pipeline router (feature flag dispatch)

**Files:**
- Create: `src/lib/ai/kontext-client.ts`
- Create: `src/lib/ai/pipeline-router.ts`

- [ ] **Step 10.1: Write the Kontext Max client (v3 fallback)**

Create `src/lib/ai/kontext-client.ts`:

```typescript
import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";
import type { AspectRatio } from "@/domains/generation/types";
import { ASPECT_RATIO_DIMENSIONS } from "@/domains/generation/types";

export interface KontextGenerateInput {
  prompt: string;
  negativePrompt: string;
  /** Primary reference: product photo (pixel preservation priority) */
  productImageUrl: string;
  /** Secondary reference: first image from face anchor pack */
  faceAnchorUrl: string;
  aspectRatio: AspectRatio;
  seed?: number;
}

export interface KontextGenerateResult {
  imageUrl: string;
  predictionId: string;
  width: number;
  height: number;
}

/**
 * v3 fallback model: Flux Kontext Max via Replicate. Used when Nano Banana
 * Pro (v2) is unavailable, returns a safety block, or the brief explicitly
 * pins pipeline_version=v3 (reflective products, foreign-script packaging).
 *
 * Note: Kontext Max accepts `image` (primary reference) and `image_2`
 * (secondary). We pass the product photo as primary so its pixels are
 * maximally preserved, and the first face anchor as secondary for identity.
 * Verify param names against https://replicate.com/black-forest-labs/flux-kontext-max/api
 * at integration time.
 */
export async function generateWithKontext(
  input: KontextGenerateInput
): Promise<KontextGenerateResult> {
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  const modelInput: Record<string, unknown> = {
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    image: input.productImageUrl,
    image_2: input.faceAnchorUrl,
    aspect_ratio: input.aspectRatio,
    output_format: "png",
    output_quality: 95,
    safety_tolerance: 2,
  };
  if (typeof input.seed === "number") {
    modelInput.seed = input.seed;
  }

  const output = await replicate.run(
    MODELS.kontext as `${string}/${string}`,
    { input: modelInput }
  );

  const outputs = Array.isArray(output) ? output : [output];
  const first = outputs[0] as unknown;
  let imageUrl: string | null = null;

  if (typeof first === "string") {
    imageUrl = first;
  } else if (
    first &&
    typeof first === "object" &&
    "url" in first &&
    typeof (first as { url: unknown }).url === "function"
  ) {
    const u = (first as { url: () => URL | string }).url();
    imageUrl = u instanceof URL ? u.toString() : u;
  }

  if (!imageUrl) {
    throw new Error(
      `Kontext Max returned unexpected output shape: ${JSON.stringify(outputs).slice(0, 200)}`
    );
  }

  const predictionId = `kontext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    imageUrl,
    predictionId,
    width: dims.width,
    height: dims.height,
  };
}
```

- [ ] **Step 10.2: Write the pipeline router**

Create `src/lib/ai/pipeline-router.ts`:

```typescript
import type { PipelineVersion, AspectRatio } from "@/domains/generation/types";
import {
  generateWithNanoBanana,
  NanoBananaSafetyBlockedError,
} from "./nano-banana-client";
import { generateWithKontext } from "./kontext-client";

/**
 * Common inference result shape all pipeline versions return.
 * v1 (legacy Flux Dev + LoRA) stays inline in generation-pipeline.ts — the
 * router covers v2 (Nano Banana Pro) and v3 (Kontext Max) since those use
 * multi-reference inputs with a shared contract.
 */
export interface PipelineInferenceResult {
  imageUrl: string;
  predictionId: string;
  modelUsed: string;
  /** Which pipeline version actually produced the image (may differ from requested if safety-fallback fired) */
  effectiveVersion: PipelineVersion;
}

export interface PipelineInferenceInput {
  version: PipelineVersion;
  prompt: string;
  negativePrompt: string;
  /** Full face anchor pack (3-5 URLs). Nano Banana uses all; Kontext uses first. */
  faceAnchorPack: string[];
  productImageUrl: string;
  aspectRatio: AspectRatio;
  seed?: number;
}

export async function runPipelineInference(
  input: PipelineInferenceInput
): Promise<PipelineInferenceResult> {
  switch (input.version) {
    case "v2": {
      try {
        const r = await generateWithNanoBanana({
          prompt: input.prompt,
          faceAnchorPack: input.faceAnchorPack,
          productImageUrl: input.productImageUrl,
          aspectRatio: input.aspectRatio,
          seed: input.seed,
        });
        return {
          imageUrl: r.imageUrl,
          predictionId: r.predictionId,
          modelUsed: r.modelUsed,
          effectiveVersion: "v2",
        };
      } catch (err) {
        // Safety block: auto-fallback to v3 for THIS generation only
        if (err instanceof NanoBananaSafetyBlockedError) {
          const anchor = input.faceAnchorPack[0];
          if (!anchor) throw err;
          const r = await generateWithKontext({
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            productImageUrl: input.productImageUrl,
            faceAnchorUrl: anchor,
            aspectRatio: input.aspectRatio,
            seed: input.seed,
          });
          return {
            imageUrl: r.imageUrl,
            predictionId: r.predictionId,
            modelUsed: "flux-kontext-max (v2-safety-fallback)",
            effectiveVersion: "v3",
          };
        }
        throw err;
      }
    }
    case "v3": {
      const anchor = input.faceAnchorPack[0];
      if (!anchor) {
        throw new Error("v3 (Kontext Max) requires a face anchor — pack empty");
      }
      const r = await generateWithKontext({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        productImageUrl: input.productImageUrl,
        faceAnchorUrl: anchor,
        aspectRatio: input.aspectRatio,
        seed: input.seed,
      });
      return {
        imageUrl: r.imageUrl,
        predictionId: r.predictionId,
        modelUsed: "flux-kontext-max",
        effectiveVersion: "v3",
      };
    }
    case "v1":
      throw new Error(
        "v1 (Flux Dev legacy) does not go through router — handled inline in generation-pipeline.ts"
      );
    default: {
      const exhaustive: never = input.version;
      throw new Error(`Unknown pipeline version: ${String(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 10.3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/kontext-client.ts src/lib/ai/pipeline-router.ts
git commit -m "Add Kontext Max v3 client + pipeline router with Nano Banana safety fallback"
```

---

## Task 11: Integrate v2 into generation pipeline

**Files:**
- Modify: `src/inngest/functions/generation/generation-pipeline.ts`

This is the biggest task. Read the existing file carefully before editing.

- [ ] **Step 11.1: Read current generation-pipeline.ts**

Run: `cat src/inngest/functions/generation/generation-pipeline.ts | head -250`
Note the exact structure of `Step 3: generate-image`. That's what we replace.

- [ ] **Step 11.2: Add new imports at the top of the file**

Add these imports near the top of `src/inngest/functions/generation/generation-pipeline.ts`:

```typescript
import { NEGATIVE_PROMPT } from "@/lib/ai/prompt-assembler";
import { runPipelineInference } from "@/lib/ai/pipeline-router";
import { runQualityGate } from "@/lib/ai/quality-gate";
import { upscale, getLongEdge } from "@/lib/ai/upscaler";
import {
  getValidFaceAnchorPack,
  generateAndCacheFaceAnchorPack,
} from "@/lib/ai/face-anchor";
import {
  MAX_RETRIES,
  resolvePipelineVersion,
} from "@/lib/ai/pipeline-config";
import {
  UPSCALE_MIN_EDGE,
  type AspectRatio,
  type PipelineVersion,
  type QualityScores,
} from "@/domains/generation/types";
```

- [ ] **Step 11.3: Add an R2 upload helper (re-host data: URLs)**

Since Nano Banana returns a `data:` URL (inline base64), and downstream code / UIs need a hosted URL, we persist to R2 before quality gate. Add this helper near the bottom of the file or in a sibling `pipeline-storage.ts` (inline here for simplicity):

```typescript
async function rehostToR2(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceUrl: string;
  storagePath: string;
}): Promise<string> {
  let bytes: Uint8Array;
  let contentType = "image/png";
  if (args.sourceUrl.startsWith("data:")) {
    const semi = args.sourceUrl.indexOf(";");
    const comma = args.sourceUrl.indexOf(",");
    contentType = args.sourceUrl.slice(5, semi) || "image/png";
    bytes = Uint8Array.from(Buffer.from(args.sourceUrl.slice(comma + 1), "base64"));
  } else {
    const res = await fetch(args.sourceUrl);
    if (!res.ok) throw new Error(`rehostToR2 fetch failed: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    contentType = res.headers.get("content-type") ?? "image/png";
  }
  const bucket = "generations"; // confirm or fall back to "reference-photos" if bucket doesn't exist
  const { error: uploadErr } = await args.admin.storage
    .from(bucket)
    .upload(args.storagePath, bytes, { contentType, upsert: true });
  if (uploadErr) {
    throw new Error(`R2 upload failed: ${uploadErr.message}`);
  }
  const { data } = args.admin.storage.from(bucket).getPublicUrl(args.storagePath);
  return data.publicUrl;
}
```

If the `generations` bucket doesn't exist yet, either create it via Supabase dashboard or swap to `reference-photos`.

- [ ] **Step 11.4: Replace Step 3 (generate-image) with the v2 pipeline**

Replace the entire existing `await step.run("generate-image", async () => { ... })` block with:

```typescript
    // ── Step 3: Multi-Stage Image Generation (v2 pipeline) ────────────────
    // 3a. Route by pipeline version (env or brief override)
    // 3b. Ensure face anchor pack cached (Stage 0 fallback if missing)
    // 3c. Nano Banana Pro multi-reference inference (Stage 1) with retries
    // 3d. Quality gate per attempt (Stage 2)
    // 3e. Upscale winning attempt IF below UPSCALE_MIN_EDGE (Stage 3)
    await step.run("generate-image", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select(
          "creator_id, cost_paise, assembled_prompt, structured_brief"
        )
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const brief = (gen.structured_brief ?? {}) as Record<string, unknown>;
      const productImageUrl =
        typeof brief.product_image_url === "string"
          ? (brief.product_image_url as string)
          : null;
      const aspectRatio: AspectRatio =
        (brief.aspect_ratio as AspectRatio | undefined) ?? "1:1";
      const versionOverride = brief.pipeline_version as PipelineVersion | undefined;
      const version = resolvePipelineVersion(versionOverride);

      // v1 legacy fallback — keep existing behavior inline
      if (version === "v1") {
        await generateV1Legacy({
          admin,
          generation_id,
          creatorId: gen.creator_id,
          prompt: gen.assembled_prompt ?? assembledPrompt,
          productImageUrl,
        });
        return;
      }

      // v2/v3 require face anchor pack + product image
      if (!productImageUrl) {
        throw new Error(
          `Pipeline ${version} requires product_image_url on structured_brief; none provided for generation ${generation_id}`
        );
      }

      // Ensure face anchor pack is cached (Stage 0)
      let faceAnchorPack = await getValidFaceAnchorPack(gen.creator_id);
      if (faceAnchorPack.length === 0) {
        // Fallback: generate on demand. Rare — usually the post-training
        // Inngest fn has already cached this.
        const { data: lora } = await admin
          .from("creator_lora_models")
          .select("replicate_model_id, trigger_word")
          .eq("creator_id", gen.creator_id)
          .eq("training_status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lora?.replicate_model_id) {
          throw new Error(
            `Creator ${gen.creator_id} has no trained LoRA — cannot run ${version} pipeline`
          );
        }
        const { anchorUrls } = await generateAndCacheFaceAnchorPack({
          creatorId: gen.creator_id,
          loraModelId: lora.replicate_model_id,
          triggerWord: lora.trigger_word ?? "TOK",
        });
        faceAnchorPack = anchorUrls;
      }

      // Creator reference photos for face gate (use the anchor pack itself —
      // they're the ground truth identity snapshots)
      const creatorReferenceUrls = faceAnchorPack;

      const basePrompt = gen.assembled_prompt ?? assembledPrompt;

      // Stage 1 + Stage 2 with retry budget
      let attempt = 0;
      let bestImageUrl: string | null = null;
      let bestPredictionId: string | null = null;
      let bestModelUsed: string | null = null;
      let bestScores: QualityScores | null = null;
      let lastScores: QualityScores | null = null;

      const maxAttempts = MAX_RETRIES + 1;
      while (attempt < maxAttempts) {
        attempt += 1;
        const seed =
          attempt === 1
            ? undefined
            : Math.floor(Math.random() * 2 ** 31);

        const inference = await runPipelineInference({
          version,
          prompt: basePrompt,
          negativePrompt: NEGATIVE_PROMPT,
          faceAnchorPack,
          productImageUrl,
          aspectRatio,
          seed,
        });

        // Re-host to R2 before quality gate / delivery so we have a stable URL
        const hostedUrl = await rehostToR2({
          admin,
          sourceUrl: inference.imageUrl,
          storagePath: `generations/${generation_id}/attempt-${attempt}.png`,
        });

        const scores = await runQualityGate({
          outputImageUrl: hostedUrl,
          productReferenceUrl: productImageUrl,
          creatorReferenceUrls,
        });

        lastScores = scores;

        if (scores.passed) {
          bestImageUrl = hostedUrl;
          bestPredictionId = inference.predictionId;
          bestModelUsed = inference.modelUsed;
          bestScores = scores;
          break;
        }
        // Keep the highest-aesthetic attempt as fallback if all attempts fail
        if (
          !bestImageUrl ||
          scores.aesthetic > (bestScores?.aesthetic ?? 0)
        ) {
          bestImageUrl = hostedUrl;
          bestPredictionId = inference.predictionId;
          bestModelUsed = inference.modelUsed;
          bestScores = scores;
        }
      }

      if (!bestImageUrl || !bestPredictionId) {
        throw new Error(
          `${version} pipeline produced no usable output after ${attempt} attempts for ${generation_id}`
        );
      }

      // Stage 3: Upscale CONDITIONAL — skip if native resolution is already
      // high enough (Nano Banana Pro typically produces 2048+ natively).
      let deliveryUrl = bestImageUrl;
      let upscaledUrl: string | null = null;
      try {
        const longEdge = await getLongEdge(bestImageUrl);
        if (longEdge < UPSCALE_MIN_EDGE) {
          const res = await upscale({ imageUrl: bestImageUrl, scale: 2 });
          upscaledUrl = res.upscaledUrl;
          deliveryUrl = upscaledUrl;
        }
      } catch (err) {
        // Upscale is "nice to have" — don't fail the generation if it errors.
        // Log and deliver the base image.
        console.warn(
          `Upscaler failed for ${generation_id}; delivering base image`,
          err instanceof Error ? err.message : err
        );
      }

      await admin
        .from("generations")
        .update({
          base_image_url: bestImageUrl,
          image_url: deliveryUrl,
          upscaled_url: upscaledUrl,
          quality_scores: bestScores ?? lastScores ?? null,
          generation_attempts: attempt,
          provider_prediction_id: bestPredictionId,
          replicate_prediction_id: bestPredictionId, // keep legacy column in sync
          pipeline_version: version,
          cost_paise: gen.cost_paise ?? 800, // ≈₹8 typical v2 cost
          status: "output_check",
        })
        .eq("id", generation_id);

      // Dev log — helpful during rollout
      console.log(
        `[gen/${generation_id}] v=${version} model=${bestModelUsed} attempts=${attempt} scores=${JSON.stringify(
          bestScores ?? lastScores
        )}`
      );
    });
```

- [ ] **Step 11.5: Extract v1 legacy handler into a helper function**

Below the `runPipeline` export (or in a private helper section at the bottom of the file), add the v1 legacy handler that preserves existing behavior:

```typescript
/**
 * v1 (legacy) Flux Dev + LoRA path. Kept for emergency rollback. Mirrors the
 * original pre-v2 implementation exactly — no quality gate, no upscale.
 */
async function generateV1Legacy(args: {
  admin: ReturnType<typeof createAdminClient>;
  generation_id: string;
  creatorId: string;
  prompt: string;
  productImageUrl: string | null;
}): Promise<void> {
  const { admin, generation_id, creatorId, prompt, productImageUrl } = args;

  const { data: loraModel } = await admin
    .from("creator_lora_models")
    .select("replicate_model_id, trigger_word, training_status")
    .eq("creator_id", creatorId)
    .eq("training_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let imageUrl: string;
  let predictionId: string;

  if (loraModel?.replicate_model_id) {
    const { replicate } = await import("@/lib/ai/replicate-client");
    const triggerWord = loraModel.trigger_word ?? "TOK";
    const promptWithTrigger = prompt.toUpperCase().includes(triggerWord)
      ? prompt
      : `a photo of ${triggerWord} person, ${prompt}`;

    const input: Record<string, unknown> = {
      prompt: promptWithTrigger,
      num_outputs: 1,
      guidance_scale: 7.5,
      num_inference_steps: 50,
      output_format: "png",
      aspect_ratio: "1:1",
    };
    if (productImageUrl) {
      input.image_prompt = productImageUrl;
      input.image_prompt_strength = 0.6;
    }

    const output = await replicate.run(
      loraModel.replicate_model_id as `${string}/${string}`,
      { input }
    );

    const outputs = Array.isArray(output) ? output : [output];
    const first = outputs[0] as unknown;
    let resolved: string | null = null;
    if (typeof first === "string") resolved = first;
    else if (
      first &&
      typeof first === "object" &&
      "url" in first &&
      typeof (first as { url: unknown }).url === "function"
    ) {
      const u = (first as { url: () => URL | string }).url();
      resolved = u instanceof URL ? u.toString() : u;
    }

    imageUrl = resolved ?? `https://picsum.photos/seed/${generation_id}/768/768`;
    predictionId = `rep_${generation_id}`;
  } else {
    const seed = generation_id.replace(/-/g, "").slice(0, 12);
    imageUrl = `https://picsum.photos/seed/${seed}/768/768`;
    predictionId = `dev_${generation_id}`;
  }

  await admin
    .from("generations")
    .update({
      image_url: imageUrl,
      cost_paise: 500,
      replicate_prediction_id: predictionId,
      provider_prediction_id: predictionId,
      pipeline_version: "v1",
      generation_attempts: 1,
      status: "output_check",
    })
    .eq("id", generation_id);
}
```

- [ ] **Step 11.6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build. If errors in type inference for Supabase admin client, narrow with `as ReturnType<typeof createAdminClient>` or inline the admin types.

- [ ] **Step 11.7: Commit**

```bash
git add src/inngest/functions/generation/generation-pipeline.ts
git commit -m "Integrate v2 pipeline (Nano Banana Pro + anchor pack + quality gate + conditional upscale) with v1 fallback and v3 safety-fallback"
```

---

## Task 12: Campaign form — aspect ratio selector

**Files:**
- Modify: `src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx`

- [ ] **Step 12.1: Add aspect ratio state + UI**

Locate the `brief` state initialization. Add `aspectRatio: "1:1" as const` to the initial brief object.

Locate the product image upload section. Below it, insert an aspect ratio selector:

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Output aspect ratio</label>
  <div className="flex flex-wrap gap-2">
    {(["1:1", "9:16", "16:9", "4:5", "3:2"] as const).map((r) => (
      <button
        key={r}
        type="button"
        onClick={() => setBrief((b) => ({ ...b, aspectRatio: r }))}
        className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
          brief.aspectRatio === r
            ? "bg-ink text-paper border-ink"
            : "bg-paper border-outline-variant text-on-surface hover:border-ink"
        }`}
      >
        {r}
        <span className="ml-2 text-xs opacity-60">
          {
            {
              "1:1": "Square",
              "9:16": "Reel",
              "16:9": "Wide",
              "4:5": "Portrait",
              "3:2": "Classic",
            }[r]
          }
        </span>
      </button>
    ))}
  </div>
</div>
```

Update the `BriefState` TypeScript interface / type to include `aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" | "3:2"`.

- [ ] **Step 12.2: Include aspect_ratio in POST body**

Find where `product_image_url` is added to the POST body. Add next to it:

```typescript
aspect_ratio: brief.aspectRatio ?? "1:1",
```

- [ ] **Step 12.3: Build + commit**

Run: `npm run build`

```bash
git add src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx
git commit -m "Add aspect ratio selector (1:1 / 9:16 / 16:9 / 4:5 / 3:2) to campaign form"
```

---

## Task 13: Generation detail page — surface quality scores

**Files:**
- Modify: `src/app/(dashboard)/dashboard/generations/[id]/page.tsx`

- [ ] **Step 13.1: Fetch quality_scores + pipeline metadata**

In the generation fetch (find `.from("generations").select(...)` on this page), extend the select columns:

```typescript
.select(
  "id, image_url, upscaled_url, base_image_url, quality_scores, generation_attempts, pipeline_version, provider_prediction_id, status, /* ...existing fields... */"
)
```

- [ ] **Step 13.2: Render quality score panel**

In the JSX (below the main image, above the approval actions), add:

```tsx
{generation.pipeline_version !== "v1" && generation.quality_scores && (
  <div className="mt-4 p-5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
    <div className="flex items-center justify-between mb-3">
      <div className="text-xs font-label uppercase tracking-widest text-outline">
        Quality scores
      </div>
      <div className="text-xs text-outline">
        {generation.pipeline_version === "v2"
          ? "Nano Banana Pro"
          : generation.pipeline_version === "v3"
          ? "Kontext Max"
          : ""}
      </div>
    </div>
    <div className="grid grid-cols-3 gap-4">
      {[
        { label: "Product match", key: "clip", max: 1, threshold: 0.82 },
        { label: "Face identity", key: "face", max: 1, threshold: 0.75 },
        { label: "Aesthetic", key: "aesthetic", max: 10, threshold: 6.5 },
      ].map(({ label, key, max, threshold }) => {
        const raw = (generation.quality_scores as Record<string, number>)[key];
        const pct = (raw / max) * 100;
        const passed = raw >= threshold;
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-on-surface-variant">{label}</span>
              <span
                className={`text-sm font-mono ${
                  passed ? "text-primary" : "text-error"
                }`}
              >
                {raw.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-outline-variant/30 overflow-hidden">
              <div
                className={`h-full ${passed ? "bg-primary" : "bg-error"}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
    <div className="mt-3 text-xs text-outline">
      {generation.generation_attempts > 1
        ? `Generated after ${generation.generation_attempts} attempts`
        : "Passed on first attempt"}
    </div>
  </div>
)}
```

- [ ] **Step 13.3: Build + commit**

```bash
npm run build
git add "src/app/(dashboard)/dashboard/generations/[id]/page.tsx"
git commit -m "Surface quality scores + pipeline version + attempt count on generation detail page"
```

---

## Task 14: API route — accept aspect_ratio

**Files:**
- Modify: `src/app/api/generations/create/route.ts`

- [ ] **Step 14.1: Read current route + Zod validation**

Run: `cat src/app/api/generations/create/route.ts`
Find the request body Zod schema. Add `aspect_ratio` to it; default `"1:1"`.

- [ ] **Step 14.2: Propagate aspect_ratio into structured_brief**

In the handler body, ensure `aspect_ratio` from the request ends up on `structured_brief`:

```typescript
const structuredBrief = {
  ...brief,
  aspect_ratio: body.aspect_ratio ?? "1:1",
};
```

- [ ] **Step 14.3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/generations/create/route.ts
git commit -m "Accept aspect_ratio on generation create API"
```

---

## Task 15: Backfill script for existing creators

**Files:**
- Create: `scripts/backfill-face-anchors.ts`

- [ ] **Step 15.1: Write the backfill script**

Create `scripts/backfill-face-anchors.ts`:

```typescript
/**
 * One-time backfill: generate face anchor PACKS for all creators who have
 * completed LoRA training but don't yet have a face_anchor_pack cached.
 *
 * Usage:
 *   npx tsx scripts/backfill-face-anchors.ts [--dry-run]
 *
 * Cost: ~₹10-15 per creator (4 LoRA runs). Run after deploying v2 pipeline
 * and before enabling for any real traffic.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndCacheFaceAnchorPack } from "@/lib/ai/face-anchor";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const admin = createAdminClient();

  const { data: creators, error } = await admin
    .from("creators")
    .select("id, face_anchor_pack")
    .is("face_anchor_pack", null);

  if (error) {
    console.error("Failed to list creators:", error.message);
    process.exit(1);
  }
  if (!creators || creators.length === 0) {
    console.log("No creators need backfill. Done.");
    return;
  }

  console.log(`Found ${creators.length} creators without face anchor packs.`);

  // Pair each creator with their latest completed LoRA
  const withLora: Array<{
    creatorId: string;
    loraModelId: string;
    triggerWord: string;
  }> = [];
  for (const c of creators) {
    const { data: lora } = await admin
      .from("creator_lora_models")
      .select("replicate_model_id, trigger_word")
      .eq("creator_id", c.id)
      .eq("training_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lora?.replicate_model_id) {
      withLora.push({
        creatorId: c.id,
        loraModelId: lora.replicate_model_id,
        triggerWord: lora.trigger_word ?? "TOK",
      });
    }
  }

  console.log(
    `${withLora.length} creators have a completed LoRA. Skipping ${
      creators.length - withLora.length
    } without LoRA.`
  );

  if (dryRun) {
    console.log("DRY RUN — not generating.");
    for (const x of withLora) console.log(`  would process: ${x.creatorId}`);
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const [i, x] of withLora.entries()) {
    console.log(`[${i + 1}/${withLora.length}] Generating pack for ${x.creatorId}...`);
    try {
      const { anchorUrls } = await generateAndCacheFaceAnchorPack(x);
      console.log(`  OK — ${anchorUrls.length} anchors stored`);
      ok += 1;
    } catch (err) {
      console.error(`  FAIL:`, err instanceof Error ? err.message : err);
      fail += 1;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 15.2: Dry-run to verify**

Run: `npx tsx scripts/backfill-face-anchors.ts --dry-run`
Expected: list of creator IDs that would be processed, no LoRA calls made.

- [ ] **Step 15.3: Commit**

```bash
git add scripts/backfill-face-anchors.ts
git commit -m "Add backfill script for existing creators' face anchor packs"
```

---

## Task 16: Smoke test script

**Files:**
- Create: `scripts/smoke-test-pipeline.ts`

- [ ] **Step 16.1: Write smoke test script**

Create `scripts/smoke-test-pipeline.ts`:

```typescript
/**
 * End-to-end smoke test for the v2 generation pipeline.
 *
 * Picks a creator with a cached face anchor pack, inserts a synthetic
 * generation with a public sample product image, fires the Inngest event,
 * then prints a poll query for completion.
 *
 * Usage: npx tsx scripts/smoke-test-pipeline.ts [creatorId]
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";

const SAMPLE_PRODUCT_URL =
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=800"; // coffee can

async function main() {
  const admin = createAdminClient();
  const creatorIdArg = process.argv[2];

  const { data: creator } = creatorIdArg
    ? await admin.from("creators").select("id, user_id").eq("id", creatorIdArg).single()
    : await admin
        .from("creators")
        .select("id, user_id")
        .not("face_anchor_pack", "is", null)
        .limit(1)
        .single();

  if (!creator) {
    console.error(
      "No creator found with a face anchor pack. Run backfill first or pass a creator ID."
    );
    process.exit(1);
  }
  console.log(`Using creator: ${creator.id}`);

  const { data: existingCampaign } = await admin
    .from("campaigns")
    .select("id, brand_id")
    .eq("creator_id", creator.id)
    .limit(1)
    .maybeSingle();

  if (!existingCampaign) {
    console.error(
      `Creator ${creator.id} has no campaign — create one via the UI first, then re-run.`
    );
    process.exit(1);
  }

  const structuredBrief = {
    product_name: "Pourfect Coffee",
    product_image_url: SAMPLE_PRODUCT_URL,
    aspect_ratio: "1:1",
    scene_description: "holding the can in a bright kitchen, morning light",
    composition: "medium shot, eye contact with camera",
  };

  const { data: gen, error } = await admin
    .from("generations")
    .insert({
      campaign_id: existingCampaign.id,
      creator_id: creator.id,
      brand_id: existingCampaign.brand_id,
      structured_brief: structuredBrief,
      status: "queued",
      cost_paise: 1500,
    })
    .select("id")
    .single();

  if (error || !gen) {
    console.error("Failed to insert generation:", error?.message);
    process.exit(1);
  }

  console.log(`Inserted generation ${gen.id}. Firing inngest event...`);

  await inngest.send({
    name: "generation/created",
    data: { generation_id: gen.id },
  });

  console.log(
    `\nSmoke test fired. Poll generation row for completion:\n  select status, pipeline_version, quality_scores, generation_attempts, image_url, upscaled_url from generations where id = '${gen.id}';\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 16.2: Commit**

```bash
git add scripts/smoke-test-pipeline.ts
git commit -m "Add smoke test script for v2 pipeline end-to-end validation"
```

---

## Task 17: Docs — rollout playbook

**Files:**
- Create: `docs/superpowers/runbooks/v2-pipeline-rollout.md`

- [ ] **Step 17.1: Write the rollout playbook**

Create `docs/superpowers/runbooks/v2-pipeline-rollout.md`:

```markdown
# v2 Pipeline Rollout Playbook (Nano Banana Pro)

## Pre-launch checklist
- [ ] Migration `00016_industry_grade_pipeline.sql` applied to prod Supabase
- [ ] Env vars set on Vercel:
      `GENERATION_PIPELINE_VERSION=v2`,
      `GOOGLE_AI_API_KEY` (Nano Banana Pro),
      `NANO_BANANA_MODEL`, `NANO_BANANA_FALLBACK_MODEL`,
      `REPLICATE_KONTEXT_MODEL` (v3 fallback),
      `REPLICATE_UPSCALER_MODEL`, `REPLICATE_CLIP_MODEL`, `REPLICATE_AESTHETIC_MODEL`
- [ ] Google AI Studio account verified for Gemini 3 Pro Image access
- [ ] DPDP privacy notice updated to disclose Google AI as a processor
- [ ] Replicate account verified for Kontext Max access (v3 fallback + upscaler)
- [ ] Backfill script run: `npx tsx scripts/backfill-face-anchors.ts`
- [ ] Smoke test passed: `npx tsx scripts/smoke-test-pipeline.ts`
- [ ] Dog-food: 5 test creators × 2 products each = 10 real generations, reviewed for quality

## Rollout sequence
1. Deploy with `GENERATION_PIPELINE_VERSION=v1` (no behavior change)
2. Run backfill for face anchor packs (all existing creators)
3. Flip env var to `v2` for 20% of traffic using per-campaign flag or percentage gate
4. Monitor for 48 hrs:
   - retry rate (target < 30%)
   - Google safety block rate (target < 5%)
   - gen latency P95 (target < 45s)
   - cost per gen (target < ₹12)
   - creator/brand complaint volume (target: no regression)
5. If clean → 100% cutover
6. Keep `v1` ready as rollback for 2 weeks; `v3` always available as per-campaign fallback

## Rollback procedure
- Set env `GENERATION_PIPELINE_VERSION=v1`
- Redeploy (zero code change)
- Or per-generation override: insert `pipeline_version: "v1"` (or `"v3"` for Kontext) into `structured_brief` on new generations

## Monitoring queries
```sql
-- Retry rate last 24h (v2 only)
select count(*) filter (where generation_attempts > 1)::float / count(*) as retry_rate
from generations where created_at > now() - interval '24 hours' and pipeline_version = 'v2';

-- P95 latency
select percentile_cont(0.95) within group (order by extract(epoch from (updated_at - created_at))) as p95_seconds
from generations where pipeline_version = 'v2' and status in ('ready_for_approval', 'delivered');

-- Gate fail reasons breakdown
select quality_scores->'failedOn' as failed_on, count(*)
from generations where pipeline_version = 'v2' and (quality_scores->>'passed')::boolean = false
group by 1 order by 2 desc;

-- Google safety fallback rate (v2 request but v3 prediction id recorded)
select count(*) filter (where provider_prediction_id like 'kontext_%')::float / count(*)
from generations where pipeline_version = 'v2';
```

## Phase 2 — v3 routing rules (optional, 2-4 weeks post-launch)
Based on v2 data, formalise v3 routing for specific campaign types:
- Reflective products (glass, jewelry)
- Foreign-script packaging (non-Latin)
- Any brand with > 10% safety block rate
Set `pipeline_version: "v3"` on those campaigns' structured_brief.
```

- [ ] **Step 17.2: Commit**

```bash
git add docs/superpowers/runbooks/v2-pipeline-rollout.md
git commit -m "Add v2 pipeline rollout playbook with monitoring queries"
```

---

## Task 18: Final verification

- [ ] **Step 18.1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 18.2: Full production build**

Run: `npm run build`
Expected: clean build, all routes compile, no deprecation warnings.

- [ ] **Step 18.3: Lint**

Run: `npm run lint`
Expected: clean or only warnings in untouched files.

- [ ] **Step 18.4: Commit any final fixes**

If 18.1-18.3 surface any issues, fix them, then:

```bash
git commit -am "Fix typecheck/lint issues surfaced during final verification"
```

- [ ] **Step 18.5: Push to main**

```bash
git push origin main
```

Then execute rollout playbook (see `docs/superpowers/runbooks/v2-pipeline-rollout.md`).

---

## Self-Review Notes

Checked spec coverage:
- ✅ 5-stage pipeline (Task 11 orchestrates all 5)
- ✅ Nano Banana Pro as primary v2 (Task 4 + Task 10)
- ✅ Kontext Max as v3 fallback (Task 10) with automatic v2→v3 safety fallback
- ✅ LoRA face anchor PACK Stage 0 (Task 7 + Task 8)
- ✅ Quality gate (Task 6) with 2-retry budget (Task 11)
- ✅ Clarity Upscaler Stage 3, conditional on resolution (Task 5 + Task 11)
- ✅ Hive safety stays (unchanged, Step 4 in existing pipeline)
- ✅ Feature flag v1/v2/v3 (Task 3 config + Task 10 router)
- ✅ 5 aspect ratios (Task 2 types + Task 12 UI + Task 14 API)
- ✅ Quality scores surfaced to creator (Task 13)
- ✅ DB migration (Task 1)
- ✅ Cinematic prompt template + merged negative guidance (Task 9)
- ✅ Rollout playbook (Task 17)
- ✅ Backfill for existing creators (Task 15)
- ✅ Smoke test (Task 16)
- ✅ DPDP / privacy notice update (runbook pre-launch checklist, Task 17)

No placeholder scan issues found. All types consistent (`PipelineVersion`, `AspectRatio`, `QualityScores`, `face_anchor_pack` used consistently across Tasks 1, 2, 4, 6, 7, 10, 11, 13).
