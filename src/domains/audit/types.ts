export type AuditAction =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'creator.kyc_submitted'
  | 'creator.kyc_approved'
  | 'creator.kyc_rejected'
  | 'creator.consent_signed'
  | 'creator.consent_revoked'
  | 'creator.lora_trained'
  | 'creator.lora_approved'
  | 'generation.created'
  | 'generation.compliance_passed'
  | 'generation.compliance_failed'
  | 'generation.completed'
  | 'generation.failed'
  | 'approval.approved'
  | 'approval.rejected'
  | 'approval.expired'
  | 'wallet.topup'
  | 'wallet.payout'
  | 'wallet.escrow_locked'
  | 'wallet.escrow_released'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'data.deletion_requested'
  | 'data.deletion_completed'

export type ActorType = 'user' | 'system' | 'admin'

export interface AuditEntry {
  id: string
  actor_id: string
  actor_type: ActorType
  action: AuditAction
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}
