export type TransactionType =
  | 'topup'
  | 'escrow_lock'
  | 'escrow_release'
  | 'payout'
  | 'refund'
  | 'commission'

export type TransactionDirection = 'credit' | 'debit'

// Legacy shape used by the archived wallet_transactions_archive table
// (migration 00027). New ledgers live in credit_transactions,
// escrow_ledger, platform_revenue_ledger — see src/domains/credit/types.ts
// and the Chunk C design doc.
export interface WalletTransaction {
  id: string
  user_id: string
  type: TransactionType
  amount_paise: number // always positive
  direction: TransactionDirection
  reference_id: string | null // generation_id or legacy payment_id
  reference_type: string | null // 'generation', 'payout', etc.
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
