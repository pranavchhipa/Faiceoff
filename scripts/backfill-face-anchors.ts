/**
 * One-time backfill: generate face anchor PACKS for all creators who have
 * completed LoRA training but don't yet have a face_anchor_pack cached.
 *
 * Usage:
 *   npx tsx scripts/backfill-face-anchors.ts [--dry-run]
 *
 * Cost: ~₹10-15 per creator (4 LoRA runs). Run after deploying the v2
 * pipeline and before enabling it for real traffic so there's no cold-start
 * Stage 0 work during a user's first generation.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Load .env.local into process.env BEFORE we import anything that reads
//    env at module-load time (e.g. replicate-client imported transitively
//    by face-anchor.ts). Same strategy used by scripts/run-migrations.mjs.
//    If a var is already set in the real env, don't overwrite.
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

async function main() {
  loadDotEnvLocal();

  // Dynamic imports AFTER env is loaded, because some of these modules
  // (replicate-client) read env at module-init time.
  const { createAdminClient } = await import("../src/lib/supabase/admin.js");
  const { generateAndCacheFaceAnchorPack } = await import(
    "../src/lib/ai/face-anchor.js"
  );

  const dryRun = process.argv.includes("--dry-run");
  const admin = createAdminClient();

  // src/types/supabase.ts is stale (migration 00016 added face_anchor_pack);
  // runtime accepts the column, we just can't rely on generated types here.
  const { data: creatorsRaw, error } = await admin
    .from("creators")
    .select("id, face_anchor_pack")
    .is("face_anchor_pack" as never, null);

  if (error) {
    console.error("Failed to list creators:", error.message);
    process.exit(1);
  }

  const creators = (creatorsRaw ?? []) as unknown as Array<{
    id: string;
    face_anchor_pack: unknown;
  }>;

  if (creators.length === 0) {
    console.log("No creators need backfill. Done.");
    return;
  }

  console.log(
    `Found ${creators.length} creators without face anchor packs.`
  );

  // Pair each creator with their latest completed LoRA. Creators without
  // completed training can't run Stage 0 — they're skipped silently and
  // will auto-trigger when their training completes (see
  // src/inngest/functions/creator/face-anchor-generation.ts).
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
    for (const x of withLora) {
      console.log(`  would process: ${x.creatorId}`);
    }
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const [i, x] of withLora.entries()) {
    console.log(
      `[${i + 1}/${withLora.length}] Generating pack for ${x.creatorId}...`
    );
    try {
      const { anchorPaths } = await generateAndCacheFaceAnchorPack(x);
      console.log(`  OK — ${anchorPaths.length} anchors stored`);
      ok += 1;
    } catch (err) {
      console.error(
        `  FAIL:`,
        err instanceof Error ? err.message : err
      );
      fail += 1;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
