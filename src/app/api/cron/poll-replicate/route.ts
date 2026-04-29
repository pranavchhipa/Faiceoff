// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/poll-replicate
//
// Every-15-min cron. Fallback for missed Replicate webhooks.
// Polls 'processing' generations older than 5 minutes and syncs their status.
//
// If Replicate reports 'succeeded' → finalize (run Hive + create approval).
// If Replicate reports 'failed'/'canceled' → refund + mark failed.
// If still 'starting'/'processing' → leave alone.
//
// Protected by CRON_SECRET bearer token.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve, BillingError } from "@/lib/billing";

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/poll-replicate] CRON_SECRET env var not set");
    return false;
  }
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`;
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[] | string | null;
  error?: string | null;
}

interface StuckGenRow {
  id: string;
  brand_id: string;
  cost_paise: number;
  replicate_prediction_id: string;
  collab_session_id: string;
  creator_id?: string;
}

async function fetchReplicatePrediction(
  predictionId: string,
): Promise<ReplicatePrediction | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      console.warn(
        `[cron/poll-replicate] Replicate ${res.status} for prediction ${predictionId}`,
      );
      return null;
    }
    return res.json() as Promise<ReplicatePrediction>;
  } catch (err) {
    console.error(
      `[cron/poll-replicate] fetch prediction ${predictionId} error:`,
      err,
    );
    return null;
  }
}

async function finalizeGeneration(
  admin: any,
  gen: StuckGenRow,
  prediction: ReplicatePrediction,
): Promise<void> {
  // Extract image URL from Replicate output
  const output = prediction.output;
  let imageUrl: string | null = null;
  if (Array.isArray(output) && output.length > 0) {
    imageUrl = output[0];
  } else if (typeof output === "string") {
    imageUrl = output;
  }

  if (!imageUrl) {
    console.warn(
      `[cron/poll-replicate] prediction ${prediction.id} succeeded but no output URL`,
    );
    // Treat as failed
    await admin
      .from("generations")
      .update({ status: "failed" })
      .eq("id", gen.id);
    await refundGeneration(admin, gen);
    return;
  }

  // Run Hive content moderation inline
  const hiveKey = process.env.HIVE_API_KEY;
  let hivePassed = true;
  let hiveScore: unknown = null;

  if (hiveKey) {
    try {
      const hiveRes = await fetch("https://api.thehive.ai/api/v2/task/sync", {
        method: "POST",
        headers: {
          Authorization: `Token ${hiveKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { image: { url: imageUrl } },
        }),
      });

      if (hiveRes.ok) {
        const hiveData = (await hiveRes.json()) as {
          status?: Array<{
            response?: {
              output?: Array<{ classes?: Array<{ class: string; score: number }> }>;
            };
          }>;
        };
        hiveScore = hiveData;

        // Check for unsafe content (>0.7 score on any NSFW class)
        const classes =
          hiveData?.status?.[0]?.response?.output?.[0]?.classes ?? [];
        const unsafeClasses = [
          "yes_sexual_activity",
          "yes_explicit_nudity",
          "yes_suggestive",
        ];
        for (const cls of classes) {
          if (unsafeClasses.includes(cls.class) && cls.score > 0.7) {
            hivePassed = false;
            break;
          }
        }
      }
    } catch (err) {
      console.warn(
        `[cron/poll-replicate] Hive check error for gen ${gen.id} (allow through):`,
        err,
      );
    }
  }

  if (!hivePassed) {
    // Hive blocked — needs admin review
    await admin
      .from("generations")
      .update({
        status: "needs_admin_review",
        image_url: imageUrl,
        hive_score: hiveScore,
      })
      .eq("id", gen.id);
    return;
  }

  // Hive passed — create approval
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await admin
    .from("generations")
    .update({
      status: "ready_for_approval",
      image_url: imageUrl,
      hive_score: hiveScore,
    })
    .eq("id", gen.id);

  // Get creator_id from campaigns if not on gen
  let creatorId = gen.creator_id;
  if (!creatorId && gen.collab_session_id) {
    const { data: campaign } = await admin
      .from("collab_sessions")
      .select("creator_id")
      .eq("id", gen.collab_session_id)
      .maybeSingle();
    creatorId = campaign?.creator_id;
  }

  await admin
    .from("approvals")
    .insert({
      generation_id: gen.id,
      creator_id: creatorId ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .catch((err: unknown) => {
      // If unique violation, approval already exists — ok
      const msg = err instanceof Error ? err.message : String(err);
      if (!/unique|23505/i.test(msg)) {
        console.error(`[cron/poll-replicate] approval insert error for gen ${gen.id}:`, msg);
      }
    });
}

async function refundGeneration(admin: any, gen: StuckGenRow): Promise<void> {
  await admin
    .from("generations")
    .update({ status: "failed" })
    .eq("id", gen.id);

  if (gen.brand_id && gen.cost_paise) {
    try {
      await releaseReserve({
        brandId: gen.brand_id,
        amountPaise: gen.cost_paise,
        generationId: gen.id,
      });
    } catch (err) {
      if (err instanceof BillingError) {
        console.warn(
          `[cron/poll-replicate] releaseReserve billing warn for gen ${gen.id}:`,
          err.message,
        );
      } else {
        console.error(
          `[cron/poll-replicate] releaseReserve error for gen ${gen.id}:`,
          err,
        );
      }
    }
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("generations")
    .select("id, brand_id, cost_paise, replicate_prediction_id, collab_session_id, creator_id")
    .eq("status", "processing")
    .lt("created_at", fiveMinutesAgo)
    .not("replicate_prediction_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[cron/poll-replicate] query error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as StuckGenRow[];

  let finalized = 0;
  let failed = 0;
  let stillProcessing = 0;

  for (const gen of rows) {
    const prediction = await fetchReplicatePrediction(gen.replicate_prediction_id);
    if (!prediction) {
      stillProcessing++;
      continue;
    }

    switch (prediction.status) {
      case "succeeded":
        await finalizeGeneration(admin, gen, prediction);
        finalized++;
        break;

      case "failed":
      case "canceled": {
        await refundGeneration(admin, gen);
        failed++;
        break;
      }

      case "starting":
      case "processing":
      default:
        stillProcessing++;
        break;
    }
  }

  console.log(
    `[cron/poll-replicate] checked=${rows.length} finalized=${finalized} failed=${failed} still_processing=${stillProcessing}`,
  );

  return NextResponse.json({
    checked: rows.length,
    finalized,
    failed,
    still_processing: stillProcessing,
  });
}
