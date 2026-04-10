import { z } from 'zod'

// ---------------------------------------------------------------------------
// Decide on an approval -- feedback required when rejecting
// ---------------------------------------------------------------------------
export const decideApprovalSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'revision_requested'], {
      message: 'Approval decision is required',
    }),
    feedback: z
      .string()
      .min(1, 'Feedback must not be empty')
      .max(1000, 'Feedback must be at most 1000 characters')
      .trim()
      .nullable()
      .optional(),
  })
  .refine(
    (data: { status: string; feedback?: string | null }) => {
      if (data.status === 'rejected' || data.status === 'revision_requested') {
        return data.feedback != null && data.feedback.length > 0
      }
      return true
    },
    {
      message: 'Feedback is required when rejecting or requesting revision',
      path: ['feedback'],
    },
  )

export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>
