import { z } from 'zod'

// ---------------------------------------------------------------------------
// Submit a structured brief -- all fields required except product_image_url
// and additional_notes
// ---------------------------------------------------------------------------
export const submitBriefSchema = z.object({
  category: z
    .string()
    .min(1, 'Category is required')
    .max(50, 'Category must be at most 50 characters')
    .trim(),
  subcategory: z
    .string()
    .min(1, 'Subcategory is required')
    .max(50, 'Subcategory must be at most 50 characters')
    .trim(),
  setting: z
    .string()
    .min(1, 'Setting is required')
    .max(200, 'Setting must be at most 200 characters')
    .trim(),
  mood: z
    .string()
    .min(1, 'Mood is required')
    .max(100, 'Mood must be at most 100 characters')
    .trim(),
  lighting: z
    .string()
    .min(1, 'Lighting is required')
    .max(100, 'Lighting must be at most 100 characters')
    .trim(),
  composition: z
    .string()
    .min(1, 'Composition is required')
    .max(200, 'Composition must be at most 200 characters')
    .trim(),
  product_image_url: z
    .string()
    .url('Invalid product image URL')
    .max(2048, 'URL must be at most 2048 characters')
    .nullable()
    .optional(),
  additional_notes: z
    .string()
    .max(500, 'Additional notes must be at most 500 characters')
    .trim()
    .nullable()
    .optional(),
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:5", "3:2"]).default("1:1"),
  pipeline_version: z.enum(["v1", "v2", "v3"]).optional(),
})

export type SubmitBriefInput = z.infer<typeof submitBriefSchema>

// ---------------------------------------------------------------------------
// Create campaign
// ---------------------------------------------------------------------------
export const createCampaignSchema = z.object({
  creator_id: z.string().uuid('Invalid creator ID'),
  name: z
    .string()
    .min(1, 'Campaign name is required')
    .max(150, 'Campaign name must be at most 150 characters')
    .trim(),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .trim()
    .nullable()
    .optional(),
  budget_paise: z
    .number()
    .int('Budget must be a whole number (paise)')
    .positive('Budget must be greater than 0')
    .min(10_000, 'Minimum budget is ₹100 (10000 paise)'),
  max_generations: z
    .number()
    .int('Max generations must be a whole number')
    .positive('Max generations must be greater than 0')
    .max(1000, 'Max generations must be at most 1000'),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
