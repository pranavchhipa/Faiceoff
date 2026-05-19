// ─────────────────────────────────────────────────────────────────────────────
// Demo prompts — category-specific Gemini 3 Pro prompts for public profile
// showcase images.
//
// CRITICAL: Zero brand names, zero logos, zero copyrighted products. All
// descriptors are generic. Creator input is restricted to a dropdown of the
// keys below — they cannot inject custom text.
//
// Each category has 3 prompt variants; we rotate via seed so consecutive
// regenerations don't produce identical compositions.
// ─────────────────────────────────────────────────────────────────────────────

export type DemoCategoryKey =
  | "fashion"
  | "beauty"
  | "tech"
  | "food"
  | "travel"
  | "fitness"
  | "home"
  | "automotive"
  | "jewelry"
  | "kids_family";

export interface DemoCategoryDefinition {
  key: DemoCategoryKey;
  /** Display label in the picker UI */
  label: string;
  /** Short tagline shown under the label */
  tagline: string;
  /** Emoji icon (no external assets, works everywhere) */
  emoji: string;
  /** Hex color used to tint the category pill + accent the demo card */
  accent: string;
  /** 3 prompt variants — rotated via deterministic seed */
  prompts: readonly [string, string, string];
}

/* ───────── Shared anchor — keeps face fidelity consistent across categories ───────── */

const FACE_ANCHOR =
  "Photorealistic 8K editorial portrait of the reference subject. " +
  "Preserve exact facial structure, skin texture, eye color, and natural " +
  "expression from the reference photos. Soft skin retouch only — no " +
  "plastic smoothing. Subtle film grain, natural color science.";

const NEGATIVE_PROMPT =
  "no brand logos, no text, no watermarks, no signage, no recognizable " +
  "trademarks, no celebrity likeness other than the reference subject, " +
  "no distortion, no extra fingers, no warped features.";

/**
 * Wrap a category prompt with face anchor + negative prompts so every demo
 * is consistent in face fidelity AND brand-safe.
 */
export function buildDemoPrompt(category: DemoCategoryKey, variantIndex = 0): string {
  const def = DEMO_CATEGORIES[category];
  const variant = def.prompts[variantIndex % def.prompts.length];
  return `${FACE_ANCHOR}\n\nScene: ${variant}\n\nConstraints: ${NEGATIVE_PROMPT}`;
}

/* ───────── Category definitions ───────── */

export const DEMO_CATEGORIES: Record<DemoCategoryKey, DemoCategoryDefinition> = {
  fashion: {
    key: "fashion",
    label: "Fashion & Apparel",
    tagline: "Editorial style, streetwear, runway",
    emoji: "🧥",
    accent: "#D4A574",
    prompts: [
      "Editorial street-style portrait. Subject wears an oversized neutral-toned blazer over a crisp white tee, tailored wide-leg trousers. Standing against a textured concrete gallery wall, soft afternoon daylight raking from the left. Confident half-smile, gaze just off-camera. Three-quarter framing.",
      "Minimal fashion lookbook shot. Subject in monochrome black knitwear, sculpted silhouette, hands tucked into pockets. Pure light-grey seamless studio backdrop, balanced softbox lighting, faint floor reflection. Direct gaze, neutral expression. Magazine-cover composition.",
      "Cinematic golden-hour fashion frame. Subject wears a tailored cream trench coat, leather belt, walking through an empty cobblestone alley. Backlit by setting sun, lens flare hint, mid-stride motion. Shallow depth of field. Anamorphic vibe.",
    ],
  },

  beauty: {
    key: "beauty",
    label: "Beauty & Skincare",
    tagline: "Makeup, skincare, fragrance",
    emoji: "✨",
    accent: "#E8C5C5",
    prompts: [
      "Beauty editorial close-up portrait. Dewy luminous skin, soft glossy lips, minimal smoky eye, hair pulled back. Pure ivory backdrop with subtle gradient. Beauty-dish lighting from directly above, faint hair-light from behind. Slight smile, eyes closed peacefully. Square crop.",
      "High-key beauty shot. Subject's hands cradling face, fresh natural makeup, glowing complexion. Pastel pink seamless backdrop. Bright even lighting, no harsh shadows. Eyes open, gentle gaze straight to lens. Magazine cover energy.",
      "Editorial beauty in motion. Subject mid-laugh, hair caught in soft breeze, peach-toned blush, glossy lips. Sage-green textured paper backdrop. Golden-hour warm fill light. Three-quarter angle, candid feel but composed.",
    ],
  },

  tech: {
    key: "tech",
    label: "Tech & Gadgets",
    tagline: "Headphones, devices, smart home",
    emoji: "🎧",
    accent: "#7BA7BC",
    prompts: [
      "Modern minimalist tech lifestyle shot. Subject in casual oat-colored sweatshirt, wearing generic matte-black over-ear wireless headphones (no logos), eyes closed in focused listening. Sitting in a Scandinavian-style home office, blurred bookshelf behind. Soft north-facing window light. Mid-shot.",
      "Premium gadget portrait. Subject seated at a clean white marble desk, holding a generic minimalist smartphone (no logos, slim bezels) in both hands, looking down at it thoughtfully. Black turtleneck. Studio key-light from front-right. Three-quarter framing, hands prominent.",
      "Smart-home lifestyle moment. Subject standing in modern open-plan kitchen, leaning on counter, gesturing toward an unbranded matte-white smart speaker (cylindrical, no logos) on the island. Warm pendant lighting overhead, evening mood, soft amber tones.",
    ],
  },

  food: {
    key: "food",
    label: "Food & Beverage",
    tagline: "Cafés, drinks, packaged food",
    emoji: "☕",
    accent: "#C9966B",
    prompts: [
      "Cozy café lifestyle portrait. Subject in cream chunky knit sweater, both hands wrapped around an unbranded ceramic mug, steam rising, latte-art visible at the rim. Window-light from the side, blurred warm-wood café interior behind. Soft smile, looking off-camera. Half-body frame.",
      "Food editorial flat-lay portrait. Overhead shot — subject lies on rich-walnut wooden floor surrounded by a styled brunch spread: unbranded white plates with avocado toast, fresh berries, glass of orange juice, sprigs of mint. Subject smiles up at the camera. Soft natural daylight.",
      "Boutique restaurant moment. Subject seated at marble-topped bistro table, sipping from a small unbranded espresso cup, croissant on the side plate. Brass details, vintage tile wall behind. Warm tungsten lighting, intimate evening atmosphere. Three-quarter framing.",
    ],
  },

  travel: {
    key: "travel",
    label: "Travel & Lifestyle",
    tagline: "Destinations, hotels, experiences",
    emoji: "🌴",
    accent: "#9EBE92",
    prompts: [
      "Golden-hour rooftop travel portrait. Subject in flowing linen outfit (white or sand-toned), leaning on a stone balcony railing, distant unnamed coastal town behind, sea glimmer at horizon. Warm low-angle sunlight, gentle wind in hair. Candid laughter, mid-action. Wide framing showing scale.",
      "Adventure-travel lifestyle shot. Subject hiking in earthy-toned outdoor clothing — oversized utility jacket, beanie, small unbranded backpack — pausing on a mountain ridge to take in the view. Misty alpine background, dramatic sky. Cinematic wide shot, subject in lower-third.",
      "Boutique-hotel poolside moment. Subject in elegant resort-wear (white crochet cover-up, straw hat), reclining on a teakwood lounger by a turquoise infinity pool, palm shadows on tiles. Tropical golden afternoon light. Gaze toward the horizon, serene mood. Three-quarter framing.",
    ],
  },

  fitness: {
    key: "fitness",
    label: "Fitness & Wellness",
    tagline: "Athleisure, gym, yoga, supplements",
    emoji: "🏋️",
    accent: "#D88B6B",
    prompts: [
      "Sunrise yoga lifestyle portrait. Subject in unbranded athleisure (sage-green leggings, matching crop top), in a meditative seated pose on a hardwood studio floor. Floor-to-ceiling windows behind, golden first-light filtering in, eucalyptus plant in frame. Eyes closed, peaceful expression.",
      "Premium gym performance shot. Subject mid-workout in a high-end industrial gym, lifting an unbranded barbell, focused expression. Sweat glow, black athletic wear, exposed brick wall background. Dramatic side-lighting from a single softbox. Strong, capable energy.",
      "Outdoor wellness moment. Subject jogging on a tree-lined path at dawn, athletic wear, earbuds (no logos). Misty morning light, autumn leaves on the ground. Caught mid-stride, dynamic motion, candid breath visible in cool air. Wide cinematic framing.",
    ],
  },

  home: {
    key: "home",
    label: "Home & Living",
    tagline: "Furniture, decor, appliances",
    emoji: "🏠",
    accent: "#B59A7C",
    prompts: [
      "Scandi-minimal living room lifestyle. Subject in oversized natural-linen shirt and tailored trousers, curled up on a low-profile boucle sofa, holding a steaming ceramic mug. Soft afternoon light through sheer curtains, abstract art on the wall, monstera plant in corner. Candid, relaxed.",
      "Modern kitchen styling portrait. Subject standing at a clean marble island, slicing fresh herbs on a wooden board. Open shelving with unbranded ceramics behind. Pendant lights, warm wood floor. Apron, sleeves rolled up. Window-light from the right.",
      "Reading nook intimacy shot. Subject seated in a wide rattan chair by a tall window, throw blanket over lap, an open hardcover book in hand. Plants on the windowsill, soft cream curtains. Golden-hour side-light, dust motes visible. Three-quarter back framing.",
    ],
  },

  automotive: {
    key: "automotive",
    label: "Automotive",
    tagline: "Cars, bikes, accessories",
    emoji: "🚗",
    accent: "#5C7A8C",
    prompts: [
      "Cinematic twilight automotive portrait. Subject leaning casually against a generic matte-black premium SUV (no badge or logo, sculpted modern silhouette) at an empty wet-asphalt road. Wearing a leather jacket and dark jeans. Distant city lights bokeh. Strong rim-light from a single off-camera source.",
      "Open-road lifestyle frame. Subject seated in driver's seat of an unbranded convertible (vintage-inspired roadster), one hand on the wheel, sunglasses, wind-tousled hair, coastal highway visible through the windshield. Warm afternoon sun. Three-quarter from passenger side.",
      "Garage-lifestyle portrait. Subject crouched next to a generic high-performance motorcycle (no logos, all-black paint), tools laid out on a clean concrete floor, soft industrial work-light overhead. Mechanic-style outfit, focused expression. Editorial composition.",
    ],
  },

  jewelry: {
    key: "jewelry",
    label: "Jewelry & Watches",
    tagline: "Fine jewelry, watches, premium accessories",
    emoji: "💎",
    accent: "#B89968",
    prompts: [
      "Luxury jewelry editorial portrait. Subject in black satin slip dress, side profile, wearing simulated gold chain necklace and matching delicate earrings (unbranded, refined silhouettes). Black velvet backdrop, single hard side-light sculpting cheekbones. Hands raised toward the neck pose. Magazine-spread composition.",
      "Watch-focused commercial shot. Subject in a tailored charcoal suit, wrist raised so generic premium-looking silver wristwatch (unbranded face, leather strap) is featured. Hand resting on a marble counter, glass of water beside. Sharp directional lighting on the wrist, clean white backdrop.",
      "Fine-jewelry lifestyle moment. Subject in cream silk camisole, sitting at a vintage vanity, putting on simulated diamond stud earrings, reflection in a beveled mirror. Warm bulb side-lighting, vintage perfume bottles (unbranded) in soft focus. Intimate, prestige feel.",
    ],
  },

  kids_family: {
    key: "kids_family",
    label: "Kids & Family",
    tagline: "Parenting, toys, baby products",
    emoji: "👶",
    accent: "#F0C9B0",
    prompts: [
      "Tender family-lifestyle portrait. Subject in soft pastel knit, gently holding a generic plush bunny toy (unbranded, simple shape), seated on a pale-pink rug in a softly-lit nursery. Cream curtains, mobile of clouds overhead. Warm window-light, peaceful expression. Three-quarter framing.",
      "Playful parenting moment. Subject crouched at child's eye-level on a sunlit hardwood floor, holding out a generic wooden building block toward an out-of-frame toddler (only small reaching hand visible). Bright daylight, scattered unbranded wooden toys. Laughing expression, dynamic candid.",
      "Cozy bedtime-routine shot. Subject in soft pajama set, seated on the edge of a low bed in a child's room, reading from an open unbranded picture book. Warm bedside-lamp glow, twinkling star-string lights on the wall. Side framing, intimate mood.",
    ],
  },
} as const;

export const ALL_CATEGORY_KEYS = Object.keys(DEMO_CATEGORIES) as DemoCategoryKey[];

/** Max categories a creator can select on their public profile */
export const MAX_CATEGORIES_PER_CREATOR = 4;

/** Free regenerations allowed per (creator, category). Beyond this: 1 credit each. */
export const FREE_REGENERATIONS_PER_CATEGORY = 3;

/** Credits deducted per regen after free quota is exhausted */
export const REGENERATION_CREDIT_COST = 1;

/**
 * Type guard: is this string a valid category key?
 */
export function isValidCategory(value: unknown): value is DemoCategoryKey {
  return typeof value === "string" && value in DEMO_CATEGORIES;
}
