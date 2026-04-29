/**
 * End-to-end smoke test for the v2 generation pipeline.
 *
 * Picks a creator with a cached face anchor pack, inserts a synthetic
 * generation with a public sample product image, fires the Inngest event,
 * then prints a poll query for completion.
 *
 * Usage:
 *   npx tsx scripts/smoke-test-pipeline.ts [creatorId]
 *
 * If creatorId is omitted, any creator with a cached pack is used. The
 * creator must already have at least one campaign — this script never
 * creates brands/campaigns/wallets, it only exercises the pipeline.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Load .env.local BEFORE importing anything that reads env at module-
//    init time (inngest client, supabase admin, replicate client, etc.).
//    Mirrors the loader in scripts/backfill-face-anchors.ts.
function loadDotEnvLocal(): void {
  const envPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env.local"
  );
  if (!fs.existsSync(envPath)) return;
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Public coffee-can reference so the pipeline has a real product to compose
// against. Any 800-px JPEG that Hive/Nano Banana accept will do.
const SAMPLE_PRODUCT_URL =
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=800";

async function main() {
  loadDotEnvLocal();

  // Dynamic imports AFTER env is loaded (same pattern as backfill script).
  // Inngest was retired — pipeline now fires via Next.js after() inside
  // /api/campaigns/create. This smoke script just inserts a draft row and
  // hits the run-generation orchestrator directly.
  const { createAdminClient } = await import("../src/lib/supabase/admin.js");
  const { runGeneration } = await import("../src/lib/ai/run-generation.js");

  const admin = createAdminClient();
  const creatorIdArg = process.argv[2];

  // src/types/supabase.ts is stale (migration 00016 added face_anchor_pack);
  // cast the column name on filters so the query compiles until we regen.
  let creator: { id: string; user_id: string } | null = null;
  if (creatorIdArg) {
    const { data } = await admin
      .from("creators")
      .select("id, user_id")
      .eq("id", creatorIdArg)
      .maybeSingle();
    creator = data ?? null;
  } else {
    const { data } = await admin
      .from("creators")
      .select("id, user_id")
      .not("face_anchor_pack" as never, "is", null)
      .limit(1)
      .maybeSingle();
    creator = data ?? null;
  }

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

  // Mirrors the shape the create-generation route produces after
  // normalizeAspectRatio. The pipeline only reads these five fields.
  const structuredBrief = {
    product_name: "Pourfect Coffee",
    product_image_url: SAMPLE_PRODUCT_URL,
    aspect_ratio: "1:1",
    scene_description: "holding the can in a bright kitchen, morning light",
    composition: "medium shot, eye contact with camera",
  };

  // status: "draft" — matches the domain's GenerationStatus union. The
  // pipeline's first Inngest step flips this to "compliance_check".
  const { data: gen, error } = await admin
    .from("generations")
    .insert({
      campaign_id: existingCampaign.id,
      creator_id: creator.id,
      brand_id: existingCampaign.brand_id,
      structured_brief: structuredBrief,
      status: "draft",
      cost_paise: 1500,
    })
    .select("id")
    .single();

  if (error || !gen) {
    console.error("Failed to insert generation:", error?.message);
    process.exit(1);
  }

  console.log(`Inserted generation ${gen.id}. Running pipeline directly...`);

  await runGeneration(gen.id);

  console.log(
    `\nSmoke test complete. Final state:\n  select status, pipeline_version, quality_scores, generation_attempts, image_url, upscaled_url from generations where id = '${gen.id}';\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
