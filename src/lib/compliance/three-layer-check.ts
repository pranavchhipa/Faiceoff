/**
 * Three-layer content compliance check for Faiceoff generation briefs.
 *
 * Layers (run in order, short-circuit on first failure):
 *  1. Blocked Categories  — fast hard rules from creator_blocked_categories table
 *  2. Vector Similarity   — semantic search against creator_compliance_vectors (pgvector)
 *  3. LLM Classification  — nuanced review via OpenRouter
 *
 * Fail-open policy: if an external API call fails in layers 2 or 3, the error
 * is logged to Sentry and the check continues to the next layer. This prevents
 * external API downtime from blocking all generations. Errors in layer 1
 * (a pure DB query) are fatal and propagate up to the caller.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { chatCompletion } from '@/lib/ai/openrouter-client';
import type { Category } from './category-mapping';
import { detectCategories, CATEGORY_KEYWORDS } from './category-mapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceInput {
  creatorId: string;
  structuredBrief: {
    product?: string;
    scene?: string;
    mood?: string;
    aesthetic?: string;
    [k: string]: unknown;
  };
}

export interface ComplianceResult {
  passed: boolean;
  /** Which layer caught the violation. null when passed = true. */
  layer: 1 | 2 | 3 | null;
  reason?: string;
  blocked_category?: string;
  similarity_score?: number;
  llm_verdict?: string;
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class ComplianceError extends Error {
  readonly code: string;
  constructor(message: string, code = 'COMPLIANCE_ERROR') {
    super(message);
    this.name = 'ComplianceError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flat string from the structured brief fields for embedding/matching. */
function briefToText(brief: ComplianceInput['structuredBrief']): string {
  return [brief.product, brief.scene, brief.mood, brief.aesthetic]
    .filter(Boolean)
    .join(' ');
}

/** Silently log to Sentry (if available) and console. Does not throw. */
function logWarning(message: string, extra?: Record<string, unknown>): void {
  console.warn('[compliance]', message, extra ?? '');
  // Sentry is optional — only capture if init was called
  try {
    // Dynamic import avoids pulling Sentry into non-server environments
    // We call it synchronously in a fire-and-forget fashion
    void import('@/lib/observability/sentry').then(({ Sentry }) => {
      Sentry.captureMessage(message, {
        level: 'warning',
        extra,
      });
    });
  } catch {
    // Ignore Sentry unavailability
  }
}

/**
 * Get a 1536-dim text embedding via OpenRouter (text-embedding-3-small).
 * Uses the OpenAI-compatible embeddings endpoint on OpenRouter.
 */
async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ComplianceError('OPENROUTER_API_KEY not set', 'CONFIG_ERROR');

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'Faiceoff',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ComplianceError(
      `Embedding API error (${response.status}): ${body}`,
      'EMBEDDING_API_ERROR',
    );
  }

  const json = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return json.data[0].embedding;
}

// ---------------------------------------------------------------------------
// Layer 1: Blocked Categories
// ---------------------------------------------------------------------------

async function checkLayer1(
  creatorId: string,
  briefText: string,
): Promise<ComplianceResult | null> {
  const admin = createAdminClient();

  // Fetch this creator's blocked categories
  const { data: blockedRows, error } = await admin
    .from('creator_blocked_categories' as never)
    .select('category')
    .eq('creator_id', creatorId);

  if (error) {
    throw new ComplianceError(
      `DB error reading creator_blocked_categories: ${error.message}`,
      'DB_ERROR',
    );
  }

  if (!blockedRows || (blockedRows as Array<{ category: string }>).length === 0) {
    return null; // No blocked categories → pass
  }

  const blockedSet = new Set(
    (blockedRows as Array<{ category: string }>).map((r) => r.category as Category),
  );

  const detectedCategories = detectCategories(briefText);
  for (const cat of detectedCategories) {
    if (blockedSet.has(cat)) {
      const matchedKeyword = CATEGORY_KEYWORDS[cat].find((kw) => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(briefText);
      });
      return {
        passed: false,
        layer: 1,
        reason: `Brief contains content from creator's blocked category '${cat}'`,
        blocked_category: cat,
        ...(matchedKeyword ? { reason: `Brief keyword '${matchedKeyword}' matches blocked category '${cat}'` } : {}),
      };
    }
  }

  return null; // No violations
}

// ---------------------------------------------------------------------------
// Layer 2: Vector Similarity
// ---------------------------------------------------------------------------

async function checkLayer2(
  creatorId: string,
  briefText: string,
): Promise<ComplianceResult | null> {
  const admin = createAdminClient();

  // Check if creator has any compliance vectors at all
  const { count } = await admin
    .from('creator_compliance_vectors' as never)
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId);

  if (!count || count === 0) {
    return null; // No vectors — skip this layer per spec
  }

  // Get embedding for the brief
  let embedding: number[];
  try {
    embedding = await getEmbedding(briefText);
  } catch (err) {
    logWarning('Layer 2: embedding API failed, skipping', {
      creatorId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null; // Fail-open
  }

  // pgvector cosine similarity query via raw SQL (Supabase doesn't support
  // the <=> operator through the REST query builder directly)
  const embeddingLiteral = `[${embedding.join(',')}]`;

  type SimilarityRpc = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>;
  const { data, error } = await (admin.rpc as unknown as SimilarityRpc)(
    'compliance_similarity_check',
    { p_creator_id: creatorId, p_embedding: embeddingLiteral },
  );

  // Fallback: if RPC doesn't exist, use a manual approach
  if (error && error.code === 'PGRST202') {
    // RPC not found — try alternative approach with raw query
    try {
      const result = await admin
        .from('creator_compliance_vectors' as never)
        .select('blocked_concept')
        .eq('creator_id', creatorId)
        .limit(1);

      // We can't do cosine similarity without pgvector RPC, so we skip layer 2
      logWarning('Layer 2: compliance_similarity_check RPC not found, skipping vector check', {
        creatorId,
      });
      return null;
    } catch {
      return null;
    }
  }

  if (error) {
    logWarning('Layer 2: similarity RPC failed, skipping', {
      creatorId,
      error: error.message,
    });
    return null; // Fail-open
  }

  const row = data as Array<{ blocked_concept: string; score: number }> | null;
  if (!row || row.length === 0) return null;

  const topResult = row[0];
  const SIMILARITY_THRESHOLD = 0.85;

  if (topResult.score > SIMILARITY_THRESHOLD) {
    return {
      passed: false,
      layer: 2,
      reason: `Brief is semantically similar to blocked concept '${topResult.blocked_concept}' (score: ${topResult.score.toFixed(3)})`,
      similarity_score: topResult.score,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layer 3: LLM Classification
// ---------------------------------------------------------------------------

async function checkLayer3(
  creatorId: string,
  briefText: string,
): Promise<ComplianceResult | null> {
  const admin = createAdminClient();

  // Fetch blocked categories for context
  const { data: blockedRows } = await admin
    .from('creator_blocked_categories' as never)
    .select('category')
    .eq('creator_id', creatorId);

  const blockedList = blockedRows
    ? (blockedRows as Array<{ category: string }>).map((r) => r.category).join(', ')
    : 'none';

  const prompt = `You are a content policy reviewer for Faiceoff, an AI likeness licensing platform operating in India.

A brand wants to generate an AI image using a creator's likeness. Review this brief and determine if it violates the content guidelines.

Generation brief: "${briefText}"
Creator's blocked content categories: ${blockedList}

Content guidelines prohibit:
- Content promoting alcohol, tobacco, gambling, or drugs
- Adult/explicit/sexual content
- Weapons and firearms
- Cryptocurrency or speculative finance promotions
- Politically sensitive content
- Religious content that could be divisive
- Any content the creator has explicitly blocked

Reply ONLY with valid JSON in this exact format: { "violates": boolean, "reason": string }
The reason must be a single concise sentence.`;

  let response: Awaited<ReturnType<typeof chatCompletion>>;
  try {
    response = await chatCompletion({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 150,
    });
  } catch (err) {
    logWarning('Layer 3: LLM classification failed, skipping', {
      creatorId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null; // Fail-open
  }

  const rawContent = response.choices[0]?.message?.content ?? '';

  let parsed: { violates: boolean; reason: string };
  try {
    // Extract JSON from the response (handles markdown code fences etc.)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    parsed = JSON.parse(jsonMatch[0]) as { violates: boolean; reason: string };
  } catch (err) {
    logWarning('Layer 3: Failed to parse LLM response, skipping', {
      creatorId,
      rawContent,
      error: err instanceof Error ? err.message : String(err),
    });
    return null; // Fail-open
  }

  if (parsed.violates) {
    return {
      passed: false,
      layer: 3,
      reason: parsed.reason,
      llm_verdict: parsed.reason,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run a 3-layer content compliance check for a generation brief.
 *
 * Short-circuits on first failure. External API failures are logged and
 * treated as pass (fail-open) to avoid blocking generations during outages.
 *
 * @throws {ComplianceError} Only for unrecoverable errors (e.g. DB connection failure)
 */
export async function runComplianceCheck(input: ComplianceInput): Promise<ComplianceResult> {
  const { creatorId, structuredBrief } = input;
  const briefText = briefToText(structuredBrief);

  // Layer 1: Blocked Categories (mandatory — DB errors propagate)
  const layer1Result = await checkLayer1(creatorId, briefText);
  if (layer1Result) return layer1Result;

  // Layer 2: Vector Similarity (fail-open on API errors)
  const layer2Result = await checkLayer2(creatorId, briefText);
  if (layer2Result) return layer2Result;

  // Layer 3: LLM Classification (fail-open on API errors)
  const layer3Result = await checkLayer3(creatorId, briefText);
  if (layer3Result) return layer3Result;

  return { passed: true, layer: null };
}
