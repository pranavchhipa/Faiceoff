import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Function 1: Run the full generation pipeline
// Triggered when a brand creates a new generation request
//
// Pipeline: compliance → LLM prompt assembly → image generation → safety → approval
// ---------------------------------------------------------------------------
export const runPipeline = inngest.createFunction(
  {
    id: "generation/run-pipeline",
    triggers: [{ event: "generation/created" }],
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
        .select("structured_brief")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const brief = gen.structured_brief as Record<string, unknown>;

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

    // ── Step 3: Image Generation ──────────────────────────────────────────
    // If creator has a trained LoRA model → call Replicate FLUX with LoRA.
    // If structured_brief has a product_image_url → also pass it as an
    // IP-Adapter reference so the product appears in the generated image.
    // If not → dev mode with placeholder image from picsum.photos.
    await step.run("generate-image", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("creator_id, cost_paise, assembled_prompt, structured_brief")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      // Extract product image URL from structured brief (for IP-Adapter)
      const brief = (gen.structured_brief ?? {}) as Record<string, unknown>;
      const productImageUrl =
        typeof brief.product_image_url === "string"
          ? (brief.product_image_url as string)
          : null;

      // Check if creator has a trained LoRA model
      const { data: loraModel } = await admin
        .from("creator_lora_models")
        .select("replicate_model_id, training_status, trigger_word")
        .eq("creator_id", gen.creator_id)
        .eq("training_status", "completed")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      let imageUrl: string;
      let predictionId: string;

      if (loraModel?.replicate_model_id) {
        // ─── Production Path: FLUX.1 Dev + Creator LoRA (+ optional IP-Adapter) ───
        const { replicate } = await import("@/lib/ai/replicate-client");

        // Prepend the LoRA trigger word so the trained face fires on this prompt
        const triggerWord = loraModel.trigger_word ?? "TOK";
        const rawPrompt = gen.assembled_prompt ?? assembledPrompt;
        const promptWithTrigger = rawPrompt.toUpperCase().includes(triggerWord)
          ? rawPrompt
          : `a photo of ${triggerWord} person, ${rawPrompt}`;

        // Base input — LoRA for face consistency (unchanged)
        const input: Record<string, unknown> = {
          prompt: promptWithTrigger,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 50,
          output_format: "png",
          aspect_ratio: "1:1",
        };

        // IP-Adapter: inject product image as visual reference so the
        // actual product (not just a described one) appears in the output.
        // FLUX IP-Adapter models on Replicate commonly accept `image_prompt`
        // with an optional `image_prompt_strength` (0–1) control.
        if (productImageUrl) {
          input.image_prompt = productImageUrl;
          input.image_prompt_strength = 0.6;
          console.log(
            `[pipeline] IP-Adapter enabled with product image: ${productImageUrl}`
          );
        }

        const output = await replicate.run(
          loraModel.replicate_model_id as `${string}/${string}`,
          { input }
        );

        const urls = output as string[];
        imageUrl =
          urls[0] ??
          `https://picsum.photos/seed/${generation_id}/768/768`;
        predictionId = `rep_${generation_id}`;

        console.log(`[pipeline] Image generated via Replicate LoRA`);
      } else {
        // ─── Dev Mode: No LoRA trained yet ───
        const seed = generation_id.replace(/-/g, "").slice(0, 12);
        imageUrl = `https://picsum.photos/seed/${seed}/768/768`;
        predictionId = `dev_${generation_id}`;

        console.log(
          `[DEV MODE] No trained LoRA for creator ${gen.creator_id}. Using placeholder.`
        );
      }

      await admin
        .from("generations")
        .update({
          image_url: imageUrl,
          cost_paise: gen.cost_paise ?? 500,
          replicate_prediction_id: predictionId,
          status: "output_check",
        })
        .eq("id", generation_id);
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

      // Update campaign spend + generation count
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

      // Creator credit (earning)
      await admin.from("wallet_transactions").insert({
        user_id: creatorRow.user_id,
        type: "generation_earning",
        amount_paise: costPaise,
        direction: "credit" as const,
        reference_id: generation_id,
        reference_type: "generation",
        balance_after_paise: 0, // TODO: compute from current balance
        description: `Earning for generation ${generation_id}`,
      });

      // Brand debit (spend)
      await admin.from("wallet_transactions").insert({
        user_id: brandRow.user_id,
        type: "generation_spend",
        amount_paise: costPaise,
        direction: "debit" as const,
        reference_id: generation_id,
        reference_type: "generation",
        balance_after_paise: 0, // TODO: compute from current balance
        description: `Spend for generation ${generation_id}`,
      });

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
