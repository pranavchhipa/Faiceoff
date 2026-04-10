export interface CreatorComplianceVector {
  id: string
  creator_id: string
  blocked_concept: string // human-readable: "nudity", "alcohol", "political"
  embedding: number[] // 1536-dim from text-embedding-3-small
  created_at: string
}

export interface ComplianceCheckResult {
  passed: boolean
  layer: 1 | 2 | 3 | 4
  failed_reason: string | null
  similarity_score: number | null // for Layer 2
  hive_categories: Record<string, number> | null // for Layer 3
  face_similarity: number | null // for Layer 3
}
