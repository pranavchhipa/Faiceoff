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

// LoRA training was retired in migration 00026. The live pipeline anchors
// identity via the creator's reference photos directly (Flux Kontext Max).
