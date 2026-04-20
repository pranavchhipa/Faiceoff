import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEGATIVE_PROMPT } from "@/lib/ai/prompt-assembler";
import { runPipelineInference } from "@/lib/ai/pipeline-router";
import { runQualityGate } from "@/lib/ai/quality-gate";
import { upscale, getLongEdge } from "@/lib/ai/upscaler";
import {
  getValidFaceAnchorPack,
  generateAndCacheFaceAnchorPack,
  resolveFaceAnchorUrls,
  getRealReferencePhotoUrls,
} from "@/lib/ai/face-anchor";
import {
  MAX_RETRIES,
  resolvePipelineVersion,
} from "@/lib/ai/pipeline-config";
import {
  QUALITY_GATE_THRESHOLDS,
  UPSCALE_MIN_EDGE,
  type AspectRatio,
  type PipelineVersion,
  type QualityScores,
} from "@/domains/generation/types";

// ---------------------------------------------------------------------------
// Function 1: Run the full generation pipeline
// Triggered when a brand creates a new generation request
//
// Pipeline: compliance → LLM prompt assembly → image generation → safety → approval
// ---------------------------------------------------------------------------
export const runPipeline = inngest.createFunction(
  {
    id: "generation/run-pipeline",
    // Serialize all generation pipelines to one-at-a-time. Replicate's
    // flux-kontext-max hits 429 rate limits when 2+ predictions fire in
    // parallel from the same account. Queueing them here avoids that
    // entirely — adds latency but guarantees delivery. When the account
    // concurrency limit is raised, bump this number to match.
    concurrency: { limit: 1 },
    triggers: [{ event: "generation/created" }],
    // If every step in the pipeline exhausts retries, flip the generation
    // to 'failed', release the escrowed funds back to the brand wallet,
    // and log to audit. Without this, the row stays stuck on 'generating'
    // and the escrow is frozen.
    onFailure: async ({ event, error }) => {
      const admin = createAdminClient();
      // Inngest wraps the original event at event.data.event
      const original = (event.data as { event?: { data?: { generation_id?: string } } })
        .event;
      const generation_id = original?.data?.generation_id;
      if (!generation_id) return;

      const { data: gen } = await admin
        .from("generations")
        .select("id, brand_id, cost_paise, status")
        .eq("id", generation_id)
        .maybeSingle();
      if (!gen) return;

      // Idempotency: if already failed AND refunded, skip.
      const { data: existingRefund } = await admin
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", generation_id)
        .eq("reference_type", "generation")
        .eq("type", "escrow_release")
        .maybeSingle();

      await admin
        .from("generations")
        .update({ status: "failed" })
        .eq("id", generation_id);

      if (!existingRefund && gen.brand_id && gen.cost_paise) {
        const { data: brandRow } = await admin
          .from("brands")
          .select("user_id")
          .eq("id", gen.brand_id)
          .maybeSingle();
        if (brandRow?.user_id) {
          const { data: lastTx } = await admin
            .from("wallet_transactions")
            .select("balance_after_paise")
            .eq("user_id", brandRow.user_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const currentBalance = lastTx?.balance_after_paise ?? 0;
          await admin.from("wallet_transactions").insert({
            user_id: brandRow.user_id,
            type: "escrow_release",
            amount_paise: gen.cost_paise,
            direction: "credit" as const,
            reference_id: generation_id,
            reference_type: "generation",
            balance_after_paise: currentBalance + gen.cost_paise,
            description: `Refund for failed generation ${generation_id}`,
          });
        }
      }

      await admin.from("audit_log").insert({
        actor_type: "system" as const,
        action: "generation_failed",
        resource_type: "generation",
        resource_id: generation_id,
        metadata: {
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          refunded: !existingRefund,
        },
      });
    },
  },
  async ({ event, step }) => {
    const { generation_id } = event.data as { generation_id: string };
    const admin = createAdminClient();

    // ── Step 1: Compliance Check ──────────────────────────────────────────
    // Verify the brief doesn't violate the creator's blocked concepts.
    // In production: pgvector similarity search against compliance_vectors.
    await step.run("compliance-check", async () => {
      await admin
        .from("generations")
        .update({ status: "compliance_check" })
        .eq("id", generation_id);

      const { data: gen } = await admin
        .from("generations")
        .select("creator_id, structured_brief")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      // TODO: In production, check structured_brief against
      // creator_compliance_vectors using pgvector similarity search.
      // For now, all briefs pass compliance.
      await new Promise((resolve) => setTimeout(resolve, 500));

      await admin
        .from("generations")
        .update({
          compliance_result: {
            passed: true,
            checked_at: new Date().toISOString(),
          },
        })
        .eq("id", generation_id);
    });

    // ── Step 2: LLM Prompt Assembly ───────────────────────────────────────
    // Use OpenRouter LLM to craft a professional photography-grade prompt
    // from the structured brief. Falls back to simple concatenation if LLM fails.
    const assembledPrompt = await step.run("assemble-prompt", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("creator_id, structured_brief")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const brief = {
        ...(gen.structured_brief as Record<string, unknown>),
      };

      // Inject creator gender so the prompt assembler can render
      // "a [gender] person" instead of the gender-neutral "a person",
      // which Nano Banana Pro otherwise tends to hallucinate as female.
      // Cast: `gender` column added in migration 00018, types stale until
      // Supabase type regen runs.
      const { data: creatorRow } = (await admin
        .from("creators")
        .select("gender")
        .eq("id", gen.creator_id)
        .maybeSingle()) as { data: { gender: string | null } | null };
      if (creatorRow?.gender && !brief.subject_gender) {
        brief.subject_gender = creatorRow.gender;
      }

      // Use LLM for high-quality prompt assembly
      const { assemblePromptWithLLM } = await import(
        "@/lib/ai/prompt-assembler"
      );
      const { prompt, method } = await assemblePromptWithLLM(brief);

      console.log(
        `[pipeline] Prompt assembled via ${method}: "${prompt.slice(0, 100)}..."`
      );

      await admin
        .from("generations")
        .update({ assembled_prompt: prompt, status: "generating" })
        .eq("id", generation_id);

      return prompt;
    });

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
      const versionOverride = brief.pipeline_version as
        | PipelineVersion
        | undefined;
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

      // Face anchors for Nano Banana Pro / Gemini 3 Pro Image multi-reference.
      //
      // Priority order:
      //   1. Real onboarding selfies from creator_reference_photos (ground truth).
      //      These are unambiguous identity anchors — original skin texture,
      //      real pores, actual bone structure. Preferred whenever ≥3 exist.
      //   2. LoRA-generated synthetic anchor pack (fallback).
      //      Only used if the creator uploaded fewer than 3 real photos.
      //      Synthetic anchors already bake in LoRA averaging → visible
      //      identity drift in final output. Avoid when we can.
      //
      // Why 3: Gemini 3 Pro needs multiple angles to lock identity. A single
      // frontal selfie collapses to a generic average. 3+ real photos from
      // different angles / expressions gives a strong enough signal.
      const MIN_REAL_PHOTOS_FOR_PRIMARY = 3;
      const realReferenceUrls = await getRealReferencePhotoUrls(gen.creator_id, 5);

      let faceAnchorPack: string[];
      let faceAnchorSource: "real_photos" | "synthetic_anchors";

      if (realReferenceUrls.length >= MIN_REAL_PHOTOS_FOR_PRIMARY) {
        faceAnchorPack = realReferenceUrls;
        faceAnchorSource = "real_photos";
      } else {
        // Fallback path — synthetic LoRA-generated anchor pack.
        let faceAnchorPackPaths = await getValidFaceAnchorPack(gen.creator_id);
        if (faceAnchorPackPaths.length === 0) {
          // Second fallback: generate on demand. Rare — usually the post-
          // training Inngest fn has already cached this.
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
              `Creator ${gen.creator_id} has no trained LoRA and no real reference photos — cannot run ${version} pipeline`
            );
          }
          const { anchorPaths } = await generateAndCacheFaceAnchorPack({
            creatorId: gen.creator_id,
            loraModelId: lora.replicate_model_id,
            triggerWord: lora.trigger_word ?? "TOK",
          });
          faceAnchorPackPaths = anchorPaths;
        }
        // Resolve paths to 1-hour signed URLs right before passing to external
        // APIs (Nano Banana / Kontext) and the quality gate (CLIP).
        faceAnchorPack = await resolveFaceAnchorUrls(faceAnchorPackPaths);
        faceAnchorSource = "synthetic_anchors";
      }

      console.log(
        `[generation:${generation_id}] face_anchor_source=${faceAnchorSource} count=${faceAnchorPack.length}`,
      );

      // Creator reference set for the face-similarity gate.
      //
      // CRITICAL: the gate compares output → reference, so the reference
      // MUST be ground-truth identity. If we fed Gemini synthetic LoRA
      // anchors (because the creator had <3 real onboarding photos), those
      // anchors have already drifted from the real person — using them as
      // the gate reference would "pass" a generation that looks like the
      // averaged LoRA output instead of the real creator.
      //
      // So: always prefer real onboarding photos for the gate, regardless
      // of how many exist. If even one real photo is available, use it.
      // Fall back to the faceAnchorPack (whatever was fed to Gemini) only
      // when the creator has zero real photos on file.
      const creatorReferenceUrls =
        realReferenceUrls.length > 0 ? realReferenceUrls : faceAnchorPack;

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

        // Persist fallback reason to audit_log the moment Pro → Flash
        // fires. Without this the degradation only shows up in ephemeral
        // Vercel function logs — ops/admins have no way to tell if a
        // run-of-the-mill "meh" generation was 3 Pro doing its best or
        // 2.5 Flash hallucinating product text because the env var is
        // misconfigured. One audit row per occurrence is intentional:
        // we want the signal, not one row per attempt in a retry loop.
        if (inference.fallbackReason) {
          await admin.from("audit_log").insert({
            actor_type: "system" as const,
            action: "nano_banana_pro_fallback",
            resource_type: "generation",
            resource_id: generation_id,
            metadata: {
              attempt,
              model_used: inference.modelUsed,
              reason: inference.fallbackReason,
            },
          });
        }

        // Re-host to R2 (private bucket with signed URLs) before quality
        // gate / delivery so we have a stable, shareable URL.
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
        // Keep the highest-aesthetic attempt as fallback if all fail
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

      // ── Hard gate: refuse to deliver if identity or product failed ─────
      //
      // The retry loop above keeps the "best aesthetic" attempt as a
      // fallback even when the quality gate failed. That was silently
      // delivering face=0.00 / clip=0.00 generations to brands. Not
      // acceptable — the whole product promise is that the delivered
      // image is THE creator holding THE brand's product. If either of
      // those is broken, throwing here lets the Inngest onFailure
      // handler refund the brand's wallet instead of charging them for
      // an unusable output.
      //
      // Aesthetic failure is intentionally advisory: a gritty / grainy /
      // casual photo may legitimately score below the aesthetic model's
      // editorial benchmark but still be exactly what the brand asked
      // for. Identity and product fidelity are not optional.
      const finalScores = bestScores ?? lastScores;
      if (finalScores) {
        if (finalScores.face < QUALITY_GATE_THRESHOLDS.face) {
          // Persist the failing scores on the generation row BEFORE we
          // throw so the admin UI can see WHY it failed — the
          // onFailure handler flips status to 'failed' but won't
          // overwrite these diagnostic fields.
          await admin
            .from("generations")
            .update({
              quality_scores: finalScores,
              generation_attempts: attempt,
              provider_prediction_id: bestPredictionId,
              pipeline_version: version,
            } as never)
            .eq("id", generation_id);
          throw new Error(
            `Identity check failed after ${attempt} attempt(s). ` +
              `Face similarity ${finalScores.face.toFixed(2)} < threshold ${QUALITY_GATE_THRESHOLDS.face}. ` +
              `Refusing to deliver — the generated face does not match the creator's reference photos. ` +
              `Brand wallet will be refunded.`
          );
        }
        if (finalScores.clip < QUALITY_GATE_THRESHOLDS.clip) {
          await admin
            .from("generations")
            .update({
              quality_scores: finalScores,
              generation_attempts: attempt,
              provider_prediction_id: bestPredictionId,
              pipeline_version: version,
            } as never)
            .eq("id", generation_id);
          throw new Error(
            `Product check failed after ${attempt} attempt(s). ` +
              `Product similarity ${finalScores.clip.toFixed(2)} < threshold ${QUALITY_GATE_THRESHOLDS.clip}. ` +
              `Refusing to deliver — the generated image does not match the product reference. ` +
              `Brand wallet will be refunded.`
          );
        }
        if (finalScores.aesthetic < QUALITY_GATE_THRESHOLDS.aesthetic) {
          console.warn(
            `[gen/${generation_id}] Aesthetic ${finalScores.aesthetic.toFixed(2)} ` +
              `< threshold ${QUALITY_GATE_THRESHOLDS.aesthetic} but identity+product passed; delivering.`,
          );
        }
      }

      // Stage 3: Upscale CONDITIONAL — skip if native resolution is already
      // high enough (Nano Banana Pro typically produces 2048+ natively).
      //
      // CRITICAL: the upscaler returns a Replicate CDN URL that EXPIRES in
      // ~24h. We must re-host it to Supabase Storage before persisting so
      // the delivered image_url stays valid long-term. Skipping this step
      // caused approved generations to render as broken images the next day.
      let deliveryUrl = bestImageUrl;
      let upscaledUrl: string | null = null;
      try {
        const longEdge = await getLongEdge(bestImageUrl);
        if (longEdge < UPSCALE_MIN_EDGE) {
          const res = await upscale({ imageUrl: bestImageUrl, scale: 2 });
          const rehostedUpscaled = await rehostToR2({
            admin,
            sourceUrl: res.upscaledUrl,
            storagePath: `generations/${generation_id}/upscaled.png`,
          });
          upscaledUrl = rehostedUpscaled;
          deliveryUrl = rehostedUpscaled;
        }
      } catch (err) {
        // Upscale is "nice to have" — don't fail the generation if it errors.
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
          replicate_prediction_id: bestPredictionId, // keep legacy in sync
          pipeline_version: version,
          cost_paise: gen.cost_paise ?? 800, // ≈₹8 typical v2 cost
          status: "output_check",
        } as never)
        .eq("id", generation_id);

      console.log(
        `[gen/${generation_id}] v=${version} model=${bestModelUsed} attempts=${attempt} scores=${JSON.stringify(
          bestScores ?? lastScores
        )}`
      );
    });

    // ── Step 4: Output Safety Check ───────────────────────────────────────
    // In production: call Hive Moderation API to check for NSFW/harmful content.
    // For now: auto-pass.
    await step.run("output-check", async () => {
      // TODO: Use hive-client.ts checkImage() for content moderation
      await new Promise((resolve) => setTimeout(resolve, 500));

      await admin
        .from("generations")
        .update({ status: "ready_for_approval" })
        .eq("id", generation_id);
    });

    // ── Step 5: Create Approval Record ────────────────────────────────────
    // Creator gets 48 hours to approve or reject the generated content.
    await step.run("create-approval", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("creator_id, brand_id")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const expiresAt = new Date(
        Date.now() + 48 * 60 * 60 * 1000
      ).toISOString();

      await admin.from("approvals").insert({
        generation_id,
        creator_id: gen.creator_id,
        brand_id: gen.brand_id,
        status: "pending",
        expires_at: expiresAt,
      });

      console.log(
        `[pipeline] Approval created for generation ${generation_id}, expires ${expiresAt}`
      );
    });

    return { generation_id, assembledPrompt, status: "ready_for_approval" };
  }
);

// ---------------------------------------------------------------------------
// Function 2: Handle approved generation
// Creator approved → credit creator wallet, debit brand wallet, set delivery URL
// ---------------------------------------------------------------------------
export const handleApproval = inngest.createFunction(
  {
    id: "generation/handle-approval",
    triggers: [{ event: "generation/approved" }],
  },
  async ({ event, step }) => {
    const { generation_id } = event.data as { generation_id: string };
    const admin = createAdminClient();

    await step.run("finalize", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("*")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const costPaise = gen.cost_paise ?? 0;

      // ── Idempotency check ────────────────────────────────────────
      // Inngest retries the entire step on failure. Without a guard the
      // campaign counter and wallet balances would double-count on each
      // retry. We check for BOTH the creator credit and the brand debit
      // separately so a retry after a partial success (creator inserted,
      // brand didn't) can still complete the other side instead of
      // bailing out with half-finished state. The unique index from
      // migration 00015 backs this up at the DB level.
      const [
        { data: existingCreditRow },
        { data: existingDebitRow },
      ] = await Promise.all([
        admin
          .from("wallet_transactions")
          .select("id")
          .eq("reference_id", generation_id)
          .eq("reference_type", "generation")
          .eq("type", "generation_earning")
          .maybeSingle(),
        admin
          .from("wallet_transactions")
          .select("id")
          .eq("reference_id", generation_id)
          .eq("reference_type", "generation")
          .eq("type", "generation_spend")
          .maybeSingle(),
      ]);

      const creatorAlreadySettled = !!existingCreditRow;
      const brandAlreadySettled = !!existingDebitRow;
      const fullySettled = creatorAlreadySettled && brandAlreadySettled;

      if (fullySettled) {
        console.log(
          `[pipeline] Generation ${generation_id} already settled, skipping.`
        );
        return;
      }

      // Get user IDs for wallet transactions
      const { data: creatorRow } = await admin
        .from("creators")
        .select("user_id")
        .eq("id", gen.creator_id)
        .single();

      const { data: brandRow } = await admin
        .from("brands")
        .select("user_id")
        .eq("id", gen.brand_id)
        .single();

      if (!creatorRow || !brandRow) {
        throw new Error("Creator or brand user not found");
      }

      // Helper — read latest balance from wallet_transactions.
      // Running balance is stored denormalised on each row so the wallet page
      // can read it with a single query. We MUST read-then-write here or the
      // balance displayed to the user will reset to ₹0 after every approval.
      const latestBalance = async (userId: string): Promise<number> => {
        const { data } = await admin
          .from("wallet_transactions")
          .select("balance_after_paise")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data?.balance_after_paise ?? 0;
      };

      // Creator credit (earning) — balance grows.
      // Skip if this side was already inserted on a prior attempt.
      if (!creatorAlreadySettled) {
        const creatorBalance = await latestBalance(creatorRow.user_id);
        const { error: creatorTxErr } = await admin
          .from("wallet_transactions")
          .insert({
            user_id: creatorRow.user_id,
            type: "generation_earning",
            amount_paise: costPaise,
            direction: "credit" as const,
            reference_id: generation_id,
            reference_type: "generation",
            balance_after_paise: creatorBalance + costPaise,
            description: `Earning for generation ${generation_id}`,
          });
        if (creatorTxErr) {
          throw new Error(
            `Creator wallet insert failed: ${creatorTxErr.message}`
          );
        }
      }

      // Brand debit (spend) — balance shrinks
      if (!brandAlreadySettled) {
        const brandBalance = await latestBalance(brandRow.user_id);
        const { error: brandTxErr } = await admin
          .from("wallet_transactions")
          .insert({
            user_id: brandRow.user_id,
            type: "generation_spend",
            amount_paise: costPaise,
            direction: "debit" as const,
            reference_id: generation_id,
            reference_type: "generation",
            balance_after_paise: Math.max(0, brandBalance - costPaise),
            description: `Spend for generation ${generation_id}`,
          });
        if (brandTxErr) {
          throw new Error(
            `Brand wallet insert failed: ${brandTxErr.message}`
          );
        }
      }

      // Update campaign spend + generation count. Only on first-time
      // settlement — if we got here via a retry that completed the missing
      // wallet side, the campaign row was already bumped on the prior
      // attempt and we must NOT double-count it.
      if (!creatorAlreadySettled && !brandAlreadySettled) {
        const { data: campaign } = await admin
          .from("campaigns")
          .select("spent_paise, generation_count")
          .eq("id", gen.campaign_id)
          .single();

        if (!campaign) throw new Error("Campaign not found");

        await admin
          .from("campaigns")
          .update({
            spent_paise: campaign.spent_paise + costPaise,
            generation_count: campaign.generation_count + 1,
          })
          .eq("id", gen.campaign_id);
      }

      // Set delivery URL (in production: upload to R2 CDN first)
      await admin
        .from("generations")
        .update({ delivery_url: gen.image_url })
        .eq("id", generation_id);

      console.log(
        `[pipeline] Generation ${generation_id} approved. ₹${costPaise / 100} settled.`
      );
    });

    return { generation_id, status: "finalized" };
  }
);

// ---------------------------------------------------------------------------
// Function 3: Handle rejected generation
// Creator rejected → log to audit, no money changes
// ---------------------------------------------------------------------------
export const handleRejection = inngest.createFunction(
  {
    id: "generation/handle-rejection",
    triggers: [{ event: "generation/rejected" }],
  },
  async ({ event, step }) => {
    const { generation_id } = event.data as { generation_id: string };
    const admin = createAdminClient();

    await step.run("cleanup", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("creator_id, brand_id, campaign_id")
        .eq("id", generation_id)
        .single();

      await admin.from("audit_log").insert({
        actor_type: "system" as const,
        action: "generation_rejected",
        resource_type: "generation",
        resource_id: generation_id,
        metadata: {
          campaign_id: gen?.campaign_id ?? null,
          creator_id: gen?.creator_id ?? null,
          brand_id: gen?.brand_id ?? null,
        },
      });

      console.log(`[pipeline] Generation ${generation_id} rejected.`);
    });

    return { generation_id, status: "rejected" };
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    imageUrl =
      resolved ?? `https://picsum.photos/seed/${generation_id}/768/768`;
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
    } as never)
    .eq("id", generation_id);
}

/**
 * Persist a generated image (data: URL from Nano Banana base64, or http URL
 * from Replicate) to the reference-photos bucket and return a 1-year signed
 * URL. Private bucket pattern — getPublicUrl won't work.
 */
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
    bytes = Uint8Array.from(
      Buffer.from(args.sourceUrl.slice(comma + 1), "base64")
    );
  } else {
    const res = await fetch(args.sourceUrl);
    if (!res.ok) throw new Error(`rehostToR2 fetch failed: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    contentType = res.headers.get("content-type") ?? "image/png";
  }
  const { error: uploadErr } = await args.admin.storage
    .from("reference-photos")
    .upload(args.storagePath, bytes, { contentType, upsert: true });
  if (uploadErr) {
    throw new Error(`rehostToR2 upload failed: ${uploadErr.message}`);
  }
  const { data: signed, error: signErr } = await args.admin.storage
    .from("reference-photos")
    .createSignedUrl(args.storagePath, 60 * 60 * 24 * 365); // 1 year
  if (signErr || !signed?.signedUrl) {
    throw new Error(`rehostToR2 sign failed: ${signErr?.message ?? "no URL"}`);
  }
  return signed.signedUrl;
}
