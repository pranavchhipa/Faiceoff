/**
 * Generation orchestrator — replaces the dead Inngest pipeline.
 *
 * Called from `after()` in /api/campaigns/create + /api/generations/create.
 * Drives a single generation from 'draft' through to
 * 'ready_for_approval' (success) or 'failed' (refunded / safety / storage).
 *
 * Pipeline:
 *   1. Atomic status transition draft→generating (idempotency guard)
 *   2. Fetch creator face refs (primary + 2 random) from Supabase Storage
 *   3. Fetch product image bytes from brief.product_image_url
 *   4. LLM-assemble creative prompt (OpenRouter)
 *   5. Call Gemini 3.1 Flash Image (with 1 inline retry inside gemini-client)
 *   6. Hive content safety check
 *   7. Upload result to R2
 *   8. Insert approval row (48h expiry) + flip generation to ready_for_approval
 *
 * Failure paths:
 *   - Gemini hard-fails → status='failed', releaseReserve, rollback credit
 *   - Hive flags unsafe → status='failed' (no refund — admin decides)
 *   - R2 / fetch / DB error → status='failed' (manual replay)
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve } from "@/lib/billing";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import { checkImage } from "@/lib/ai/hive-client";
import { assemblePromptWithLLM } from "@/lib/ai/prompt-assembler";
import { generateImage, type ImageInput } from "@/lib/ai/gemini-client";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HIVE_UNSAFE_THRESHOLD = 0.7;
const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;
const HIVE_NSFW_CLASSES = new Set([
  "yes_sexual",
  "yes_male_nudity",
  "yes_female_nudity",
  "yes_graphic_violence",
]);

const REFERENCE_PHOTO_BUCKET = "reference-photos";
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — only need it long enough to fetch
const MAX_FACE_REFS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchImageBytes(
  url: string,
  context: string,
): Promise<ImageInput> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${context} (HTTP ${res.status}): ${url.slice(0, 120)}`,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  const mimeType = ct.startsWith("image/")
    ? ct.split(";")[0].trim()
    : "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`Empty body fetching ${context}`);
  }
  return { bytes, mimeType };
}

/**
 * Pick face refs: primary first, then up to (MAX_FACE_REFS - 1) random others.
 * Returns up to MAX_FACE_REFS storage paths.
 */
async function pickFaceRefStoragePaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creatorId: string,
): Promise<string[]> {
  const { data: photos, error } = await admin
    .from("creator_reference_photos")
    .select("storage_path, is_primary")
    .eq("creator_id", creatorId);

  if (error) {
    throw new Error(
      `Failed to load reference photos for creator ${creatorId}: ${error.message}`,
    );
  }
  if (!photos || photos.length === 0) {
    throw new Error(
      `Creator ${creatorId} has no reference photos — cannot generate`,
    );
  }

  const primary = photos.filter(
    (p: { is_primary: boolean }) => p.is_primary,
  );
  const others = photos.filter(
    (p: { is_primary: boolean }) => !p.is_primary,
  );

  // Shuffle others (Fisher-Yates).
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }

  const ordered = [...primary, ...others].slice(0, MAX_FACE_REFS);
  return ordered.map((p: { storage_path: string }) => p.storage_path);
}

/**
 * Sign a Supabase Storage path so the orchestrator (running on the server)
 * can fetch its bytes via the signed URL.
 */
async function signedUrlFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  storagePath: string,
): Promise<string> {
  const { data, error } = await admin.storage
    .from(REFERENCE_PHOTO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign reference photo ${storagePath}: ${error?.message ?? "no URL"}`,
    );
  }
  return data.signedUrl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rollbackCreditSafe(admin: any, brandId: string, generationId: string) {
  try {
    await admin.rpc("rollback_credit_for_generation", {
      p_brand_id: brandId,
      p_generation_id: generationId,
    });
  } catch (err) {
    console.warn(
      `[run-generation] rollback_credit_for_generation RPC missing — manual reconcile needed for gen=${generationId}`,
      err,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drive one generation through the Gemini pipeline. Idempotent — safe to
 * call twice for the same id (second call sees status != 'draft' and exits).
 *
 * Never throws — all errors are logged + persisted to the generation row.
 * Designed to be called from Next.js `after()`.
 */
export async function runGeneration(generationId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── 1. Atomic status transition: draft → generating ──────────────────────
  // Only one concurrent run can claim the row.
  // NOTE: "processing" is NOT in the DB check constraint — use "generating"
  // which IS an allowed status value.
  const { data: claimed, error: claimError } = await admin
    .from("generations")
    .update({ status: "generating" })
    .eq("id", generationId)
    .eq("status", "draft")
    .select("id, brand_id, creator_id, structured_brief, cost_paise")
    .maybeSingle();

  if (claimError) {
    console.error(
      `[run-generation] claim failed for gen=${generationId}`,
      claimError,
    );
    return;
  }

  if (!claimed) {
    // Either already processed or doesn't exist — exit silently (idempotent).
    return;
  }

  const brandId = claimed.brand_id as string;
  const creatorId = claimed.creator_id as string;
  const costPaise = (claimed.cost_paise as number) ?? 0;
  const brief = claimed.structured_brief as Record<string, unknown>;

  try {
    // ── 2. Pick + fetch face refs ───────────────────────────────────────────
    const facePaths = await pickFaceRefStoragePaths(admin, creatorId);
    const faceRefs: ImageInput[] = [];
    for (const p of facePaths) {
      const url = await signedUrlFor(admin, p);
      faceRefs.push(await fetchImageBytes(url, `face ref ${p}`));
    }

    // ── 3. Fetch product image ──────────────────────────────────────────────
    const productImageUrl = brief.product_image_url as string | undefined;
    if (!productImageUrl) {
      throw new Error("Brief is missing product_image_url");
    }
    const productImage = await fetchImageBytes(
      productImageUrl,
      "product image",
    );

    // ── 4. Assemble creative prompt via LLM ─────────────────────────────────
    let assembledPrompt: string;
    try {
      const { prompt } = await assemblePromptWithLLM(brief);
      assembledPrompt = prompt;
    } catch (err) {
      // Fallback to a templated prompt so generation still proceeds.
      console.warn(
        `[run-generation] prompt assembly failed for gen=${generationId} — using fallback`,
        err,
      );
      const productName = brief.product_name as string | undefined;
      const setting = brief.setting as string | null | undefined;
      const mood = brief.mood_palette as string | null | undefined;
      assembledPrompt = [
        `A photorealistic image of ${productName ?? "the product"}`,
        setting ? `in ${setting}` : null,
        mood ? `mood: ${mood}` : null,
      ]
        .filter(Boolean)
        .join(", ");
    }

    const aspectRatio = (brief.aspect_ratio as string | undefined) ?? "1:1";

    // ── 5. Call Gemini ──────────────────────────────────────────────────────
    let geminiResult: Awaited<ReturnType<typeof generateImage>>;
    try {
      geminiResult = await generateImage({
        faceRefs,
        productImage,
        assembledPrompt,
        aspectRatio,
      });
    } catch (geminiErr) {
      // Hard fail after retry → refund and mark failed.
      const msg =
        geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      const stack =
        geminiErr instanceof Error ? geminiErr.stack?.slice(0, 800) : "";
      console.error(
        `[run-generation] GEMINI_FAIL gen=${generationId} model=${process.env.NANO_BANANA_MODEL ?? process.env.GEMINI_MODEL ?? "default"} faceRefs=${faceRefs.length} promptLen=${assembledPrompt.length} msg="${msg}" stack="${stack}"`,
      );
      Sentry.captureException(geminiErr, {
        tags: { route: "run-generation", phase: "gemini" },
        extra: { generation_id: generationId },
      });
      await admin
        .from("generations")
        .update({
          status: "failed",
          assembled_prompt: assembledPrompt,
        })
        .eq("id", generationId);
      if (costPaise > 0) {
        try {
          await releaseReserve({
            brandId,
            amountPaise: costPaise,
            generationId,
          });
        } catch (refundErr) {
          console.error(
            `[run-generation] releaseReserve failed for gen=${generationId}`,
            refundErr,
          );
        }
      }
      await rollbackCreditSafe(admin, brandId, generationId);
      return;
    }

    // ── 6. Hive content safety check ────────────────────────────────────────
    // Hive needs a URL — upload the bytes to R2 first under a temp key, then
    // check, then promote to permanent key. Simpler approach: skip URL-based
    // Hive and run on a data URL is not supported; instead, upload to R2,
    // check, and on unsafe flag mark failed (image stays in R2).
    const ext = geminiResult.mimeType === "image/jpeg" ? "jpg" : "png";
    const r2Key = `generations/${generationId}/raw.${ext}`;
    let r2Url: string;
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          Body: geminiResult.bytes,
          ContentType: geminiResult.mimeType,
        }),
      );
      const r2PublicBase =
        process.env.R2_PUBLIC_URL ??
        `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;
      r2Url = `${r2PublicBase.replace(/\/$/, "")}/${r2Key}`;
    } catch (r2Err) {
      console.error(
        `[run-generation] R2 upload failed for gen=${generationId}`,
        r2Err,
      );
      Sentry.captureException(r2Err, {
        tags: { route: "run-generation", phase: "r2_upload" },
        extra: { generation_id: generationId },
      });
      await admin
        .from("generations")
        .update({
          status: "failed",
          assembled_prompt: assembledPrompt,
        })
        .eq("id", generationId);
      return;
    }

    // ── 7. Hive check on the public R2 URL ──────────────────────────────────
    let hiveUnsafe = false;
    try {
      const hiveResult = await checkImage(r2Url);
      const allClasses =
        hiveResult.status?.[0]?.response?.output?.[0]?.classes ?? [];
      for (const cls of allClasses) {
        if (
          HIVE_NSFW_CLASSES.has(cls.class) &&
          cls.score > HIVE_UNSAFE_THRESHOLD
        ) {
          hiveUnsafe = true;
          console.warn(
            `[run-generation] Hive flagged gen=${generationId}: class=${cls.class} score=${cls.score}`,
          );
          break;
        }
      }
    } catch (hiveErr) {
      // Fail-open — Hive outage should not block delivery.
      console.error(
        `[run-generation] Hive error for gen=${generationId}`,
        hiveErr,
      );
    }

    if (hiveUnsafe) {
      await admin
        .from("generations")
        .update({
          status: "failed",
          image_url: r2Url,
          assembled_prompt: assembledPrompt,
        })
        .eq("id", generationId);
      return;
    }

    // ── 8. Insert approval row + flip generation to ready_for_approval ──────
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString();
    try {
      await admin.from("approvals").insert({
        generation_id: generationId,
        creator_id: creatorId,
        brand_id: brandId,
        status: "pending",
        expires_at: expiresAt,
      });
    } catch (apprErr) {
      // Non-fatal — generation surfaces, approval can be reconciled later.
      console.error(
        `[run-generation] approvals insert failed for gen=${generationId}`,
        apprErr,
      );
    }

    await admin
      .from("generations")
      .update({
        status: "ready_for_approval",
        image_url: r2Url,
        assembled_prompt: assembledPrompt,
      })
      .eq("id", generationId);

    console.log(
      `[run-generation] gen=${generationId} ready_for_approval (${r2Url})`,
    );
  } catch (err) {
    // Catch-all for unexpected pipeline errors (DB issues, fetch failures
    // before Gemini, etc.) — mark for admin review, do NOT refund (we don't
    // know the state).
    console.error(
      `[run-generation] Unexpected error for gen=${generationId}`,
      err,
    );
    Sentry.captureException(err, {
      tags: { route: "run-generation", phase: "unexpected" },
      extra: { generation_id: generationId },
    });
    try {
      await admin
        .from("generations")
        .update({ status: "failed" })
        .eq("id", generationId);
    } catch {
      // swallow — already in error path
    }
  }
}

/**
 * Dispatch many generations in parallel via `runGeneration`. Used by
 * /api/campaigns/create. Returns a single promise that resolves when all
 * have finished (success or failure logged inline).
 */
export async function runGenerationsBatch(
  generationIds: string[],
): Promise<void> {
  await Promise.allSettled(generationIds.map((id) => runGeneration(id)));
}
