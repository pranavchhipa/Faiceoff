# Industry-Grade Generation Pipeline

**Date:** 2026-04-18
**Status:** Approved (revised 2026-04-18 to swap primary model to Nano Banana Pro)
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
│ Stage 0: Face Anchor Pack (cached per creator, one-time)    │
│   Creator LoRA (FLUX.1 Dev) → 3-5 varied anchor headshots   │
│   (neutral / smile / 3⁄4 profile / soft side / front close)  │
│   Cached in R2 as `face-anchors/{creator_id}/*.png`         │
│   Invalidated on LoRA retrain.                              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Multi-Reference Scene Generation                   │
│   Model: Nano Banana Pro (Gemini 3 Pro Image, via           │
│          google-genai SDK; fallback gemini-2.5-flash-image) │
│   Inputs:                                                    │
│     - face_reference_pack: 3-5 anchors from Stage 0         │
│     - product_reference: brand's uploaded product photo     │
│     - prompt: cinematic LLM-assembled text                  │
│     - safety/grounding settings                             │
│   Output: 2K/4K native render at requested aspect ratio     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Quality Gate                                        │
│   - CLIP similarity (output ↔ product photo) ≥ 0.82         │
│   - Face embedding distance (output ↔ anchor pack) ≤ 0.25   │
│   - Aesthetic score (improved-aesthetic-predictor) ≥ 6.5    │
│   Fail → auto-retry Stage 1 with adjusted seed (max 2)      │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Upscale (conditional)                               │
│   Skipped if Stage 1 output ≥ 2048px on long edge (native)  │
│   Otherwise: philz1337x/clarity-upscaler 2× for detail pass │
│   Natural film grain, texture enhancement                   │
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

### Why Nano Banana Pro over alternatives

| Option | Product accuracy | Realism | Face consistency | Complexity | Per-image cost |
|---|---|---|---|---|---|
| Flux Dev + IP-Adapter (fixed) | 70-80% | 6/10 | Excellent (LoRA) | Low | ~₹5 |
| Flux Kontext Max | 95%+ | 9/10 | Good (LoRA anchor) | Medium | ~₹7 |
| **Nano Banana Pro (chosen)** | **95%+** | **9.5/10** | **Strong (face pack)** | **Medium** | **~₹3-4** |
| Seedream 4 multi-ref | 85% | 9/10 | Moderate | Medium | ~₹5 |
| Google Veo 3 | N/A (video model) | — | — | High | — |
| fal.ai inpainting + ControlNet | 95%+ | 9/10 | Excellent | Very high | ~₹15-20 |

Nano Banana Pro wins because:
- **Best-in-class photorealism** — Google's 2025 flagship for product photography / lifestyle composites; visibly cleaner skin texture, lighting physics, catchlights vs Flux ecosystem
- **Native multi-image reference** with strong "keep THIS product exactly, place it into THIS scene with THIS face" grounding
- **Native 4K output** — Stage 3 upscaler becomes optional, saving ~₹2/image
- **Cheaper** — ~₹3-4 vs Kontext Max ~₹7 (≈50% lower Stage 1 cost)
- **Faster** — typical 8-15s vs 20-35s for Kontext Max
- **Better text rendering** — product labels, pack copy, brand marks stay legible

**Trade-off vs Kontext Max:** Nano Banana isn't LoRA-native, so face identity relies on a **multi-reference anchor pack** (3-5 varied LoRA-generated headshots) rather than a single canonical anchor. Empirically this matches LoRA-only consistency when the pack captures enough angle/expression variance. The creator's trained LoRA is still the source of the anchor pack — **the creator's "likeness IP" remains the LoRA**; Nano Banana is just a better downstream scene compositor.

**Kontext Max stays as v3 fallback** for any edge cases where Nano Banana degrades (e.g. highly reflective products, brand-specific foreign-language typography, strict Google AI safety blocks).

**Veo 3 is the wrong tool** — it's a video generation model. Text-to-image is not its strength and the cost would be 4-5× our chosen model for inferior image quality.

### Pluggable model strategy

The pipeline is model-agnostic at the inference boundary. `GENERATION_PIPELINE_VERSION` env var selects:

- `v1` — current Flux Dev + LoRA (retained for emergency rollback)
- `v2` — **Nano Banana Pro** (default, shipped first)
- `v3` — Flux Kontext Max (scaffolded as fallback; enable per-campaign for edge cases)

Per-generation override via `structured_brief.pipeline_version` so specific campaigns can pin a model.

Post-launch, allocate ~10% of new generations to v3 on reflective-product or foreign-script campaigns where v2 has been observed to drift, blind-compare with creator + brand feedback, refine the routing rules. No commitment to swap — Nano Banana Pro may simply stay best everywhere.

### Cinematic prompt template

The LLM prompt assembler (`src/lib/ai/prompt-assembler.ts`) produces output in this template:

```
A candid photograph of a person [holding | wearing | posing with]
[product_name]. [scene_description].

Technical: shot on Sony A7IV with 85mm f/1.4 prime, natural window light
from camera left, golden hour, shallow depth of field, subsurface scattering
on skin, visible pores, 35mm film grain, slight chromatic aberration,
unretouched, Kodak Portra 400 color palette.

Composition: [composition_hint from brief]. Aspect: [aspect_ratio].

CRITICAL: Preserve the exact product from the reference image — its shape,
colour, label typography, and any text on the pack must remain pixel-faithful.
Preserve the exact person identity from the face reference pack — same facial
structure, skin tone, and hair.
```

Safety/negative guidance (passed to Nano Banana as grounding text since the
Gemini SDK doesn't take a separate `negative_prompt` field):
```
Avoid: plastic skin, waxy finish, cgi look, 3d render, airbrushing,
over-smooth skin, glossy artificial highlights, uncanny eyes, distorted
anatomy, extra fingers, malformed hands, blurry focus, jpeg artifacts,
watermarks, text overlays, fabricated logos, product text distortion.
```

(For v3/Kontext Max fallback path we additionally emit this as a structured
`negative_prompt` parameter — v2 merges it into the user text.)

### Quality gate thresholds

Empirically tuned (will be calibrated against real data post-launch):

- **CLIP similarity ≥ 0.82** — output image embedding vs product image embedding. Below this, product drifted meaningfully.
- **Face embedding distance ≤ 0.25** (cosine distance from 1) — output face vs any of creator's 10+ reference photos. Above this, face is wrong.
- **Aesthetic score ≥ 6.5/10** — `improved-aesthetic-predictor` model. Below this, composition or lighting is bad.

Retry policy: max 2 auto-retries with incremented seed. After 2 failures, mark generation `quality_gate_failed` and surface to creator with explanation. No charge to brand if all 3 attempts fail.

### Cost model

Per delivered image:
- Nano Banana Pro (Gemini 3 Pro Image): ₹3.50
- Clarity Upscaler (conditional, skipped ≈70% of time): ₹0.60 amortised
- Quality checks (3 models): ₹0.50
- Retry buffer (avg 1.3× gen cost): ₹1.50-2
- **Typical: ₹6-8. Worst case: ₹12.**

Per creator onboarding (one-time):
- LoRA training: ₹250-300 (same as today)
- Face anchor pack pre-generation (new, Stage 0, 3-5 images): ₹10-15

Brand pricing:
- Current: ₹100-200 per gen
- **New "Pro" pricing: ₹300-500 per gen** (margins improve meaningfully vs Kontext plan — a real gross margin uplift)

### Database changes

Add columns to `generations` and `creators` tables via migration:

```sql
-- migration 00016_industry_grade_pipeline.sql
ALTER TABLE generations
  ADD COLUMN base_image_url text,           -- Stage 1 output (pre-upscale, may equal delivery if native 4K)
  ADD COLUMN upscaled_url text,             -- Stage 3 output (null if skipped)
  ADD COLUMN quality_scores jsonb,           -- { clip, face, aesthetic, passed, failedOn }
  ADD COLUMN generation_attempts smallint DEFAULT 1,
  ADD COLUMN provider_prediction_id text,    -- Google operation id OR Replicate prediction id
  ADD COLUMN pipeline_version text NOT NULL DEFAULT 'v1';

ALTER TABLE creators
  ADD COLUMN face_anchor_pack jsonb,         -- array of R2 URLs: [url1, url2, ...]
  ADD COLUMN face_anchor_generated_at timestamptz;

-- Face anchor pack is invalidated by comparing
-- creators.face_anchor_generated_at vs the latest
-- creator_lora_models.training_completed_at. No extra column needed.

CREATE INDEX idx_generations_quality_scores ON generations USING gin (quality_scores);
```

### New files

- `src/lib/ai/nano-banana-client.ts` — Nano Banana Pro / Gemini Image client (v2, default)
- `src/lib/ai/kontext-client.ts` — Flux Kontext Max client (v3, fallback, scaffolded + working)
- `src/lib/ai/upscaler.ts` — Clarity Upscaler wrapper (used when Stage 1 output < 2048px)
- `src/lib/ai/quality-gate.ts` — CLIP + face + aesthetic checks
- `src/lib/ai/face-anchor.ts` — Stage 0 face anchor pack generation + caching
- `src/lib/ai/pipeline-router.ts` — v2/v3 dispatch with common inference shape
- `src/lib/ai/pipeline-config.ts` — env-driven model slugs + feature flag
- `src/inngest/functions/creator/face-anchor-generation.ts` — one-time per creator (triggered post-LoRA-training)

### Modified files

- `src/inngest/functions/generation/generation-pipeline.ts` — replace Step 3 (image generation) with the new 4-stage pipeline; keep Steps 1, 2, 4, 5 unchanged
- `src/lib/ai/prompt-assembler.ts` — new cinematic template + structured negative prompt
- `src/domains/generation/types.ts` — add `QualityScores`, `PipelineVersion`, `AspectRatio` types
- `src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx` — aspect ratio selector
- `src/app/(dashboard)/dashboard/generations/[id]/page.tsx` — surface quality scores + attempt count
- `src/app/api/generations/create/route.ts` — accept `aspect_ratio` in body

### Fallback / feature flag

`GENERATION_PIPELINE_VERSION` env var selects the Stage 1 inference model:

- `v1` — current Flux Dev + LoRA (kept for emergency rollback only)
- `v2` — **Nano Banana Pro** (default, primary launch target)
- `v3` — Flux Kontext Max (scaffolded and working, used for edge cases per-campaign)

Per-generation override via `structured_brief.pipeline_version` so specific campaigns can pin a model for A/B testing or reflective-product edge cases.

### Google AI integration notes

- **SDK:** `@google/genai` (npm) — current official SDK for Gemini 2.5/3 image models
- **API key:** `GOOGLE_AI_API_KEY` (new env var, obtained from Google AI Studio)
- **Data residency / DPDP:** Google AI Studio calls route to Google data centres. We already send creator reference photos to Replicate; Google AI is an additional processor that must be disclosed in the privacy notice update bundled with this release.
- **Safety blocks:** Gemini image models can refuse prompts that mention real brands / trademarks in safety-sensitive contexts. Fallback path: if v2 returns `BLOCKED_SAFETY`, auto-retry once on v3 (Kontext Max) for that specific generation before marking it `quality_gate_failed`.

### Resolved decisions

1. **Face consistency approach:** LoRA-driven **face anchor pack** of 3-5 varied headshots (Stage 0). The creator has already paid for LoRA training; we use it to generate a small pack once (neutral / smile / three-quarter / soft side / front close), then pass that pack as multi-reference to Nano Banana Pro on every inference. This matches LoRA-only consistency empirically and preserves the "trained model = creator's IP" product story — the LoRA is still the source of the creator's face.
2. **Aspect ratios:** Support all five — `1:1`, `16:9`, `9:16`, `4:5`, `3:2`. Brand selects at generation time.
3. **Retry policy:** Max 2 auto-retries if quality gate fails, then surface to creator with explanation. No charge to brand if all 3 attempts fail.
4. **Upscaler is conditional, not mandatory:** skip when Stage 1 delivers ≥ 2048px (typical on Nano Banana Pro 2K/4K settings), run Clarity Upscaler only on lower-res outputs. Saves ~₹2/image on the common path.

### Open questions (to resolve during implementation)

1. **Retry cost attribution.** Retries eat platform margin, not brand charge. If observed retry rate exceeds 40% in first week, revisit gate thresholds or swap specific generations to v3 (Kontext Max) via feature flag.
2. **Google safety block rate.** Track % of v2 attempts refused by Gemini safety. If > 5%, formalise v2 → v3 auto-fallback as Task/hotfix.
3. **Face pack size sweet spot.** Start with 4 (neutral / smile / ¾ / side). If face-identity gate fail rate > 15%, expand to 5-6; if consistently >99% pass, shrink to 3 to save Stage 0 cost.

## Success criteria

- ≥ 95% of delivered images pass visual "is this AI?" test by unbiased reviewer (n=30 sample)
- Product text/logo reads pixel-perfect in ≥ 98% of outputs
- Zero "fabricated product" reports from brands over first 100 generations
- Per-image cost ≤ ₹12 (P95)
- Generation time ≤ 45s P95 (faster than Kontext plan's 60s thanks to Nano Banana latency + fewer upscales)
- Retry rate ≤ 30%
- Google safety block rate ≤ 5%

## Out of scope (for this iteration)

- Video generation
- Multi-product scenes (e.g. "person using laptop with phone on desk")
- Transparent/reflective product edge cases (glass bottles, jewelry) — may need inpainting fallback or v3 routing in a future iteration
- Training data quality improvements (requiring 15-20 photos vs current 4) — separate initiative
