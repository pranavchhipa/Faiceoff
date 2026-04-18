# v2 Pipeline Rollout Playbook (Nano Banana Pro)

Operational guide for rolling out the v2 generation pipeline (Gemini 3 Pro
Image via Google AI + Clarity upscaler + quality gate) with v3 (Flux Kontext
Max) as per-campaign fallback and v1 (Flux Dev + LoRA) as emergency rollback.

## Pre-launch checklist

- [ ] Migration `00016_industry_grade_pipeline.sql` applied to prod Supabase
      (adds `creators.face_anchor_pack`, `generations.base_image_url`,
      `upscaled_url`, `quality_scores`, `generation_attempts`,
      `provider_prediction_id`, `pipeline_version`).
- [ ] Env vars set on Vercel (Production scope):
  - `GENERATION_PIPELINE_VERSION=v2`
  - `GOOGLE_AI_API_KEY` (Nano Banana Pro; rotate from the key that was
    committed to `.env.local` during development)
  - `NANO_BANANA_MODEL=gemini-3.0-pro-image`
  - `NANO_BANANA_FALLBACK_MODEL=gemini-2.5-flash-image`
  - `REPLICATE_KONTEXT_MODEL=black-forest-labs/flux-kontext-max` (v3
    fallback)
  - `REPLICATE_UPSCALER_MODEL=philz1337x/clarity-upscaler`
  - `REPLICATE_CLIP_MODEL`, `REPLICATE_AESTHETIC_MODEL` (quality gate)
- [ ] Google AI Studio account verified for Gemini 3 Pro Image access
      (production quota, billing enabled).
- [ ] DPDP privacy notice updated to disclose Google AI (LLC) as a
      processor for face likeness generation.
- [ ] Replicate account verified for Kontext Max access (v3 fallback +
      upscaler + quality-gate models).
- [ ] Backfill run: `npx tsx scripts/backfill-face-anchors.ts` (dry-run
      first, then real run). Cost: ~₹10-15 per creator × N creators.
- [ ] Smoke test passed: `npx tsx scripts/smoke-test-pipeline.ts`. Confirm
      the resulting generation reaches `ready_for_approval` with
      `quality_scores.passed = true`.
- [ ] Dog-food round: 5 test creators × 2 products each = 10 real
      generations, reviewed by a human for likeness + prompt adherence.

## Rollout sequence

1. **Deploy with `GENERATION_PIPELINE_VERSION=v1`** — no behavior change,
   the new code paths ship dark.
2. **Run backfill** for face anchor packs on all existing creators with a
   completed LoRA. Monitor Replicate dashboard for throttling; this is a
   one-shot batch.
3. **Flip env var to `v2`** for 20% of traffic. Until the codebase has a
   traffic-split primitive, do this via a per-campaign override: set
   `structured_brief.pipeline_version = "v2"` on new campaigns in a
   chosen cohort, keep the env at `v1`.
4. **Monitor for 48 hours** using the SQL queries below. Target bands:
   - retry rate < 30%
   - Google safety block rate < 5%
   - P95 latency < 45s end-to-end (compliance → ready_for_approval)
   - cost per gen < ₹12
   - no spike in creator rejection rate vs. v1 baseline
5. **If clean** → flip env to `v2` globally for 100% traffic.
6. **Keep `v1` ready** as emergency rollback for 2 weeks. `v3` (Kontext
   Max) remains a permanent per-campaign fallback for tricky cases.

## Rollback procedure

**Global rollback (emergency):**

1. Set env `GENERATION_PIPELINE_VERSION=v1` in Vercel.
2. Redeploy (no code change required). Takes ~60s for the rollout to
   complete; in-flight generations continue on whatever version they
   started, new ones pick up v1.

**Per-generation override (targeted):**

Insert `pipeline_version` into the brief on new generations:

```sql
-- Force v3 Kontext for a reflective/foreign-packaging campaign
update campaigns
set structured_brief_defaults = jsonb_set(
  coalesce(structured_brief_defaults, '{}'::jsonb),
  '{pipeline_version}', '"v3"'
)
where id = '<campaign_id>';
```

(The pipeline reads `structured_brief.pipeline_version` via
`resolvePipelineVersion()` before falling back to the env var.)

## Monitoring queries

Run these during the 48-hour monitoring window and after any incident.

```sql
-- Retry rate last 24h (v2 only)
select
  count(*) filter (where generation_attempts > 1)::float
    / nullif(count(*), 0) as retry_rate,
  count(*) as total
from generations
where created_at > now() - interval '24 hours'
  and pipeline_version = 'v2';

-- P95 end-to-end latency (v2, successful)
select
  percentile_cont(0.95) within group (
    order by extract(epoch from (updated_at - created_at))
  ) as p95_seconds,
  count(*) as n
from generations
where pipeline_version = 'v2'
  and status in ('ready_for_approval', 'approved');

-- Quality gate fail reasons breakdown (v2)
select
  quality_scores->'failedOn' as failed_on,
  count(*) as n
from generations
where pipeline_version = 'v2'
  and (quality_scores->>'passed')::boolean = false
group by 1
order by 2 desc;

-- Auto-fallback rate: v2 requested but v3 prediction recorded
-- (indicates Google safety block triggered the Kontext retry)
select
  count(*) filter (where provider_prediction_id like 'kontext_%')::float
    / nullif(count(*), 0) as v3_fallback_rate
from generations
where pipeline_version = 'v2'
  and created_at > now() - interval '24 hours';

-- Upscaler usage (should be ~100% when output < 2048px)
select
  count(*) filter (where upscaled_url is not null)::float
    / nullif(count(*), 0) as upscale_rate
from generations
where pipeline_version = 'v2'
  and status in ('ready_for_approval', 'approved');
```

Cross-check with Sentry (error rate) and PostHog (end-user rejection
rate on approvals) before declaring the window clean.

## Phase 2 — v3 routing rules (2-4 weeks post-launch)

Once v2 data is in hand, formalise v3 routing for campaign types where
Nano Banana struggles:

- Reflective products (glass, jewelry, chrome)
- Foreign-script packaging (non-Latin scripts on the can/box)
- Any brand with > 10% Google safety block rate in their historical data

Implementation: set `structured_brief.pipeline_version = "v3"` on the
campaign row at creation time. No code change needed — the router
already reads it.

## Key file references

- Pipeline router: `src/lib/ai/pipeline-router.ts` (`runPipelineInference`)
- Nano Banana client: `src/lib/ai/nano-banana.ts`
- Kontext Max client: `src/lib/ai/kontext-max.ts`
- Face anchor pack: `src/lib/ai/face-anchor.ts`
- Quality gate: `src/lib/ai/quality-gate.ts`
- Upscaler: `src/lib/ai/upscaler.ts`
- Inngest pipeline: `src/inngest/functions/generation/generation-pipeline.ts`
- Version resolver: `src/lib/ai/pipeline-version.ts`
- Scripts: `scripts/backfill-face-anchors.ts`,
  `scripts/smoke-test-pipeline.ts`
