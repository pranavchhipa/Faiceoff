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
  ASPECT_RATIO_OPTIONS,
} from "@/config/campaign-options";

function pillField(group: readonly { key: string }[]) {
  const keys = group.map((o) => o.key) as [string, ...string[]];
  const preset = z.enum(keys);
  const custom = z.string().regex(/^custom:[\s\S]{1,80}$/);
  return z.union([preset, custom]).nullable().optional();
}

export const StructuredBriefSchema = z.object({
  product_name: z.string().min(1).max(200),
  product_image_url: z.string().url(),
  setting: pillField(SETTING_OPTIONS),
  time_lighting: pillField(TIME_LIGHTING_OPTIONS),
  mood_palette: pillField(MOOD_PALETTE_OPTIONS),
  interaction: pillField(INTERACTION_OPTIONS),
  pose_energy: pillField(POSE_ENERGY_OPTIONS),
  expression: pillField(EXPRESSION_OPTIONS),
  outfit_style: pillField(OUTFIT_STYLE_OPTIONS),
  camera_framing: pillField(CAMERA_FRAMING_OPTIONS),
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
