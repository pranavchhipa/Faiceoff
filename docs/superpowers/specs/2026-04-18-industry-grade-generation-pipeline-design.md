# Industry-Grade Generation Pipeline

**Date:** 2026-04-18
**Status:** Approved, ready for implementation planning
**Author:** Pranav Chhipa (via Claude)

## Problem

Current pipeline produces images that look obviously AI-generated and fail to preserve the brand's actual product. Two root causes:

1. **Broken IP-Adapter call.** `generation-pipeline.ts:143-149` passes `image_prompt` + `image_prompt_strength` to the creator's LoRA model (output of `ostris/flux-dev-lora-trainer`). That model is a standard FLUX.1 Dev fine-tune which silently ignores IP-Adapter parameters. Product photos uploaded by brands never influence the output.
2. **FLUX.1 Dev + default prompting produces "plastic" skin, CGI-like lighting, and over-smooth textures.** No realism LoRA, no negative prompts, no post-processing, no upscaling.

Examples from production (Apr 2026):
- "Pourfect Coffee" campaign: person and can look plausible but scene is obviously AI (waxy skin, uncanny eyes, inconsistent shadow).
- "YoYo Hairserum" campaign: product bottle is a **fabricated look-alike** rather than the real uploaded product; person has distorted anatomy.

## Goal

Deliver commercial, magazine-grade output where (a) the product is pixel-identical to the brand's uploaded photo and (b) the scene is indistinguishable from a real photograph at normal viewing distance.

Non-goal: real-time generation. 45-60s per delivered image is acceptable for this use case.

## Design

### Pipeline (5 stages)

```
brand uploads product photo + picks creator
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 0: Face Anchor (cached per creator, one-time)         │
│   Creator LoRA (FLUX.1 Dev) → canonical studio headshot     │
│   Cached in R2 as `face-anchors/{creator_id}.png`           │
│   Invalidated on LoRA retrain.                              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Multi-Reference Scene Generation                   │
│   Model: black-forest-labs/flux-kontext-max                 │
│   Inputs:                                                    │
│     - face_reference: face anchor from Stage 0              │
│     - product_reference: brand's uploaded product photo     │
│     - prompt: cinematic LLM-assembled text                  │
│     - negative_prompt: anti-plastic hard-coded string       │
│   Output: 1024×1024 or 1024×1280 base render                │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Quality Gate                                        │
│   - CLIP similarity (output ↔ product photo) ≥ 0.82         │
│   - Face embedding distance (output ↔ reference photos) ≤ .25│
│   - Aesthetic score (improved-aesthetic-predictor) ≥ 6.5    │
│   Fail → auto-retry Stage 1 with adjusted seed (max 2)      │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Upscale                                             │
│   Model: philz1337x/clarity-upscaler                        │
│   2× resolution (2048×2048 or 2048×2560)                    │
│   Detail enhancement, natural film grain                    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Output Safety (existing)                            │
│   Hive content moderation (existing step, unchanged)        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
   Store in R2, create approval record (existing)
```

### Why Flux Kontext Max over alternatives

| Option | Product accuracy | Realism | Complexity | Per-image cost |
|---|---|---|---|---|
| Flux Dev + IP-Adapter (fixed) | 70-80% | 6/10 | Low | ~₹5 |
| **Flux Kontext Max (chosen)** | **95%+** | **9/10** | **Medium** | **~₹10-12** |
| Seedream 4 multi-ref | 85% | 9/10 | Medium | ~₹6-8 |
| fal.ai inpainting + ControlNet | 95%+ | 9/10 | Very high | ~₹15-20 |

Kontext Max wins because:
- Native multi-image reference (face + product + prompt) — no masking UX needed
- Designed specifically for "preserve reference image, generate scene around it" — the exact problem we have
- Still on Replicate — no platform migration, no LoRA re-hosting
- Pixel-level product preservation without manual masking

Seedream 4 is a close runner-up at lower cost but slightly weaker product preservation in testing.

### Cinematic prompt template

The LLM prompt assembler (`src/lib/ai/prompt-assembler.ts`) produces output in this template:

```
A candid photograph of [trigger_word] person [holding | wearing | posing with]
[product_name]. [scene_description].

Technical: shot on Sony A7IV with 85mm f/1.4 prime, natural window light
from camera left, golden hour, shallow depth of field, subsurface scattering
on skin, visible pores, 35mm film grain, slight chromatic aberration,
unretouched, Kodak Portra 400 color palette.

Composition: [composition_hint from brief]. Aspect: [aspect_ratio].
```

Negative prompt (hard-coded, always applied):
```
plastic skin, waxy, cgi, 3d render, airbrushed, over-smooth, smooth skin,
perfect skin, glossy, artificial, uncanny, distorted anatomy, extra fingers,
six fingers, malformed hands, blurry, low quality, jpeg artifacts, watermark,
text overlay, logo mismatch, product text distortion.
```

### Quality gate thresholds

Empirically tuned (will be calibrated against real data post-launch):

- **CLIP similarity ≥ 0.82** — output image embedding vs product image embedding. Below this, product drifted meaningfully.
- **Face embedding distance ≤ 0.25** (cosine distance from 1) — output face vs any of creator's 10+ reference photos. Above this, face is wrong.
- **Aesthetic score ≥ 6.5/10** — `improved-aesthetic-predictor` model. Below this, composition or lighting is bad.

Retry policy: max 2 auto-retries with incremented seed. After 2 failures, mark generation `quality_gate_failed` and surface to creator with explanation. No charge to brand if all 3 attempts fail.

### Cost model

Per delivered image:
- Kontext Max: ₹6.70
- Clarity Upscaler: ₹2.00
- Quality checks (3 models): ₹0.50
- Retry buffer (avg 1.3× gen cost): ₹2-3
- **Typical: ₹11-12. Worst case: ₹17.**

Per creator onboarding (one-time):
- LoRA training: ₹250-300 (same as today)
- Face anchor pre-generation (new, Stage 0): ₹3

Brand pricing:
- Current: ₹100-200 per gen
- **New "Pro" pricing: ₹300-500 per gen** (margins improve, not squeeze)

### Database changes

Add columns to `generations` table via migration:

```sql
-- migration 00020_industry_grade_pipeline.sql
ALTER TABLE generations
  ADD COLUMN base_image_url text,           -- Stage 1 output (1024px)
  ADD COLUMN upscaled_url text,             -- Stage 3 output (2048px+)
  ADD COLUMN quality_scores jsonb,           -- { clip, face, aesthetic }
  ADD COLUMN generation_attempts smallint DEFAULT 1,
  ADD COLUMN kontext_prediction_id text;

ALTER TABLE creators
  ADD COLUMN face_anchor_url text,           -- cached Stage 0 output
  ADD COLUMN face_anchor_generated_at timestamptz;

-- Face anchor is invalidated by comparing
-- creators.face_anchor_generated_at vs the latest
-- creator_lora_models.training_completed_at. No extra column needed.

CREATE INDEX idx_generations_quality_scores ON generations USING gin (quality_scores);
```

### New files

- `src/lib/ai/kontext-client.ts` — Kontext Max inference wrapper
- `src/lib/ai/upscaler.ts` — Clarity Upscaler wrapper
- `src/lib/ai/quality-gate.ts` — CLIP + face + aesthetic checks
- `src/lib/ai/face-anchor.ts` — Stage 0 face anchor generation and caching
- `src/inngest/functions/creator/face-anchor-generation.ts` — one-time per creator (triggered post-LoRA-training)

### Modified files

- `src/inngest/functions/generation/generation-pipeline.ts` — replace Step 3 (image generation) with the new 4-stage pipeline; keep Steps 1, 2, 4, 5 unchanged
- `src/lib/ai/prompt-assembler.ts` — new cinematic template + hard-coded negative prompt
- `src/domains/generation/types.ts` — add `QualityScores` type
- `src/app/(dashboard)/dashboard/generations/[id]/page.tsx` — surface quality scores and upscale resolution in generation detail view

### Fallback / feature flag

- `GENERATION_PIPELINE_VERSION` env var: `"v1"` (current Flux Dev path) | `"v2"` (new Kontext path). Default v2 in prod, v1 retained for rollback.
- Per-generation override via `structured_brief.pipeline_version` so we can A/B test on specific campaigns.

### Open questions (to resolve during implementation)

1. **Kontext Max + creator LoRA interaction.** Kontext is not a LoRA-stacked model. The design uses LoRA once (Stage 0) to generate a face anchor, then Kontext uses the anchor as a reference image. Validate during implementation whether this 2-stage face consistency is adequate, or whether Kontext's native multi-reference mode (passing 2-3 raw creator photos) is sufficient without LoRA at all.
2. **Aspect ratios.** Currently `1:1` only. Kontext Max supports `1:1`, `16:9`, `9:16`, `4:5`, `3:2`. Add all five — brands want Instagram Story (9:16) and Reel (9:16) formats urgently.
3. **Retry cost attribution.** Retries eat platform margin, not brand charge. If retry rate exceeds 40%, revisit thresholds or fallback to Seedream 4 for that gen.

## Success criteria

- ≥ 95% of delivered images pass visual "is this AI?" test by unbiased reviewer (n=30 sample)
- Product text/logo reads pixel-perfect in ≥ 98% of outputs
- Zero "fabricated product" reports from brands over first 100 generations
- Per-image cost ≤ ₹17 (P95)
- Generation time ≤ 60s P95
- Retry rate ≤ 30%

## Out of scope (for this iteration)

- Video generation
- Multi-product scenes (e.g. "person using laptop with phone on desk")
- Transparent/reflective product edge cases (glass bottles, jewelry) — may need inpainting fallback in a future iteration
- Training data quality improvements (requiring 15-20 photos vs current 4) — separate initiative
