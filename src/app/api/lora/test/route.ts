import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replicate } from "@/lib/ai/replicate-client";

/**
 * POST /api/lora/test
 *
 * Runs a single test generation against the creator's trained LoRA model.
 * Used by the /dashboard/likeness "Test my model" flow so creators can
 * verify the quality of their face model before brands generate with it.
 *
 * Body (optional):
 *   { prompt?: string }
 *
 * Default prompt: a neutral portrait. If a custom prompt is provided,
 * the trigger word is auto-prepended (same logic as the generation
 * pipeline) to actually fire the LoRA.
 *
 * Replicate charges per run (FLUX.1 Dev ≈ $0.03/image). Caller's Replicate
 * account is billed.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find creator + latest trained model
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 }
    );
  }

  const { data: lora } = await admin
    .from("creator_lora_models")
    .select("replicate_model_id, training_status, trigger_word")
    .eq("creator_id", creator.id)
    .eq("training_status", "completed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lora?.replicate_model_id) {
    return NextResponse.json(
      { error: "No trained model available. Train your face first." },
      { status: 400 }
    );
  }

  // Parse prompt from body (optional)
  let customPrompt = "";
  try {
    const body = (await req.json()) as { prompt?: string };
    customPrompt = (body.prompt ?? "").trim();
  } catch {
    // No body or invalid JSON — use default prompt
  }

  const triggerWord = lora.trigger_word ?? "TOK";
  const basePrompt =
    customPrompt ||
    "professional studio portrait, natural lighting, soft bokeh background, 85mm lens, photorealistic";

  // Prepend trigger word if not already present (same rule as pipeline)
  const finalPrompt = basePrompt.toUpperCase().includes(triggerWord)
    ? basePrompt
    : `a photo of ${triggerWord} person, ${basePrompt}`;

  try {
    const output = await replicate.run(
      lora.replicate_model_id as `${string}/${string}`,
      {
        input: {
          prompt: finalPrompt,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 28,
          output_format: "png",
          aspect_ratio: "1:1",
        },
      }
    );

    // Replicate SDK v1.x returns FileOutput[] (or single FileOutput) — not raw
    // URL strings like v0.x did. FileOutput has a .url() method that returns
    // a URL object. We need to normalise here so the browser can actually
    // render the <img src>.
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

    console.log("[lora/test] Replicate output type:", typeof first, "→", imageUrl);

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image returned from Replicate", debug: String(first) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      image_url: imageUrl,
      prompt: finalPrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[lora/test] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
