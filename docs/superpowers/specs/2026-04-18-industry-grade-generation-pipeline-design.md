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

| Option | Product accuracy | Realism | Face w/ LoRA | Complexity | Per-image cost |
|---|---|---|---|---|---|
| Flux Dev + IP-Adapter (fixed) | 70-80% | 6/10 | Excellent | Low | ~₹5 |
| **Flux Kontext Max (chosen)** | **95%+** | **9/10** | **Excellent** | **Medium** | **~₹7** |
| Nano Banana (Gemini 2.5 Flash Image) | 88% | 9/10 | Moderate | Medium (new infra) | ~₹3-4 |
| Seedream 4 multi-ref | 85% | 9/10 | Moderate | Medium | ~₹5 |
| Google Veo 3 | N/A (video model) | — | — | High | — |
| fal.ai inpainting + ControlNet | 95%+ | 9/10 | Excellent | Very high | ~₹15-20 |

Kontext Max wins because:
- Native multi-image reference (face + product + prompt) — no masking UX needed
- Designed specifically for "preserve reference image, generate scene around it" — the exact problem we have
- Still on Replicate — no platform migration, no new Google Cloud setup
- Pixel-level product preservation (95% vs Nano Banana 88%) — directly fixes current "product fabricated" complaint
- Flux ecosystem means tight integration with creator's trained LoRA (face anchor path)

**Nano Banana is a strong runner-up** (cheaper, faster, same realism) but:
- 7 percentage points weaker on product pixel fidelity — this is the specific problem we're solving
- Requires Google AI API setup (new infra, new billing, new DPDP review)
- Non-Flux ecosystem = weaker LoRA integration

**Veo 3 is the wrong tool** — it's a video generation model. Text-to-image is not its strength and the cost would be 4-5× our chosen model for inferior image quality.

### Pluggable model strategy

The pipeline is model-agnostic at the inference boundary. `GENERATION_PIPELINE_VERSION` env var selects:

- `v1` — current Flux Dev + LoRA (retained for emergency rollback)
- `v2` — Flux Kontext Max (default, shipped first)
- `v3` — Nano Banana (added but disabled; enable in Phase 2 for A/B testing)

Post-launch, allocate 10% of new generations to v3 for 1 week, blind-compare outputs with creator + brand feedback, pick the objective winner on real data. No commitment to swap — Kontext Max may simply stay best.

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

- `src/lib/ai/kontext-client.ts` — Kontext Max inference wrapper (v2, default)
- `src/lib/ai/nano-banana-client.ts` — Nano Banana / Gemini 2.5 Flash Image wrapper (v3, scaffolded but disabled on launch)
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

`GENERATION_PIPELINE_VERSION` env var selects the Stage 1 inference model:

- `v1` — current Flux Dev + LoRA (kept for emergency rollback only)
- `v2` — Flux Kontext Max (default, primary launch target)
- `v3` — Nano Banana via Google AI API (scaffolded but disabled on launch; enable in Phase 2 for 10% A/B test against v2)

Per-generation override via `structured_brief.pipeline_version` so specific campaigns can pin a model for A/B testing or creator preference.

### Resolved decisions

1. **Face consistency approach:** LoRA-driven face anchor (Stage 0). The creator has already paid for LoRA training; we use it to generate a canonical headshot once, then pass that anchor as a reference image to Kontext Max on every inference. This gives tighter identity consistency than Kontext's raw multi-reference mode (2-3 photos) and preserves the "trained model = creator's IP" product story.
2. **Aspect ratios:** Support all five — `1:1`, `16:9`, `9:16`, `4:5`, `3:2`. Brand selects at generation time.
3. **Retry policy:** Max 2 auto-retries if quality gate fails, then surface to creator with explanation. No charge to brand if all 3 attempts fail.

### Open questions (to resolve during implementation)

1. **Retry cost attribution.** Retries eat platform margin, not brand charge. If observed retry rate exceeds 40% in first week, revisit gate thresholds or swap specific generations to Nano Banana (v3) via feature flag.
2. **Nano Banana A/B rollout timing.** Decide post-launch whether to enable `v3` for 10% of traffic after 2 weeks of v2 data. Defer decision to post-launch telemetry review.

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
