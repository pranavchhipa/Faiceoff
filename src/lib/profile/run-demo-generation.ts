// ─────────────────────────────────────────────────────────────────────────────
// Demo generation runner — produces a category showcase image for a creator's
// public profile.
//
// Differences from the brand-collab pipeline (run-generation.ts):
//   - No product image (no brand goods involved)
//   - No billing (free or 1 credit via the calling route, not here)
//   - No approval flow (image goes straight to creator's public profile)
//   - Hand-written category prompts (never user-supplied)
//
// Reuses:
//   - Same Gemini 3 Pro Image model + face anchor approach
//   - Same R2 bucket / signing
//   - Same Hive safety check on output
//   - Same face_ref loading from creator_reference_photos
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenAI, Modality } from "@google/genai";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import { checkImage } from "@/lib/ai/hive-client";
import {
  buildDemoPrompt,
  type DemoCategoryKey,
} from "@/lib/profile/demo-prompts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_FACE_REFS = 3;
const REFERENCE_PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 600;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

/* ───────── Gemini model ───────── */

function getGeminiModel(): string {
  return (
    process.env.NANO_BANANA_MODEL ??
    process.env.GEMINI_MODEL ??
    "gemini-3-pro-image-preview"
  );
}

let _genai: GoogleGenAI | null = null;
function getGenai(): GoogleGenAI {
  if (_genai) return _genai;
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY / GOOGLE_AI_API_KEY not set");
  }
  _genai = new GoogleGenAI({ apiKey });
  return _genai;
}

/* ───────── Helpers ───────── */

async function loadFaceRefs(
  admin: Admin,
  creatorId: string,
): Promise<Array<{ mimeType: string; bytes: Uint8Array }>> {
  const { data: photos, error } = await admin
    .from("creator_reference_photos")
    .select("storage_path, is_primary, uploaded_at")
    .eq("creator_id", creatorId)
    .order("is_primary", { ascending: false })
    .order("uploaded_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load reference photos: ${error.message}`);
  }
  if (!photos || photos.length === 0) {
    throw new Error("Creator has no reference photos — onboarding incomplete");
  }

  const paths = photos
    .slice(0, MAX_FACE_REFS)
    .map((p: { storage_path: string }) => p.storage_path);

  const refs: Array<{ mimeType: string; bytes: Uint8Array }> = [];
  for (const path of paths) {
    const { data, error: signErr } = await admin.storage
      .from(REFERENCE_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !data?.signedUrl) {
      throw new Error(`Failed to sign face ref ${path}: ${signErr?.message ?? "no URL"}`);
    }
    const res = await fetch(data.signedUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch face ref bytes (${res.status})`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    refs.push({ mimeType, bytes: buf });
  }
  return refs;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/* ───────── Gemini call (product-less variant) ───────── */

async function callGeminiForDemo(
  faceRefs: Array<{ mimeType: string; bytes: Uint8Array }>,
  finalPrompt: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: finalPrompt }];

  for (const ref of faceRefs) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: bytesToBase64(ref.bytes),
      },
    });
  }

  const genai = getGenai();
  const modelName = getGeminiModel();

  let response;
  try {
    response = await genai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini call failed (model=${modelName}): ${msg.slice(0, 500)}`);
  }

  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      const inline = (part as { inlineData?: { mimeType?: string; data?: string } })
        .inlineData;
      if (inline?.data && inline.mimeType?.startsWith("image/")) {
        return {
          bytes: new Uint8Array(Buffer.from(inline.data, "base64")),
          mimeType: inline.mimeType,
        };
      }
    }
  }

  // No image — surface any text Gemini returned as the error
  const textParts: string[] = [];
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      const t = (part as { text?: string }).text;
      if (t) textParts.push(t);
    }
  }
  throw new Error(
    `Gemini returned no image. ${textParts.join(" ").slice(0, 200) || "Empty response."}`,
  );
}

/* ───────── Public entrypoint ───────── */

export interface RunDemoGenerationParams {
  demoSampleId: string;
  creatorId: string;
  category: DemoCategoryKey;
  /** Variant index 0-2 for prompt rotation across regenerations */
  variantIndex?: number;
}

/**
 * Drive one demo generation through Gemini → R2 → Hive → DB.
 *
 * Never throws — all failures are persisted to the demo sample row with
 * status='failed' + error_message. UI shows a "Try again" button.
 */
export async function runDemoGeneration(
  admin: Admin,
  params: RunDemoGenerationParams,
): Promise<void> {
  const { demoSampleId, creatorId, category, variantIndex = 0 } = params;

  const fail = async (msg: string) => {
    console.error(`[run-demo-gen] sample=${demoSampleId} FAILED:`, msg);
    await admin
      .from("creator_demo_samples")
      .update({
        status: "failed",
        error_message: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", demoSampleId);
  };

  try {
    // 1. Load face refs
    const faceRefs = await loadFaceRefs(admin, creatorId);

    // 2. Build prompt
    const finalPrompt = buildDemoPrompt(category, variantIndex);

    // 3. Gemini call
    const { bytes: finalBytes, mimeType } = await callGeminiForDemo(faceRefs, finalPrompt);

    // 4. Upload to R2
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const r2Key = `demos/${creatorId}/${category}-${demoSampleId}.${ext}`;
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          Body: Buffer.from(finalBytes),
          ContentType: mimeType,
          // Public demo image — long-cache
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    } catch (r2Err) {
      await fail(
        `R2 upload failed: ${r2Err instanceof Error ? r2Err.message : String(r2Err)}`,
      );
      return;
    }

    const imageUrl = `${R2_PUBLIC_URL}/${r2Key}`;

    // 5. Hive safety check (best-effort — if Hive errors we still serve the
    //    image, but log for ops review)
    try {
      const hiveResult = await checkImage(imageUrl, { generationId: demoSampleId });
      const allClasses = hiveResult.status?.[0]?.response?.output?.[0]?.classes ?? [];
      for (const cls of allClasses) {
        // Reuse the same nsfw class+threshold heuristic from run-generation
        if (
          ["yes_sexual_activity", "yes_sexual_content", "yes_nudity_partial"].includes(
            cls.class,
          ) &&
          cls.score > 0.85
        ) {
          await fail(`Hive flagged demo as unsafe (${cls.class}=${cls.score.toFixed(2)})`);
          return;
        }
      }
    } catch (hiveErr) {
      console.warn(`[run-demo-gen] Hive check skipped:`, hiveErr);
    }

    // 6. Persist
    await admin
      .from("creator_demo_samples")
      .update({
        image_url: imageUrl,
        status: "ready",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", demoSampleId);

    console.log(`[run-demo-gen] sample=${demoSampleId} category=${category} READY`);
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }
}
