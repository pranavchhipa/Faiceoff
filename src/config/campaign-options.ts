/**
 * Single source of truth for all pill enums used in the campaign creation sheet.
 * Keys are stable machine strings (snake_case). Labels are human-readable display strings.
 *
 * The prompt assembler maps keys → vivid prose descriptions.
 * Server-side validation uses ALL_PILL_ENUM_KEYS + isValidPillValue().
 */

export type PillOption<K extends string = string> = {
  readonly key: K;
  readonly label: string;
};

export const SETTING_OPTIONS = [
  { key: "home_kitchen", label: "Home kitchen" },
  { key: "living_room", label: "Living room" },
  { key: "bedroom", label: "Bedroom" },
  { key: "bathroom", label: "Bathroom" },
  { key: "balcony", label: "Balcony" },
  { key: "cafe", label: "Cafe" },
  { key: "restaurant", label: "Restaurant" },
  { key: "office", label: "Office" },
  { key: "studio_white", label: "Studio (white)" },
  { key: "studio_colored", label: "Studio (colored)" },
  { key: "outdoor_street", label: "Outdoor street" },
  { key: "garden_park", label: "Garden / park" },
  { key: "beach", label: "Beach" },
  { key: "rooftop", label: "Rooftop" },
  { key: "car_interior", label: "Car interior" },
] as const satisfies readonly PillOption[];

export const TIME_LIGHTING_OPTIONS = [
  { key: "early_morning", label: "Early morning" },
  { key: "soft_daylight", label: "Soft daylight" },
  { key: "golden_hour", label: "Golden hour" },
  { key: "overcast", label: "Overcast" },
  { key: "blue_hour", label: "Blue hour" },
  { key: "night_ambient", label: "Night (ambient)" },
  { key: "studio_strobe", label: "Studio strobe" },
  { key: "window_light", label: "Window light" },
  { key: "candle_warm", label: "Candle / warm" },
] as const satisfies readonly PillOption[];

export const MOOD_PALETTE_OPTIONS = [
  { key: "warm_earthy", label: "Warm earthy" },
  { key: "cool_minimal", label: "Cool minimal" },
  { key: "pastel_dreamy", label: "Pastel dreamy" },
  { key: "vibrant_pop", label: "Vibrant pop" },
  { key: "monochrome", label: "Monochrome" },
  { key: "moody_dark", label: "Moody / dark" },
  { key: "sunwashed", label: "Sunwashed" },
  { key: "cinematic_teal_orange", label: "Cinematic teal-orange" },
  { key: "editorial_neutral", label: "Editorial neutral" },
] as const satisfies readonly PillOption[];

export const INTERACTION_OPTIONS = [
  { key: "holding", label: "Holding" },
  { key: "using", label: "Using" },
  { key: "applying", label: "Applying" },
  { key: "drinking_eating", label: "Drinking / eating" },
  { key: "wearing", label: "Wearing" },
  { key: "showing_to_camera", label: "Showing to camera" },
  { key: "pouring", label: "Pouring" },
  { key: "opening_unboxing", label: "Opening / unboxing" },
  { key: "product_beside", label: "Product beside (flat-lay)" },
] as const satisfies readonly PillOption[];

export const POSE_ENERGY_OPTIONS = [
  { key: "candid", label: "Candid" },
  { key: "editorial", label: "Editorial" },
  { key: "seated_relaxed", label: "Seated relaxed" },
  { key: "standing_confident", label: "Standing confident" },
  { key: "walking", label: "Walking" },
  { key: "mid_action", label: "Mid-action" },
  { key: "over_shoulder", label: "Over-shoulder" },
  { key: "pov_first_person", label: "POV (first-person)" },
] as const satisfies readonly PillOption[];

export const EXPRESSION_OPTIONS = [
  { key: "warm_smile", label: "Warm smile" },
  { key: "laughing", label: "Laughing" },
  { key: "subtle_smirk", label: "Subtle smirk" },
  { key: "contemplative", label: "Contemplative" },
  { key: "confident_neutral", label: "Confident neutral" },
  { key: "surprise", label: "Surprise" },
  { key: "looking_away", label: "Looking away" },
  { key: "eyes_closed_serene", label: "Eyes closed / serene" },
] as const satisfies readonly PillOption[];

export const OUTFIT_STYLE_OPTIONS = [
  { key: "casual_indian", label: "Casual Indian" },
  { key: "western_casual", label: "Western casual" },
  { key: "ethnic", label: "Ethnic (saree / kurta)" },
  { key: "athleisure", label: "Athleisure" },
  { key: "formal_blazer", label: "Formal / blazer" },
  { key: "sleepwear", label: "Sleepwear / loungewear" },
  { key: "party_glam", label: "Party / glam" },
  { key: "streetwear", label: "Streetwear" },
] as const satisfies readonly PillOption[];

export const CAMERA_FRAMING_OPTIONS = [
  { key: "close_up_face", label: "Close-up face" },
  { key: "shoulders_up", label: "Shoulders up" },
  { key: "half_body", label: "Half-body" },
  { key: "full_body", label: "Full-body" },
  { key: "wide_environmental", label: "Wide environmental" },
  { key: "low_angle", label: "Low angle" },
  { key: "high_angle", label: "High angle" },
  { key: "dutch_tilt", label: "Dutch tilt" },
] as const satisfies readonly PillOption[];

export const ASPECT_RATIO_OPTIONS = [
  { key: "9:16", label: "9:16 Reels / Story" },
  { key: "1:1", label: "1:1 IG Post" },
  { key: "4:5", label: "4:5 IG Feed" },
  { key: "16:9", label: "16:9 YT / Web" },
] as const satisfies readonly PillOption[];

export const ALL_PILL_ENUM_KEYS: ReadonlySet<string> = new Set([
  ...SETTING_OPTIONS.map((o) => o.key),
  ...TIME_LIGHTING_OPTIONS.map((o) => o.key),
  ...MOOD_PALETTE_OPTIONS.map((o) => o.key),
  ...INTERACTION_OPTIONS.map((o) => o.key),
  ...POSE_ENERGY_OPTIONS.map((o) => o.key),
  ...EXPRESSION_OPTIONS.map((o) => o.key),
  ...OUTFIT_STYLE_OPTIONS.map((o) => o.key),
  ...CAMERA_FRAMING_OPTIONS.map((o) => o.key),
]);

const CUSTOM_RE = /^custom:[\s\S]{1,80}$/;

export function isValidPillValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("custom:")) return CUSTOM_RE.test(value);
  return ALL_PILL_ENUM_KEYS.has(value);
}

export function labelFor(key: string, group: readonly PillOption[]): string {
  return group.find((o) => o.key === key)?.label ?? key;
}
