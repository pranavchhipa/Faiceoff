/**
 * Per-call cost tracker for the image-generation pipeline.
 *
 * Phase 5.3 — every external API call inside `run-generation.ts` (OpenRouter,
 * Gemini, Hive, Replicate) writes a row to `generation_costs` so the admin
 * dashboard can compute margin per generation. The function is fire-and-
 * forget: it never throws, never blocks the caller, and never logs at error
 * level on failure (Sentry warn only). Cost telemetry is nice-to-have, not
 * load-bearing.
 *
 * Caller responsibility:
 *   - Pass `generationId` (optional — calls with no generationId are skipped).
 *   - Compute `costUsdMicros` using `costToMicros()` + the COST_RATES map.
 *   - Pass `durationMs` measured at the call site (the wrapper doesn't know
 *     when the work started).
 */

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";

export type CostProvider = "gemini" | "openrouter" | "hive" | "replicate";

export interface TrackCostInput {
  /**
   * Generation row that this call should be attributed to. Optional — calls
   * outside the generation pipeline (e.g. the brief-suggester vision call
   * triggered from the Studio before a generation row exists) pass
   * `undefined`. Those calls are NOT tracked. We accept the gap because the
   * alternative — synthetic generation rows — would muddy the cost ledger.
   */
  generationId?: string | null;
  provider: CostProvider;
  /** Free-form call_type tag — e.g. "image_gen", "prompt_assembly", "upscale". */
  callType: string;
  promptTokens?: number;
  completionTokens?: number;
  /**
   * Cost in USD micro-cents (1 USD = 1_000_000 micros). BIGINT in the DB so
   * we never wrap. Use `costToMicros()` to convert from $ floats.
   */
  costUsdMicros?: number;
  /** Wall-clock duration of the call in milliseconds. */
  durationMs: number;
}

/**
 * USD price per 1M tokens (input | output) for each model we use.
 * Source: provider pricing pages, captured 2026-05. Update when rates change.
 * Output for image-gen models = cost per IMAGE (priced separately below).
 */
export const COST_RATES = {
  // Per 1M tokens
  "google/gemini-2.5-flash":          { input: 0.075, output: 0.30 },
  "meta-llama/llama-3.1-8b-instruct": { input: 0.05,  output: 0.08 },
  "openai/gpt-4o-mini":               { input: 0.15,  output: 0.60 },
  "openai/text-embedding-3-small":    { input: 0.02,  output: 0.0 },
  // Per call (image / safety check / upscale)
  "gemini-3-pro-image":               { perCall: 0.04   }, // ~$0.04/image
  "hive-moderation":                  { perCall: 0.001  }, // ~$0.001/check
  "real-esrgan":                      { perCall: 0.0015 }, // ~$0.0015/upscale
} as const;

/**
 * Convert a USD float to BIGINT-safe integer micros.
 * Example: 0.075 → 75_000 (i.e. 7.5 cents → 75_000 micro-cents).
 */
export function costToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * Compute total cost from token usage. Returns 0 if model isn't in COST_RATES.
 */
export function computeTokenCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = (COST_RATES as Record<string, { input?: number; output?: number }>)[model];
  if (!rate || rate.input == null) return 0;
  const inputUsd = (promptTokens / 1_000_000) * (rate.input ?? 0);
  const outputUsd = (completionTokens / 1_000_000) * (rate.output ?? 0);
  return costToMicros(inputUsd + outputUsd);
}

/**
 * Per-call (non-token) cost in micros. Returns 0 if unknown.
 */
export function perCallCostMicros(model: string): number {
  const rate = (COST_RATES as Record<string, { perCall?: number }>)[model];
  if (!rate || rate.perCall == null) return 0;
  return costToMicros(rate.perCall);
}

/**
 * Fire-and-forget insert into `generation_costs`. Never throws.
 *
 * Calls with no generationId are silently skipped — we don't synthesize
 * orphan rows for pre-generation calls (e.g. Studio vision suggestions).
 */
export async function trackCost(input: TrackCostInput): Promise<void> {
  if (!input.generationId) return;

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("generation_costs").insert({
      generation_id: input.generationId,
      provider: input.provider,
      call_type: input.callType,
      prompt_tokens: input.promptTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
      cost_usd_micros: input.costUsdMicros ?? null,
      duration_ms: input.durationMs,
    });

    if (error) {
      Sentry.captureMessage("[cost-tracker] insert failed", {
        level: "warning",
        extra: {
          generation_id: input.generationId,
          provider: input.provider,
          call_type: input.callType,
          db_error: error.message,
        },
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: "cost-tracker" },
      extra: {
        generation_id: input.generationId,
        provider: input.provider,
        call_type: input.callType,
      },
    });
  }
}
