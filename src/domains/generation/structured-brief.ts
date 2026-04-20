import { z } from "zod";
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  CAMERA_TYPE_OPTIONS,
  ASPECT_RATIO_OPTIONS,
} from "@/config/campaign-options";

function pillField(group: readonly { key: string }[]) {
  const keys = group.map((o) => o.key) as [string, ...string[]];
  const preset = z.enum(keys);
  const custom = z.string().regex(/^custom:[\s\S]{1,80}$/);
  return z.union([preset, custom]).nullable().optional();
}

/**
 * SSRF protection for product_image_url.
 *
 * When NEXT_PUBLIC_SUPABASE_URL is set (production / staging), only URLs on
 * the Supabase Storage host are accepted — prevents brands from passing
 * arbitrary URLs (e.g. IMDS endpoints) that may be fetched downstream.
 *
 * Fallback (tests / local without env): any https URL is accepted provided it
 * has no userinfo (user:pass@), uses the default port, and uses https.
 */
const ALLOWED_IMAGE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : null;
  } catch {
    return null;
  }
})();

const safeImageUrl = z.string().url().refine(
  (u) => {
    try {
      const url = new URL(u);
      if (url.protocol !== "https:") return false;
      if (url.username || url.password) return false;
      if (url.port && url.port !== "443") return false;
      if (ALLOWED_IMAGE_HOST && url.host !== ALLOWED_IMAGE_HOST) return false;
      return true;
    } catch {
      return false;
    }
  },
  { message: "product_image_url must be an https URL on the Supabase Storage host" }
);

export const StructuredBriefSchema = z.object({
  product_name: z.string().min(1).max(200),
  product_image_url: safeImageUrl,
  setting: pillField(SETTING_OPTIONS),
  time_lighting: pillField(TIME_LIGHTING_OPTIONS),
  mood_palette: pillField(MOOD_PALETTE_OPTIONS),
  interaction: pillField(INTERACTION_OPTIONS),
  pose_energy: pillField(POSE_ENERGY_OPTIONS),
  expression: pillField(EXPRESSION_OPTIONS),
  outfit_style: pillField(OUTFIT_STYLE_OPTIONS),
  camera_framing: pillField(CAMERA_FRAMING_OPTIONS),
  camera_type: pillField(CAMERA_TYPE_OPTIONS),
  aspect_ratio: z.enum(
    ASPECT_RATIO_OPTIONS.map((o) => o.key) as [string, ...string[]]
  ),
  custom_notes: z.string().max(500).optional().nullable(),
  _meta: z
    .object({
      creator_id: z.string().uuid().optional(),
      category: z.string().optional(),
    })
    .optional(),
});

export type StructuredBrief = z.infer<typeof StructuredBriefSchema>;
