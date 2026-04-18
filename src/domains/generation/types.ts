import type { ComplianceCheckResult } from '../compliance/types'

export type GenerationStatus =
  | 'draft'
  | 'compliance_check'
  | 'generating'
  | 'output_check'
  | 'ready_for_approval'
  | 'approved'
  | 'rejected'
  | 'failed'

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export interface Campaign {
  id: string
  brand_id: string
  creator_id: string
  name: string
  description: string | null
  budget_paise: number
  spent_paise: number
  generation_count: number
  max_generations: number
  status: CampaignStatus
  created_at: string
  updated_at: string
}

export interface Generation {
  id: string
  campaign_id: string
  brand_id: string
  creator_id: string
  structured_brief: StructuredBrief
  assembled_prompt: string | null
  replicate_prediction_id: string | null
  image_url: string | null // staging bucket
  delivery_url: string | null // R2 CDN
  status: GenerationStatus
  compliance_result: ComplianceCheckResult | null
  cost_paise: number
  created_at: string
  updated_at: string
}

export interface StructuredBrief {
  category: string
  subcategory: string
  setting: string
  mood: string
  lighting: string
  composition: string
  product_image_url: string | null
  additional_notes: string | null
}

/** Pipeline model version, selected via GENERATION_PIPELINE_VERSION env or per-brief override */
export type PipelineVersion = "v1" | "v2" | "v3";

/** Supported output aspect ratios. v2 (Nano Banana Pro) accepts these natively. */
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "3:2";

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 2048, height: 2048 },
  "16:9": { width: 2304, height: 1296 },
  "9:16": { width: 1296, height: 2304 },
  "4:5": { width: 1792, height: 2240 },
  "3:2": { width: 2304, height: 1536 },
};

/** Upscale is skipped when native output >= this on long edge */
export const UPSCALE_MIN_EDGE = 2048;

/** Quality gate scores persisted on generation row after Stage 2 */
export interface QualityScores {
  /** CLIP cosine similarity between output and product reference image (0-1) */
  clip: number;
  /** Face similarity vs creator anchor pack, 1 - cosine distance (0-1, higher=better) */
  face: number;
  /** Aesthetic predictor score (0-10) */
  aesthetic: number;
  /** Whether the combined gate passed */
  passed: boolean;
  /** Which threshold failed if not passed, for telemetry */
  failedOn: Array<"clip" | "face" | "aesthetic"> | null;
}

export const QUALITY_GATE_THRESHOLDS = {
  clip: 0.82,
  face: 0.75,
  aesthetic: 6.5,
} as const;
