import { z } from 'zod'

// ---------------------------------------------------------------------------
// Set compliance preferences -- array of blocked concept strings
// ---------------------------------------------------------------------------
export const setCompliancePrefsSchema = z.object({
  blocked_concepts: z
    .array(
      z
        .string()
        .min(1, 'Blocked concept must not be empty')
        .max(100, 'Blocked concept must be at most 100 characters')
        .trim()
        .toLowerCase(),
    )
    .min(1, 'At least one blocked concept is required')
    .max(50, 'At most 50 blocked concepts'),
})

export type SetCompliancePrefsInput = z.infer<typeof setCompliancePrefsSchema>
