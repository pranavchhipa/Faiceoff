export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revision_requested'

export interface Approval {
  id: string
  generation_id: string
  creator_id: string
  brand_id: string
  status: ApprovalStatus
  feedback: string | null // creator's feedback on rejection
  decided_at: string | null
  expires_at: string // 72 hours from creation
  created_at: string
}
