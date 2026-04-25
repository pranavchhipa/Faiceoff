import { z } from 'zod'

// ---------------------------------------------------------------------------
// Set creator categories
// ---------------------------------------------------------------------------
export const setCategoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        category: z
          .string()
          .min(1, 'Category is required')
          .max(50, 'Category must be at most 50 characters')
          .trim(),
        subcategories: z
          .array(
            z
              .string()
              .min(1, 'Subcategory must not be empty')
              .max(50, 'Subcategory must be at most 50 characters')
              .trim(),
          )
          .max(20, 'At most 20 subcategories per category')
          .default([]),
      }),
    )
    .min(1, 'At least one category is required')
    .max(10, 'At most 10 categories'),
})

export type SetCategoriesInput = z.infer<typeof setCategoriesSchema>

// ---------------------------------------------------------------------------
// Set pricing -- price must be > 0, stored in paise (INR * 100)
// ---------------------------------------------------------------------------
export const setPricingSchema = z.object({
  category_id: z.string().uuid('Invalid category ID'),
  price_per_generation_paise: z
    .number()
    .int('Price must be a whole number (paise)')
    .positive('Price must be greater than 0')
    .max(100_000_00, 'Price must be at most ₹1,00,000'), // ₹1 lakh cap
})

export type SetPricingInput = z.infer<typeof setPricingSchema>

// ---------------------------------------------------------------------------
// Upload reference photos -- max 10 files per batch
// ---------------------------------------------------------------------------
export const uploadPhotosSchema = z.object({
  photo_keys: z
    .array(
      z
        .string()
        .min(1, 'Photo key must not be empty')
        .max(500, 'Photo key must be at most 500 characters'),
    )
    .min(1, 'At least one photo is required')
    .max(10, 'At most 10 photos per upload'),
})

export type UploadPhotosInput = z.infer<typeof uploadPhotosSchema>

// LoRA approval schema retired in migration 00026 — the live pipeline uses
// reference photos as identity anchors and has no per-creator LoRA review step.
