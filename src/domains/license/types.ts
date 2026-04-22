// ─────────────────────────────────────────────────────────────────────────────
// License domain types + Zod schemas
// Ref spec §5.1 (license_requests, creator_license_listings)
// Ref plan Task 20-23 (Phase 5 route contracts)
// ─────────────────────────────────────────────────────────────────────────────
//
// All API-shaped inputs are Zod-validated. Row shapes mirror DB columns so the
// route handlers can return them unchanged in responses.
//
// Money is paise (integer). Never use `number` without a `_paise` suffix.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

import { type LicenseState } from "./workflow";
import { LICENSE_TEMPLATE_KEYS, type LicenseTemplate } from "./templates";

// Re-export so downstream can import the whole license surface from one module.
export {
  LICENSE_STATES,
  canTransition,
  assertTransition,
  isTerminal,
} from "./workflow";
export type { LicenseState } from "./workflow";
export { LICENSE_TEMPLATES, LICENSE_TEMPLATE_KEYS } from "./templates";
export type { LicenseTemplate } from "./templates";

// ── Listing price/quota/validity bounds (MVP safety) ─────────────────────────
// These are enforced in Zod so the creator can't create a listing with e.g.
// a ₹0 price or a 10,000-image quota. Aligned with spec intent & the DB
// check constraints (price_paise > 0, image_quota > 0, validity_days > 0).

export const LISTING_MIN_PRICE_PAISE = 100000; // ₹1,000
export const LISTING_MAX_PRICE_PAISE = 10000000; // ₹1,00,000 (₹1L MVP cap)
export const LISTING_MIN_QUOTA = 1;
export const LISTING_MAX_QUOTA = 200;
export const LISTING_MIN_VALIDITY_DAYS = 7;
export const LISTING_MAX_VALIDITY_DAYS = 365;

// ── Zod: listings ────────────────────────────────────────────────────────────

export const LicenseTemplateEnumSchema = z.enum(LICENSE_TEMPLATE_KEYS);

export const CreateListingSchema = z.object({
  template: LicenseTemplateEnumSchema,
  price_paise: z
    .number()
    .int()
    .min(LISTING_MIN_PRICE_PAISE)
    .max(LISTING_MAX_PRICE_PAISE),
  image_quota: z.number().int().min(LISTING_MIN_QUOTA).max(LISTING_MAX_QUOTA),
  validity_days: z
    .number()
    .int()
    .min(LISTING_MIN_VALIDITY_DAYS)
    .max(LISTING_MAX_VALIDITY_DAYS),
});

export type CreateListingInput = z.infer<typeof CreateListingSchema>;

/**
 * PATCH schema: all fields optional, but if present must pass the same bounds.
 * We deliberately forbid editing `template` once a listing exists — to change
 * template, the creator deletes the old listing and creates a new one. The
 * DB's `unique (creator_id, template)` constraint backs this up anyway.
 */
export const UpdateListingSchema = z
  .object({
    price_paise: z
      .number()
      .int()
      .min(LISTING_MIN_PRICE_PAISE)
      .max(LISTING_MAX_PRICE_PAISE)
      .optional(),
    image_quota: z
      .number()
      .int()
      .min(LISTING_MIN_QUOTA)
      .max(LISTING_MAX_QUOTA)
      .optional(),
    validity_days: z
      .number()
      .int()
      .min(LISTING_MIN_VALIDITY_DAYS)
      .max(LISTING_MAX_VALIDITY_DAYS)
      .optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (obj) =>
      obj.price_paise !== undefined ||
      obj.image_quota !== undefined ||
      obj.validity_days !== undefined ||
      obj.is_active !== undefined,
    { message: "must provide at least one field to update" },
  );

export type UpdateListingInput = z.infer<typeof UpdateListingSchema>;

// ── Row shapes ───────────────────────────────────────────────────────────────

export interface CreatorLicenseListingRow {
  id: string;
  creator_id: string;
  template: LicenseTemplate;
  price_paise: number;
  image_quota: number;
  validity_days: number;
  ig_post_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatorJoinFields {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_handle: string | null;
}

export interface CreatorLicenseListingWithCreator
  extends CreatorLicenseListingRow {
  creator: CreatorJoinFields;
}

// ── Zod: license request ─────────────────────────────────────────────────────

export const CreateLicenseRequestSchema = z.object({
  listing_id: z.string().uuid(),
  brand_notes: z.string().max(1000).optional(),
  reference_image_urls: z
    .array(z.string().url())
    .max(5)
    .optional(),
});

export type CreateLicenseRequestInput = z.infer<
  typeof CreateLicenseRequestSchema
>;

// ── Zod: accept / reject ─────────────────────────────────────────────────────

export const AcceptLicenseSchema = z.object({
  scroll_depth_percent: z.number().int().min(0).max(100),
});
export type AcceptLicenseInput = z.infer<typeof AcceptLicenseSchema>;

export const RejectLicenseSchema = z.object({
  reason: z.string().min(10).max(500),
});
export type RejectLicenseInput = z.infer<typeof RejectLicenseSchema>;

// ── Row shape: license_requests ─────────────────────────────────────────────

export interface LicenseRequestRow {
  id: string;
  listing_id: string;
  creator_id: string;
  brand_id: string;
  status: LicenseState;

  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
  image_quota: number;
  validity_days: number;
  release_per_image_paise: number;

  images_requested: number;
  images_approved: number;
  images_rejected: number;

  requested_at: string;
  accepted_at: string | null;
  activated_at: string | null;
  expires_at: string | null;
  completed_at: string | null;

  brand_notes: string | null;
  creator_reject_reason: string | null;

  created_at: string;
  updated_at: string;
}

export interface LicenseContractRow {
  id: string;
  license_request_id: string;
  pdf_r2_path: string;
  pdf_hash_sha256: string;
  template_version: string;
  creator_accepted_at: string;
  creator_accept_ip: string;
  creator_accept_user_agent: string;
  brand_accepted_at: string | null;
  brand_accept_ip: string | null;
  brand_accept_user_agent: string | null;
  terms_json: unknown;
  created_at: string;
}

// ── Checkout breakdown (returned on POST /api/licenses/request) ──────────────

export interface CheckoutBreakdown {
  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
}
