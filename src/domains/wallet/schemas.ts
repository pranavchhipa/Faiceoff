import { z } from 'zod'

// ---------------------------------------------------------------------------
// Topup wallet -- amount in paise, minimum ₹100 (10000 paise)
// ---------------------------------------------------------------------------
export const topupWalletSchema = z.object({
  amount_paise: z
    .number()
    .int('Amount must be a whole number (paise)')
    .min(10_000, 'Minimum topup is ₹100 (10000 paise)')
    .max(10_000_000, 'Maximum topup is ₹1,00,000 (10000000 paise)'),
})

export type TopupWalletInput = z.infer<typeof topupWalletSchema>

// ---------------------------------------------------------------------------
// Raise a dispute against a generation
// ---------------------------------------------------------------------------
export const raiseDisputeSchema = z.object({
  generation_id: z.string().uuid('Invalid generation ID'),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(2000, 'Reason must be at most 2000 characters')
    .trim(),
})

export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>
