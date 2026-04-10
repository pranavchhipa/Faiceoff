export interface CreatorCategory {
  id: string
  creator_id: string
  category: string // e.g. 'fashion', 'beauty', 'fitness'
  subcategories: string[]
  price_per_generation_paise: number // store in paise (INR * 100)
  is_active: boolean
}

export interface CreatorReferencePhoto {
  id: string
  creator_id: string
  storage_path: string
  face_embedding: number[] | null // 512-dim from InsightFace
  is_primary: boolean
  uploaded_at: string
}

export type LoraTrainingStatus = 'queued' | 'training' | 'completed' | 'failed'

export interface CreatorLoraModel {
  id: string
  creator_id: string
  replicate_model_id: string | null
  training_status: LoraTrainingStatus
  training_started_at: string | null
  training_completed_at: string | null
  sample_images: string[] // URLs of sample generations
  creator_approved: boolean
  version: number
}
