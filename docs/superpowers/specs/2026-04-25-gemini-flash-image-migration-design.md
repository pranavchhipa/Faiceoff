# Gemini 3.1 Flash Image Migration — Design

**Date:** 2026-04-25
**Status:** Approved (locked: a / a / b / b / b across 5 questions)

## Goal

Replace Flux Kontext Max (Replicate, prompt-only — no identity anchor was actually being passed) with **Gemini 3.1 Flash Image** via Direct Google AI API. Each generation receives 3 face refs + 1 product image + a strict-anchor prompt, producing sharper identity + product fidelity at ~₹4.10/gen.

## Locked Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Direct Google AI API** (`@google/genai` SDK, already installed) | Cheapest, native multi-image input, no Replicate margin. New env: `GEMINI_API_KEY`. |
| 2 | **Primary + 2 random face refs** | Primary always anchors identity; 2 random adds natural variety per gen. SQL: `ORDER BY is_primary DESC, random() LIMIT 3`. Handles <3 refs gracefully. |
| 3 | **Sync with `after()` + UI polling, 1 inline retry** | Brand sees instant 202 + "Generating…"; existing `session-poller.tsx` covers status polling. Same compute cost as pure-sync. |
| 4 | **Mandatory product image upload** | Already implemented in `start-campaign-sheet.tsx` — `productUrl` is required. No UI work. |
| 5 | **Strict anchor prompt template** | Hardcoded wrapper around the LLM-assembled creative prompt that locks identity + product fidelity. |

## Architecture

```
Brand → POST /api/campaigns/create
  → RPC create_campaign_with_escrow → returns generation_ids[]
  → for each genId: after(() => runGeneration(genId))   // NEW
  → return 201 immediately

runGeneration(genId):  // src/lib/ai/run-generation.ts (NEW)
  1. Fetch generation row (brief, creator_id, brand_id, cost_paise, assembled_prompt)
  2. If row missing assembled_prompt: build via assemblePromptWithLLM
  3. Pick 3 face refs: primary + 2 random from reference_photos
  4. Call gemini-client.generateImage({ faceRefs, productImage, anchorPrompt, aspectRatio })
       - 1 inline retry on transient failure
       - On second failure: status='failed' + releaseReserve (refund wallet)
  5. Hive content safety check (existing checkImage)
  6. Upload to R2 (generations/{genId}/raw.png)
  7. Insert approval row (48h expiry)
  8. Update generation row: status='ready_for_approval', image_url=...

Kill switch: IMAGE_PROVIDER env var
  - 'gemini' (default): runGeneration path
  - 'flux': legacy Replicate path (kept for instant rollback)
```

## File Changes

### New files
- `src/lib/ai/gemini-client.ts` — `generateImage()` wrapper. Fetches face refs + product img as bytes, sends multi-part request to Gemini, returns image buffer. 1 inline retry.
- `src/lib/ai/run-generation.ts` — orchestrator. Pure server-side function called from `after()`.

### Modified files
- `src/app/api/campaigns/create/route.ts` — replace dead `inngest.send` with `after(() => Promise.allSettled(generation_ids.map(runGeneration)))`.
- `src/app/api/generations/create/route.ts` — direct-gen path: replace Replicate submit with `after(() => runGeneration(genId))`. Keep Flux path behind `IMAGE_PROVIDER='flux'` flag.
- `.env.example` — add `GEMINI_API_KEY` + `IMAGE_PROVIDER`.

### Untouched
- `start-campaign-sheet.tsx` (product image upload already exists)
- `prompt-assembler.ts` (still builds creative prompt; gemini-client wraps it)
- `webhooks/replicate/route.ts` (kept as legacy fallback)
- `cron/poll-replicate/route.ts` (still cleans stuck Flux gens during cutover)

## Anchor Prompt Template

Hardcoded in `gemini-client.ts`:

```
CRITICAL CONSTRAINTS (do not deviate):
- The person's face, skin tone, hair, and facial features MUST exactly
  match the first 3 reference images. This is the same individual.
- The product MUST exactly match image 4. Same shape, color, label,
  branding. Do not redesign, restyle, or imagine variations.

CREATIVE BRIEF:
{assembled_prompt}

OUTPUT: photorealistic, {aspect_ratio}, commercial commercial-shoot quality.
```

## Failure Handling

| Failure | Action |
|---------|--------|
| Gemini transient (5xx, rate limit) | 1 inline retry, same inputs |
| Gemini hard fail (after retry) | `status='failed'` + `releaseReserve` (wallet refund). Credit refund via `rollback_credit_for_generation` RPC (existing). |
| Hive flags unsafe | `status='needs_admin_review'` (no refund — admin decides) |
| R2 upload fail | `status='needs_admin_review'` (image bytes lost — manual replay) |
| Reference photo fetch 404 | Use whatever loaded; if zero photos → fail with `no_reference_photos` |

## Cutover Plan

1. Ship code with `IMAGE_PROVIDER=gemini` default, deploy.
2. Monitor first 20 gens manually for face/product fidelity.
3. If drift: flip `IMAGE_PROVIDER=flux` env var on Vercel → instant rollback (no code redeploy).
4. After 1 week green: delete `webhooks/replicate` + `cron/poll-replicate` + Replicate SDK dep.

## Self-Review

- ✅ All 5 locked decisions reflected
- ✅ Refund path covered (wallet + credit)
- ✅ No placeholders
- ✅ Kill switch present
- ✅ File structure scoped (2 new files, 3 modified)
