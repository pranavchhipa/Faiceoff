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
 *   5. Call Gemini 3.1 Flash Image — STAGE 1: face/scene generation
 *   5b. Call Gemini again — STAGE 2: product refinement pass (env-gated;
 *       falls back to stage-1 output on failure)
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
import {
  releaseReserve,
  reserveWallet,
  deductCredit,
} from "@/lib/billing";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import { checkImage } from "@/lib/ai/hive-client";
import { assemblePromptWithLLM, buildSceneDirectives } from "@/lib/ai/prompt-assembler";
import { runComplianceCheck, type ComplianceInput } from "@/lib/compliance";
import { upscaleImage } from "@/lib/ai/upscaler-client";
import { buildProductComposite } from "@/lib/ai/product-composite";
import { shouldTriggerStage2 } from "@/lib/ai/ocr-client";
import { track } from "@/lib/observability/analytics";
import { sendBrandLowCredits } from "@/lib/email/transactional";
import {
  generateImage,
  iterateOnImage,
  refineProductInImage,
  type ImageInput,
} from "@/lib/ai/gemini-client";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HIVE_UNSAFE_THRESHOLD = 0.7;
const HIVE_NSFW_CLASSES = new Set([
  "yes_sexual",
  "yes_male_nudity",
  "yes_female_nudity",
  "yes_graphic_violence",
]);

const REFERENCE_PHOTO_BUCKET = "reference-photos";
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — only need it long enough to fetch
// 4 face refs (up from 3) — more angles = better 3D identity capture for the
// multi-reference model. Env-tunable in case we need to dial cost/latency.
const MAX_FACE_REFS = (() => {
  const n = Number(process.env.MAX_FACE_REFS);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 4;
})();

// ─────────────────────────────────────────────────────────────────────────────
// R2 public URL — module-scope hard-fail (Phase 1, fix 1.4)
// ─────────────────────────────────────────────────────────────────────────────
//
// The legacy fallback (`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{bucket}`)
// is the S3 endpoint, which serves XML, not images — when the env var was
// missing on a deploy, every generation succeeded server-side but every
// brand saw a broken image. Validate at module load so the process refuses
// to boot if R2_PUBLIC_URL is missing. Throwing here is intentional — Next
// will fail the import and the route never registers, which is loud and
// catches the misconfiguration before any user-facing surface goes live.
//
// Module-scope: throws on first import. In dev, this surfaces on first request to a route that imports this module.
const R2_PUBLIC_URL: string = (() => {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) {
    throw new Error(
      "R2_PUBLIC_URL is required — cannot fallback to the S3 endpoint (serves XML, not images)",
    );
  }
  return url.replace(/\/$/, "");
})();

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
 * Pick face refs: deterministic ordering for cross-generation identity stability.
 *
 * Phase 2.1: Removed Fisher-Yates shuffle. Random selection caused the same creator
 * to look subtly different across consecutive generations in the same campaign
 * because the model saw a different mix of reference photos each time. Stable
 * ordering means every generation in a campaign sees the SAME inputs, dramatically
 * improving cross-image identity consistency.
 *
 * Order:
 *   1. is_primary = true (creator's chosen hero shot)
 *   2. Remaining photos by uploaded_at ASC (deterministic, time-stable)
 *
 * Cap at MAX_FACE_REFS. Throws if creator has zero reference photos.
 */
async function pickFaceRefStoragePaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creatorId: string,
): Promise<string[]> {
  const { data: photos, error } = await admin
    .from("creator_reference_photos")
    .select("storage_path, is_primary, uploaded_at")
    .eq("creator_id", creatorId)
    .order("is_primary", { ascending: false })
    .order("uploaded_at", { ascending: true });

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

  const all = (photos as Array<{ storage_path: string }>).map(
    (p) => p.storage_path,
  );
  if (all.length <= MAX_FACE_REFS) return all;

  // photos[0] is the creator-chosen PRIMARY (ordered is_primary desc). For the
  // rest, instead of just taking the oldest N (which could all be similar
  // angles / bad shots), pick an EVENLY-SPREAD sample across the pool —
  // oldest + middle + newest — to maximise angle / look diversity. Deterministic
  // (no randomness) so the same refs are used every time → identity stays
  // consistent across a creator's generations.
  const primary = all[0];
  const rest = all.slice(1);
  const need = Math.min(MAX_FACE_REFS - 1, rest.length);
  const picked: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < need; i++) {
    const idx =
      need <= 1 ? 0 : Math.round((i * (rest.length - 1)) / (need - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(rest[idx]);
    }
  }
  // Backfill in order if the spread collided on a small pool.
  for (const p of rest) {
    if (picked.length >= need) break;
    if (!picked.includes(p)) picked.push(p);
  }

  return [primary, ...picked];
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

  // ── 1b. Charge brand: -1 credit + reserve wallet (if cost > 0) ───────────
  // For free retries (cost_paise=0), we still deduct 1 credit but skip the
  // wallet reserve. For first-of-its-kind retries (is_free_retry=true on the
  // row), we skip both — those are truly free.
  // ── Billing pre-charge: best-effort, never block the pipeline ─────────────
  // The billing RPCs (deduct_credit, reserve_wallet) live in Postgres and
  // are still being finalised — schema mismatches between code and DB
  // shouldn't block real users from generating images. We log + Sentry
  // failures so ops can fix them, but the generation continues.
  //
  // Once billing schema is finalised + tested, flip these back to hard-fail
  // by removing the inner try/catch blocks.
  try {
    const { data: meta } = await admin
      .from("generations")
      .select("is_free_retry, retry_count")
      .eq("id", generationId)
      .maybeSingle();
    const isFreeRetry =
      Boolean(meta?.is_free_retry) && (meta?.retry_count as number) > 0;

    if (!isFreeRetry) {
      try {
        const result = await deductCredit({ brandId, generationId });

        // Low-credits warning email
        if (result.newBalance === 5 || result.newBalance === 1) {
          try {
            const { data: brandRow } = await admin
              .from("brands")
              .select("company_name, user_id")
              .eq("id", brandId)
              .maybeSingle();
            if (brandRow?.user_id) {
              const { data: usr } = await admin
                .from("users")
                .select("email")
                .eq("id", brandRow.user_id)
                .maybeSingle();
              if (usr?.email) {
                await sendBrandLowCredits({
                  to: usr.email,
                  brandName: brandRow.company_name ?? "Brand",
                  creditsRemaining: result.newBalance,
                });
              }
            }
          } catch (mailErr) {
            console.warn("[run-generation] low-credits email failed", mailErr);
          }
        }
      } catch (creditErr) {
        // Soft-fail — log, surface to Sentry, continue. Generation should
        // not break because a billing RPC has a stale column reference.
        console.warn(
          `[run-generation] deductCredit soft-failed for gen=${generationId} — continuing without charge`,
          creditErr,
        );
        Sentry.captureException(creditErr, {
          tags: { route: "run-generation", phase: "deduct_credit" },
          extra: { generation_id: generationId, brand_id: brandId },
          level: "warning",
        });
      }
    }

    if (costPaise > 0) {
      try {
        await reserveWallet({
          brandId,
          amountPaise: costPaise,
          generationId,
        });
      } catch (walletErr) {
        // Soft-fail — same reasoning as above.
        console.warn(
          `[run-generation] reserveWallet soft-failed for gen=${generationId} — continuing without reserve`,
          walletErr,
        );
        Sentry.captureException(walletErr, {
          tags: { route: "run-generation", phase: "reserve_wallet" },
          extra: { generation_id: generationId, brand_id: brandId, costPaise },
          level: "warning",
        });
      }
    }
  } catch (metaErr) {
    // Failure to read the gen row itself is fatal — that's a real bug.
    console.error(
      `[run-generation] meta lookup failed for gen=${generationId}`,
      metaErr,
    );
    Sentry.captureException(metaErr, {
      tags: { route: "run-generation", phase: "billing_meta" },
      extra: { generation_id: generationId },
    });
    await admin
      .from("generations")
      .update({ status: "failed" })
      .eq("id", generationId);
    return;
  }

  try {
    // ── 1c. Compliance check ─────────────────────────────────────────────────
    // Hard-block briefs that trip the creator's blocked-categories or
    // semantic vector match. Fail-open on transient errors (Sentry'd).
    try {
      const compliance = await runComplianceCheck({
        creatorId,
        generationId,
        structuredBrief: brief as ComplianceInput["structuredBrief"],
      });
      if (!compliance.passed) {
        console.warn(
          `[run-generation] gen=${generationId} blocked at compliance layer ${compliance.layer}: ${compliance.reason}`,
        );
        await admin
          .from("generations")
          .update({
            status: "failed",
            compliance_result: compliance,
          })
          .eq("id", generationId);
        // Refund — the brief was rejected, not a fault of the AI
        if (costPaise > 0) {
          await releaseReserve({
            brandId,
            amountPaise: costPaise,
            generationId,
          }).catch(() => {});
        }
        await rollbackCreditSafe(admin, brandId, generationId);
        return;
      }
    } catch (complianceErr) {
      // Fail-open: log and proceed. Compliance is best-effort here; brand
      // review gate + Hive safety check still catch issues downstream.
      console.warn(
        `[run-generation] compliance check threw, proceeding: gen=${generationId}`,
        complianceErr,
      );
      Sentry.captureException(complianceErr, {
        tags: { route: "run-generation", phase: "compliance" },
        extra: { generation_id: generationId },
      });
    }

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
    const productImageRaw = await fetchImageBytes(
      productImageUrl,
      "product image",
    );

    // ── 3b. Phase 6c — 3-panel composite when label_bbox is present ────────
    // Gives Gemini a "full / label crop / wordmark detail" view of the same
    // product. Falls through to original bytes when label_bbox is null or
    // sharp errors. composite_built/skipped fires for telemetry.
    const labelBboxRaw = brief.label_bbox as
      | { x: number; y: number; w: number; h: number }
      | null
      | undefined;
    const composite = await buildProductComposite({
      productImageBytes: productImageRaw.bytes,
      productImageMime: productImageRaw.mimeType,
      labelBbox: labelBboxRaw ?? null,
    });
    const productImage = {
      bytes: composite.bytes,
      mimeType: composite.mimeType,
    };
    if (composite.composited) {
      track(
        "composite_built",
        { generation_id: generationId, label_bbox_present: true },
        brandId,
      );
    } else {
      track(
        "composite_skipped",
        {
          generation_id: generationId,
          reason: labelBboxRaw ? "sharp_failed_or_invalid_bbox" : "no_label_bbox",
        },
        brandId,
      );
    }

    // ── 4. Assemble creative prompt via LLM ─────────────────────────────────
    let assembledPrompt: string;
    try {
      const { prompt } = await assemblePromptWithLLM(brief, generationId);
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
        // NOTE: brand-typed pack_text is intentionally NOT passed — the
        // product reference image is the only authority for packaging text.
        // Phase 6c — anchor prompt mentions the composite when active
        compositeApplied: composite.composited,
        // Brand's selected pills as authoritative directives (high-attention).
        sceneDirectives: buildSceneDirectives(brief),
        generationId,
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

    // ── 5b. Stage 2: Product refinement pass (manual high-detail only) ─────
    // Fires ONLY when the brand explicitly checked high-detail mode. The
    // refinement is an image-to-image edit that copies the product from the
    // reference photo — fully image-authoritative, no typed text involved.
    //
    // Diffusion models are far better at "preserve this region from
    // reference" than "generate this from scratch", so when Stage 2 fires
    // product fidelity jumps from ~70-80% to ~90-95%.
    //
    // Failure mode: if refinement throws, fall back to stage-1 output. The
    // brand still gets a usable image; we just lose the product-fidelity
    // boost. Sentry-logged so we can see the refinement success rate.
    let finalImage: { bytes: Uint8Array; mimeType: string } = {
      bytes: geminiResult.bytes,
      mimeType: geminiResult.mimeType,
    };
    let refinementApplied = false;
    let stage2TriggeredBy:
      | "manual"
      | "ocr_fail"
      | "dense_label"
      | null = null;

    const preUpscaleTrigger = shouldTriggerStage2({
      highDetailMode: brief.high_detail_mode === true,
    });

    if (preUpscaleTrigger.trigger) {
      try {
        const refineStart = Date.now();
        const refined = await refineProductInImage({
          generatedImage: {
            bytes: geminiResult.bytes,
            mimeType: geminiResult.mimeType,
          },
          productImage,
          aspectRatio,
          generationId,
        });
        finalImage = { bytes: refined.bytes, mimeType: refined.mimeType };
        refinementApplied = true;
        stage2TriggeredBy = preUpscaleTrigger.reason as
          | "manual"
          | "dense_label";
        track(
          "stage2_triggered",
          {
            generation_id: generationId,
            trigger_type: stage2TriggeredBy,
          },
          brandId,
        );
        console.log(
          `[run-generation] gen=${generationId} stage 2 refinement complete (reason=${stage2TriggeredBy}) in ${Date.now() - refineStart}ms`,
        );
      } catch (refineErr) {
        const msg =
          refineErr instanceof Error ? refineErr.message : String(refineErr);
        console.warn(
          `[run-generation] gen=${generationId} stage 2 refinement failed, falling back to stage-1: ${msg}`,
        );
        Sentry.captureException(refineErr, {
          tags: { route: "run-generation", phase: "refinement" },
          extra: { generation_id: generationId },
        });
      }
    }

    // ── 5c. Real-ESRGAN upscale (Phase 3.1, optional, fail-open) ───────────
    // 2× super-resolution. Real-ESRGAN does NOT hallucinate features (unlike
    // Clarity Upscaler), so it's safe to run after the identity-locked
    // generation without contradicting Phase 2 hardening. Default ON; set
    // ENABLE_UPSCALE=false for instant rollback if Replicate has an outage.
    let upscaleApplied = false;
    const upscaleEnabled =
      (process.env.ENABLE_UPSCALE ?? "true") !== "false";
    if (upscaleEnabled) {
      try {
        const upscaleStart = Date.now();
        const upscaled = await upscaleImage(
          finalImage.bytes,
          finalImage.mimeType,
          { generationId },
        );
        finalImage = upscaled;
        upscaleApplied = true;
        console.log(
          `[run-generation] gen=${generationId} upscale complete in ${Date.now() - upscaleStart}ms`,
        );
      } catch (upscaleErr) {
        // Fail-open: keep Gemini output, log to Sentry. Brand still gets the
        // image at the original resolution.
        const msg =
          upscaleErr instanceof Error ? upscaleErr.message : String(upscaleErr);
        console.warn(
          `[run-generation] gen=${generationId} upscale failed, using original: ${msg}`,
        );
        Sentry.captureException(upscaleErr, {
          tags: { route: "run-generation", phase: "upscale" },
          extra: { generation_id: generationId },
        });
      }
    }

    // ── 5d. OCR-vs-typed-text validation REMOVED (image-authoritative) ─────
    // The old check OCR'd the output and compared it against brand-TYPED
    // pack_text. Typed text is unreliable ground truth — one brand typo
    // flagged CORRECT renders as drift and silently fired a second (paid)
    // Stage-2 call. Product fidelity is now enforced purely from the product
    // reference image: PRODUCT LOCK prompt + 3-panel label composite +
    // optional manual high-detail refinement (which copies from the image).
    const ocrValidationResult: null = null;

    // ── 6. R2 upload + sidecar provenance (Phase 3.2) ──────────────────────
    // Image bytes go to R2 UNTOUCHED — no sharp re-encode, pixel-perfect from
    // Gemini (or upscaler). Provenance metadata lives in a sidecar JSON at a
    // convention-based URL ({image-url-base}/provenance.json) so anyone can
    // derive it without a DB lookup. Both uploads run concurrently.
    const ext = finalImage.mimeType === "image/jpeg" ? "jpg" : "png";
    const r2Key = `generations/${generationId}/raw.${ext}`;
    const provenanceKey = `generations/${generationId}/provenance.json`;
    const modelName =
      process.env.NANO_BANANA_MODEL ??
      process.env.GEMINI_MODEL ??
      "gemini-3-pro-image-preview";
    const provenance = {
      v: "1",
      platform: "Faiceoff",
      generation_id: generationId,
      brand_id: brandId,
      creator_id: creatorId,
      model: modelName,
      generated_at: new Date().toISOString(),
      public_url: `${R2_PUBLIC_URL}/${r2Key}`,
      ai_generated: true,
      upscaled: upscaleApplied,
      refinement_applied: refinementApplied,
      stage2_triggered_by: stage2TriggeredBy,
    };

    let r2Url: string;
    try {
      await Promise.all([
        r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: r2Key,
            Body: finalImage.bytes,
            ContentType: finalImage.mimeType,
          }),
        ),
        r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: provenanceKey,
            Body: JSON.stringify(provenance, null, 2),
            ContentType: "application/json",
          }),
        ),
      ]);
      r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
      console.log(
        `[run-generation] gen=${generationId} uploaded to R2 (refinement_applied=${refinementApplied}, upscale_applied=${upscaleApplied})`,
      );
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
      const hiveResult = await checkImage(r2Url, { generationId });
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

    // ── 8. Brand quality gate ──────────────────────────────────────────────
    // After safety pass, image goes to BRAND for preview/retry/discard before
    // being sent to creator. Brand action (or 24h timeout) creates the
    // approval row — see /api/generations/[id]/send-for-approval.
    //
    // upscaled_url tracks which post-processing path was taken. When the
    // upscale step ran successfully, image_url already IS the upscaled image
    // (we overwrite finalImage in place), so both columns share the same URL.
    // When upscale was skipped or failed-open, upscaled_url stays null.
    //
    // Phase 5.4 — generation_attempts records inline retries inside
    // generateImage (1 or 2). provider_prediction_id is null today because
    // @google/genai 0.x doesn't expose a stable response id; will populate
    // when the SDK does.
    //
    // TODO (Phase 5.2): Move assembled_prompt to R2 sidecar when table size
    // becomes an issue. The full text bloats the row; keep a 500-char preview
    // here and write the full text to generations/{id}/prompt.txt.
    await admin
      .from("generations")
      .update({
        status: "ready_for_brand_review",
        image_url: r2Url,
        upscaled_url: upscaleApplied ? r2Url : null,
        assembled_prompt: assembledPrompt,
        generation_attempts: geminiResult.attempts,
        provider_prediction_id: geminiResult.providerPredictionId,
        // Phase 6e — OCR drift + Stage 2 trigger reason for admin audit.
        ocr_validation_result: ocrValidationResult,
        stage2_triggered_by: stage2TriggeredBy,
      })
      .eq("id", generationId);

    console.log(
      `[run-generation] gen=${generationId} ready_for_brand_review (${r2Url})`,
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

// ─────────────────────────────────────────────────────────────────────────────
// ITERATION ORCHESTRATOR — brand retry path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drive a retry generation through the iteration pipeline.
 *
 * Caller (POST /api/generations/[id]/retry) must:
 *   1. Have already deducted 1 credit from brands.credits_remaining
 *   2. Have inserted the new gen row in 'draft' with structured_brief containing:
 *      - iteration_notes: string (the brand's textarea text)
 *      - previous_image_url: string (R2 url of the gen being retried)
 *      - All original brief fields (product_image_url, aspect_ratio, etc.)
 *
 * On any failure, refunds the credit and marks gen 'failed'.
 * Idempotent — second call sees status != 'draft' and exits.
 */
export async function runIteration(generationId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── 1. Atomic claim ──────────────────────────────────────────────────────
  const { data: claimed, error: claimError } = await admin
    .from("generations")
    .update({ status: "generating" })
    .eq("id", generationId)
    .eq("status", "draft")
    .select("id, brand_id, creator_id, structured_brief")
    .maybeSingle();

  if (claimError) {
    console.error(
      `[run-iteration] claim failed for gen=${generationId}`,
      claimError,
    );
    return;
  }
  if (!claimed) return; // already running or doesn't exist

  const brandId = claimed.brand_id as string;
  const creatorId = claimed.creator_id as string;
  const brief = claimed.structured_brief as Record<string, unknown>;

  const iterationNotes = (brief.iteration_notes as string | undefined)?.trim();
  const previousImageUrl = brief.previous_image_url as string | undefined;
  const productImageUrl = brief.product_image_url as string | undefined;
  const aspectRatio = (brief.aspect_ratio as string | undefined) ?? "1:1";

  /** Refund the 1 credit charged at retry-route time. */
  async function refundCredit() {
    try {
      const { data: brandRow } = await admin
        .from("brands")
        .select("credits_remaining")
        .eq("id", brandId)
        .maybeSingle();
      const current = (brandRow?.credits_remaining ?? 0) as number;
      await admin
        .from("brands")
        .update({ credits_remaining: current + 1 })
        .eq("id", brandId);
      await admin.from("credit_transactions").insert({
        brand_id: brandId,
        type: "refund",
        credits: 1,
        balance_after: current + 1,
        reference_type: "generation",
        reference_id: generationId,
        description: "Retry failed — credit refunded",
      });
    } catch (err) {
      console.error(
        `[run-iteration] credit refund failed for gen=${generationId}`,
        err,
      );
    }
  }

  /** Mark gen failed with a reason in compliance_result for audit. */
  async function markFailed(reason: string) {
    await admin
      .from("generations")
      .update({
        status: "failed",
        compliance_result: { iteration_error: reason },
      })
      .eq("id", generationId);
  }

  if (!iterationNotes) {
    await markFailed("iteration_notes missing from brief");
    await refundCredit();
    return;
  }
  if (!previousImageUrl) {
    await markFailed("previous_image_url missing from brief");
    await refundCredit();
    return;
  }
  if (!productImageUrl) {
    await markFailed("product_image_url missing from brief");
    await refundCredit();
    return;
  }

  // ── 1c. Compliance check on the MERGED brief (Phase 1, fix 1.2) ──────────
  // The original brief was already compliance-checked in `runGeneration`,
  // but the brand can use iteration_notes to drift into disallowed content
  // (e.g. "swap the water bottle for a beer"). Re-scan with iteration_notes
  // folded into the scannable text.
  //
  // We pass the FULL brief — original product_name + setting + mood plus the
  // merged custom_notes — so layer-1 keyword scan, layer-2 vector similarity,
  // and layer-3 LLM all see the same context the user just expanded.
  //
  // Fail-open policy mirrors runGeneration: transient errors are logged and
  // the pipeline continues; Hive safety check downstream is the second line
  // of defense.
  try {
    const complianceBrief = {
      ...brief,
      // Merge iteration_notes into custom_notes so the new text is scanned
      // alongside whatever the original brief already had.
      custom_notes: [brief.custom_notes, brief.iteration_notes]
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .join(" "),
    } as ComplianceInput["structuredBrief"];

    const compliance = await runComplianceCheck({
      creatorId,
      generationId,
      structuredBrief: complianceBrief,
    });

    if (!compliance.passed) {
      console.warn(
        `[run-iteration] gen=${generationId} blocked at compliance layer ${compliance.layer}: ${compliance.reason}`,
      );
      await admin
        .from("generations")
        .update({
          status: "failed",
          compliance_result: compliance,
        })
        .eq("id", generationId);
      await refundCredit();
      return;
    }
  } catch (complianceErr) {
    console.warn(
      `[run-iteration] compliance check threw, proceeding: gen=${generationId}`,
      complianceErr,
    );
    Sentry.captureException(complianceErr, {
      tags: { route: "run-iteration", phase: "compliance" },
      extra: { generation_id: generationId },
    });
  }

  try {
    // ── 2. Fetch previous image bytes from R2 ───────────────────────────────
    const previousImage = await fetchImageBytes(
      previousImageUrl,
      "previous attempt image",
    );

    // ── 3. Pick + fetch face refs (same as base pipeline) ───────────────────
    const facePaths = await pickFaceRefStoragePaths(admin, creatorId);
    const faceRefs: ImageInput[] = [];
    for (const p of facePaths) {
      const url = await signedUrlFor(admin, p);
      faceRefs.push(await fetchImageBytes(url, `face ref ${p}`));
    }

    // ── 4. Fetch product image ──────────────────────────────────────────────
    const productImage = await fetchImageBytes(productImageUrl, "product image");

    // ── 5. Call Gemini iteration ────────────────────────────────────────────
    let iterationResult: Awaited<ReturnType<typeof iterateOnImage>>;
    try {
      iterationResult = await iterateOnImage({
        generationId,
        // pack_text intentionally NOT passed — the product reference image
        // is the only authority for packaging text (image-authoritative).
        previousImage,
        faceRefs,
        productImage,
        iterationNotes,
        aspectRatio,
      });
    } catch (geminiErr) {
      const msg =
        geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      console.error(
        `[run-iteration] GEMINI_FAIL gen=${generationId} msg="${msg}"`,
      );
      Sentry.captureException(geminiErr, {
        tags: { route: "run-iteration", phase: "gemini" },
        extra: { generation_id: generationId },
      });
      await admin
        .from("generations")
        .update({
          status: "failed",
          compliance_result: { iteration_error: msg.slice(0, 500) },
        })
        .eq("id", generationId);
      await refundCredit();
      return;
    }

    // ── 6. Real-ESRGAN upscale (Phase 3.1, optional, fail-open) ────────────
    // Same logic as runGeneration — Real-ESRGAN is identity-safe so we apply
    // it to iteration outputs too. Skipped if ENABLE_UPSCALE=false.
    let iterFinal: { bytes: Uint8Array; mimeType: string } = {
      bytes: iterationResult.bytes,
      mimeType: iterationResult.mimeType,
    };
    let upscaleApplied = false;
    const upscaleEnabled =
      (process.env.ENABLE_UPSCALE ?? "true") !== "false";
    if (upscaleEnabled) {
      try {
        const upscaleStart = Date.now();
        const upscaled = await upscaleImage(
          iterFinal.bytes,
          iterFinal.mimeType,
          { generationId },
        );
        iterFinal = upscaled;
        upscaleApplied = true;
        console.log(
          `[run-iteration] gen=${generationId} upscale complete in ${Date.now() - upscaleStart}ms`,
        );
      } catch (upscaleErr) {
        const msg =
          upscaleErr instanceof Error ? upscaleErr.message : String(upscaleErr);
        console.warn(
          `[run-iteration] gen=${generationId} upscale failed, using original: ${msg}`,
        );
        Sentry.captureException(upscaleErr, {
          tags: { route: "run-iteration", phase: "upscale" },
          extra: { generation_id: generationId },
        });
      }
    }

    // ── 7. R2 upload + sidecar provenance (Phase 3.2) ──────────────────────
    const ext = iterFinal.mimeType === "image/jpeg" ? "jpg" : "png";
    const r2Key = `generations/${generationId}/raw.${ext}`;
    const provenanceKey = `generations/${generationId}/provenance.json`;
    const modelName =
      process.env.NANO_BANANA_MODEL ??
      process.env.GEMINI_MODEL ??
      "gemini-3-pro-image-preview";
    const provenance = {
      v: "1",
      platform: "Faiceoff",
      generation_id: generationId,
      brand_id: brandId,
      creator_id: creatorId,
      model: modelName,
      generated_at: new Date().toISOString(),
      public_url: `${R2_PUBLIC_URL}/${r2Key}`,
      ai_generated: true,
      upscaled: upscaleApplied,
      iteration: true,
    };

    let r2Url: string;
    try {
      await Promise.all([
        r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: r2Key,
            Body: iterFinal.bytes,
            ContentType: iterFinal.mimeType,
          }),
        ),
        r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: provenanceKey,
            Body: JSON.stringify(provenance, null, 2),
            ContentType: "application/json",
          }),
        ),
      ]);
      r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
    } catch (r2Err) {
      console.error(
        `[run-iteration] R2 upload failed for gen=${generationId}`,
        r2Err,
      );
      Sentry.captureException(r2Err, {
        tags: { route: "run-iteration", phase: "r2_upload" },
        extra: { generation_id: generationId },
      });
      await admin
        .from("generations")
        .update({
          status: "failed",
          assembled_prompt: iterationResult.finalPrompt,
        })
        .eq("id", generationId);
      await refundCredit();
      return;
    }

    // ── 8. Hive content safety check ────────────────────────────────────────
    let hiveUnsafe = false;
    try {
      const hiveResult = await checkImage(r2Url, { generationId });
      const allClasses =
        hiveResult.status?.[0]?.response?.output?.[0]?.classes ?? [];
      for (const cls of allClasses) {
        if (
          HIVE_NSFW_CLASSES.has(cls.class) &&
          cls.score > HIVE_UNSAFE_THRESHOLD
        ) {
          hiveUnsafe = true;
          console.warn(
            `[run-iteration] Hive flagged gen=${generationId}: class=${cls.class} score=${cls.score}`,
          );
          break;
        }
      }
    } catch (hiveErr) {
      console.error(
        `[run-iteration] Hive error for gen=${generationId}`,
        hiveErr,
      );
    }

    if (hiveUnsafe) {
      await admin
        .from("generations")
        .update({
          status: "failed",
          image_url: r2Url,
          assembled_prompt: iterationResult.finalPrompt,
        })
        .eq("id", generationId);
      await refundCredit();
      return;
    }

    // ── 9. Status flip → ready_for_brand_review ────────────────────────────
    // Phase 5.4 — generation_attempts + provider_prediction_id same as
    // runGeneration.
    await admin
      .from("generations")
      .update({
        status: "ready_for_brand_review",
        image_url: r2Url,
        upscaled_url: upscaleApplied ? r2Url : null,
        assembled_prompt: iterationResult.finalPrompt,
        generation_attempts: iterationResult.attempts,
        provider_prediction_id: iterationResult.providerPredictionId,
      })
      .eq("id", generationId);

    console.log(
      `[run-iteration] gen=${generationId} ready_for_brand_review (${r2Url})`,
    );
  } catch (err) {
    console.error(
      `[run-iteration] Unexpected error for gen=${generationId}`,
      err,
    );
    Sentry.captureException(err, {
      tags: { route: "run-iteration", phase: "unexpected" },
      extra: { generation_id: generationId },
    });
    try {
      await admin
        .from("generations")
        .update({ status: "failed" })
        .eq("id", generationId);
    } catch {
      // swallow
    }
    await refundCredit();
  }
}
