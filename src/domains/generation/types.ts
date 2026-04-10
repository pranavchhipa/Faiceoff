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
