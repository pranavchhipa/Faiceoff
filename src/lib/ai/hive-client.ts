import {
  trackCost,
  perCallCostMicros,
} from "@/lib/observability/cost-tracker";

const HIVE_API_URL = 'https://api.thehive.ai/api/v2/task/sync';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface HiveModerationResult {
  status: Array<{
    response: {
      output: Array<{
        classes: Array<{
          class: string;
          score: number;
        }>;
      }>;
    };
  }>;
}

/**
 * Submit an image URL to Hive Moderation for content safety analysis.
 *
 * Phase 5.3 — when `generationId` is provided, records a row in
 * `generation_costs` at the hive-moderation flat rate (~$0.001/check).
 */
export async function checkImage(
  imageUrl: string,
  opts?: { generationId?: string | null },
): Promise<HiveModerationResult> {
  const apiKey = getEnvVar('HIVE_API_KEY');
  const startedAt = Date.now();

  const response = await fetch(HIVE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: imageUrl,
    }),
    // Bounded — the pipeline's catch around checkImage is fail-open, but a
    // hung fetch is never caught and leaves the generation stuck.
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Hive Moderation API error (${response.status}): ${errorBody}`,
    );
  }

  const json = (await response.json()) as HiveModerationResult;
  const durationMs = Date.now() - startedAt;

  await trackCost({
    generationId: opts?.generationId ?? null,
    provider: "hive",
    callType: "safety_check",
    costUsdMicros: perCallCostMicros("hive-moderation"),
    durationMs,
  });

  return json;
}
