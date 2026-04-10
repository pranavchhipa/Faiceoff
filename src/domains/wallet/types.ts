export type TransactionType =
  | 'topup'
  | 'escrow_lock'
  | 'escrow_release'
  | 'payout'
  | 'refund'
  | 'commission'

export type TransactionDirection = 'credit' | 'debit'

export interface WalletTransaction {
  id: string
  user_id: string
  type: TransactionType
  amount_paise: number // always positive
  direction: TransactionDirection
  reference_id: string | null // razorpay payment_id, generation_id, etc.
  reference_type: string | null // 'razorpay_payment', 'generation', 'payout'
  balance_after_paise: number
  description: string
  created_at: string
}

export type DisputeStatus =
  | 'open'
  | 'investigating'
  | 'resolved_refund'
  | 'resolved_no_action'
  | 'closed'

export interface Dispute {
  id: string
  generation_id: string
  raised_by: string // user_id
  reason: string
  status: DisputeStatus
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
}
