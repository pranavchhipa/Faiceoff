import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Function 1: Run the full generation pipeline
// Triggered when a brand creates a new generation request
// ---------------------------------------------------------------------------
export const runPipeline = inngest.createFunction(
  { id: "generation/run-pipeline", triggers: [{ event: "generation/created" }] },
  async ({ event, step }) => {
    const { generation_id } = event.data as { generation_id: string };
    const admin = createAdminClient();

    // -- Step 1: Compliance check --
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

      // In production: check structured_brief against
      // creator_compliance_vectors.blocked_concept for this creator.
      // For now, simulate a compliance check with a short delay.
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

    // -- Step 2: Assemble prompt --
    const assembledPrompt = await step.run("assemble-prompt", async () => {
      const { data: gen } = await admin
        .from("generations")
        .select("structured_brief")
        .eq("id", generation_id)
        .single();

      if (!gen) throw new Error("Generation not found");

      const brief = gen.structured_brief as Record<string, unknown>;

      const parts: string[] = [];
      if (brief.subject) parts.push(String(brief.subject));
      if (brief.scene) parts.push(`in a ${brief.scene}`);
      if (brief.style) parts.push(`${brief.style} style`);
      if (brief.lighting) parts.push(`${brief.lighting} lighting`);
      if (brief.mood) parts.push(`${brief.mood} mood`);
      if (brief.outfit) parts.push(`wearing ${brief.outfit}`);
      if (brief.background) parts.push(`with ${brief.background} background`);
      if (brief.extras) parts.push(String(brief.extras));

      const prompt = parts.join(", ") || "portrait photo";

      await admin
        .from("generations")
        .update({ assembled_prompt: prompt, status: "generating" })
        .eq("id", generation_id);

      return prompt;
    });

    // -- Step 3: Generate image (placeholder) --
    await step.run("generate-image", async () => {
      // In production: call replicate.run() with the creator's LoRA model
      const dummyImageUrl = `https://placeholder.faiceoff.com/generations/${generation_id}.png`;

      const { data: gen } = await admin
        .from("generations")
        .select("cost_paise")
        .eq("id", generation_id)
        .single();

      await admin
        .from("generations")
        .update({
          image_url: dummyImageUrl,
          cost_paise: gen?.cost_paise ?? 500,
          replicate_prediction_id: `sim_${generation_id}`,
          status: "output_check",
        })
        .eq("id", generation_id);
    });

    // -- Step 4: Output safety check (placeholder) --
    await step.run("output-check", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await admin
        .from("generations")
        .update({ status: "ready_for_approval" })
        .eq("id", generation_id);
    });

    // -- Step 5: Create approval row --
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
    });

    return { generation_id, assembledPrompt, status: "ready_for_approval" };
  }
);

// ---------------------------------------------------------------------------
// Function 2: Handle approved generation
// Finalize payment and delivery after creator approves
// ---------------------------------------------------------------------------
export const handleApproval = inngest.createFunction(
  { id: "generation/handle-approval", triggers: [{ event: "generation/approved" }] },
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

      // Update campaign: increment spent and generation count
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

      // Creator credit
      await admin.from("wallet_transactions").insert({
        user_id: creatorRow.user_id,
        type: "generation_earning",
        amount_paise: costPaise,
        direction: "credit" as const,
        reference_id: generation_id,
        reference_type: "generation",
        balance_after_paise: 0, // In production: compute from current balance
        description: `Earning for generation ${generation_id}`,
      });

      // Brand debit
      await admin.from("wallet_transactions").insert({
        user_id: brandRow.user_id,
        type: "generation_spend",
        amount_paise: costPaise,
        direction: "debit" as const,
        reference_id: generation_id,
        reference_type: "generation",
        balance_after_paise: 0, // In production: compute from current balance
        description: `Spend for generation ${generation_id}`,
      });

      // Set delivery URL
      await admin
        .from("generations")
        .update({ delivery_url: gen.image_url })
        .eq("id", generation_id);
    });

    return { generation_id, status: "finalized" };
  }
);

// ---------------------------------------------------------------------------
// Function 3: Handle rejected generation
// Log the rejection, no money changes
// ---------------------------------------------------------------------------
export const handleRejection = inngest.createFunction(
  { id: "generation/handle-rejection", triggers: [{ event: "generation/rejected" }] },
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
    });

    return { generation_id, status: "rejected" };
  }
);
