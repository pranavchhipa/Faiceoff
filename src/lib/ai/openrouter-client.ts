import {
  trackCost,
  computeTokenCostMicros,
} from "@/lib/observability/cost-tracker";

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * OpenAI/OpenRouter chat message content. String works for text-only models.
 * Array form is required for vision — each part is either
 *   { type: 'text', text }                    — text segment
 *   { type: 'image_url', image_url: { url } } — image (URL or data URL)
 */
export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatMessageContentPart[];
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  /**
   * Phase 5.3 — attach the resulting cost row to a specific generation.
   * Optional; when omitted the call is NOT tracked (Studio-side suggestions
   * fire before the generation row exists and pass undefined).
   */
  generationId?: string | null;
  /**
   * Phase 5.3 — coarse tag for the cost ledger (e.g. "prompt_assembly",
   * "brief_suggester", "compliance_llm"). Surfaces in admin dashboards.
   */
  callType?: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Send a chat completion request to OpenRouter (OpenAI-compatible API).
 *
 * Phase 5.3 — every call automatically records a row in `generation_costs`
 * when `generationId` is provided. Cost is computed from `usage.prompt_tokens`
 * + `usage.completion_tokens` against the model rate in COST_RATES.
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  const apiKey = getEnvVar('OPENROUTER_API_KEY');
  const startedAt = Date.now();

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'Faiceoff',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorBody}`,
    );
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const durationMs = Date.now() - startedAt;

  // Fire-and-forget cost telemetry. Awaited intentionally so the row is
  // inserted before the function returns — keeps the ledger consistent
  // even if the caller exits the request soon after. trackCost itself
  // never throws.
  await trackCost({
    generationId: options.generationId ?? null,
    provider: "openrouter",
    callType: options.callType ?? "chat_completion",
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
    costUsdMicros: computeTokenCostMicros(
      options.model,
      json.usage?.prompt_tokens ?? 0,
      json.usage?.completion_tokens ?? 0,
    ),
    durationMs,
  });

  return json;
}
