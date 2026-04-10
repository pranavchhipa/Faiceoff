import { z } from 'zod'

// ---------------------------------------------------------------------------
// Creator signup -- first step of creator onboarding
// ---------------------------------------------------------------------------
export const creatorSignupSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be at most 255 characters'),
  phone: z
    .string()
    .regex(/^\+91\d{10}$/, 'Phone must be a valid Indian mobile number (+91XXXXXXXXXX)')
    .nullable()
    .optional(),
  display_name: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be at most 100 characters')
    .trim(),
})

export type CreatorSignupInput = z.infer<typeof creatorSignupSchema>

// ---------------------------------------------------------------------------
// Brand signup
// ---------------------------------------------------------------------------
export const brandSignupSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be at most 255 characters'),
  company_name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(200, 'Company name must be at most 200 characters')
    .trim(),
  gst_number: z
    .string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      'Invalid GST number format',
    )
    .nullable()
    .optional(),
})

export type BrandSignupInput = z.infer<typeof brandSignupSchema>

// ---------------------------------------------------------------------------
// KYC document submission
// ---------------------------------------------------------------------------
export const submitKycSchema = z.object({
  document_type: z.enum(['aadhaar', 'pan', 'passport', 'voter_id'], {
    message: 'Document type is required',
  }),
  document_file_key: z
    .string()
    .min(1, 'Document file key is required')
    .max(500, 'Document file key must be at most 500 characters'),
})

export type SubmitKycInput = z.infer<typeof submitKycSchema>

// ---------------------------------------------------------------------------
// Link Instagram handle
// ---------------------------------------------------------------------------
export const linkInstagramSchema = z.object({
  handle: z
    .string()
    .min(1, 'Instagram handle is required')
    .max(30, 'Instagram handle must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9._]+$/,
      'Instagram handle may only contain letters, numbers, periods and underscores',
    )
    .transform((h: string) => h.replace(/^@/, '')), // strip leading @ if present
})

export type LinkInstagramInput = z.infer<typeof linkInstagramSchema>
