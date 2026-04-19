# Simplified Campaign Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-step campaign wizard with a single-screen, pill-based campaign sheet launched from a redesigned creator profile, and upgrade the Discover Creators page to full-photo overlay cards.

**Architecture:** Frontend-heavy. New shared enum config feeds a new campaign sheet component that writes a structured `structured_brief` JSONB. API routes are extended with enrichment fields (no DB schema changes). Prompt assembler learns to map enum keys → natural-language labels while still accepting `custom:<text>` freeform overrides. Old wizard route is redirected.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Framer Motion, shadcn/ui, Supabase (PG + pgvector), Vitest.

**Spec reference:** `docs/superpowers/specs/2026-04-19-simplified-campaign-flow-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/config/campaign-options.ts` | Create | Single source of truth for all pill enums (setting, time_lighting, mood_palette, interaction, pose_energy, expression, outfit_style, camera_framing, aspect_ratio). Frontend + server share this. |
| `src/domains/generation/structured-brief.ts` | Create | Zod schema validating the new `structured_brief` shape (enum OR `custom:<text>` OR null). |
| `src/lib/ai/prompt-assembler.ts` | Modify | Add enum→label mapping helper; forward `custom:<text>` through verbatim. |
| `src/app/api/creators/route.ts` | Modify | Add enrichment fields (`hero_photo_url`, `approval_count`, `campaigns_last_30d`, `rating`, `avg_approval_hours`) to list response. |
| `src/app/api/creators/[id]/route.ts` | Modify | Return profile payload: creator + stats + gallery (8 approved delivery URLs) + all pricing. |
| `src/app/api/campaigns/create/route.ts` | Modify | Accept new structured_brief; auto-generate campaign name + description server-side. |
| `src/app/(dashboard)/dashboard/creators/page.tsx` | Modify | Full-photo overlay card grid (Variant B). |
| `src/app/(dashboard)/dashboard/creators/[id]/page.tsx` | Modify | Hero + stats + gallery + "Start Campaign" CTA that opens sheet. |
| `src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx` | Create | Right-docked sheet (mobile: full-screen modal) with 12 pill-based sections. |
| `src/app/(dashboard)/dashboard/creators/[id]/pill-section.tsx` | Create | Reusable pill group with `+ Custom` escape hatch. |
| `src/app/(dashboard)/dashboard/campaigns/new/page.tsx` | Modify | Redirect to `/dashboard/creators`. |
| `src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx` | Leave | Deprecated; remove in follow-up cleanup PR. |

---

## Task 1: Campaign options config (enum constants)

**Files:**
- Create: `src/config/campaign-options.ts`
- Create: `src/config/__tests__/campaign-options.test.ts`

- [ ] **Step 1: Write the failing test**

`src/config/__tests__/campaign-options.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
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
  ALL_PILL_ENUM_KEYS,
  isValidPillValue,
} from "../campaign-options";

describe("campaign-options", () => {
  it("exposes all 9 option groups with key/label pairs", () => {
    expect(SETTING_OPTIONS[0]).toEqual({ key: "home_kitchen", label: "Home kitchen" });
    expect(SETTING_OPTIONS.length).toBe(15);
    expect(TIME_LIGHTING_OPTIONS.length).toBe(9);
    expect(MOOD_PALETTE_OPTIONS.length).toBe(9);
    expect(INTERACTION_OPTIONS.length).toBe(9);
    expect(POSE_ENERGY_OPTIONS.length).toBe(8);
    expect(EXPRESSION_OPTIONS.length).toBe(8);
    expect(OUTFIT_STYLE_OPTIONS.length).toBe(8);
    expect(CAMERA_FRAMING_OPTIONS.length).toBe(8);
    expect(ASPECT_RATIO_OPTIONS.length).toBe(4);
  });

  it("ALL_PILL_ENUM_KEYS includes every key from every group except aspect_ratio", () => {
    expect(ALL_PILL_ENUM_KEYS).toContain("home_kitchen");
    expect(ALL_PILL_ENUM_KEYS).toContain("warm_smile");
    expect(ALL_PILL_ENUM_KEYS).not.toContain("1:1"); // aspect excluded
  });

  it("isValidPillValue accepts preset keys, custom strings, and null", () => {
    expect(isValidPillValue("home_kitchen")).toBe(true);
    expect(isValidPillValue("custom:rooftop infinity pool")).toBe(true);
    expect(isValidPillValue(null)).toBe(true);
    expect(isValidPillValue("")).toBe(false);
    expect(isValidPillValue("custom:")).toBe(false);
    expect(isValidPillValue("custom:" + "x".repeat(81))).toBe(false);
    expect(isValidPillValue("garbage_value")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/campaign-options.test.ts`
Expected: FAIL with "Cannot find module '../campaign-options'"

- [ ] **Step 3: Create `src/config/campaign-options.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/__tests__/campaign-options.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/campaign-options.ts src/config/__tests__/campaign-options.test.ts
git commit -m "feat(config): add campaign-options enum source of truth"
```

---

## Task 2: Structured brief Zod schema

**Files:**
- Create: `src/domains/generation/structured-brief.ts`
- Create: `src/domains/generation/__tests__/structured-brief.test.ts`

- [ ] **Step 1: Write the failing test**

`src/domains/generation/__tests__/structured-brief.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { StructuredBriefSchema } from "../structured-brief";

describe("StructuredBriefSchema", () => {
  it("accepts a fully-specified brief with preset enums", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "Pourfect Coffee",
      product_image_url: "https://r2.example.com/product.png",
      setting: "home_kitchen",
      time_lighting: "soft_daylight",
      mood_palette: "warm_earthy",
      interaction: "holding",
      pose_energy: "candid",
      expression: "warm_smile",
      outfit_style: "western_casual",
      camera_framing: "half_body",
      aspect_ratio: "1:1",
      custom_notes: "Label must be visible",
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom:<text> overrides per field", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "Pourfect Coffee",
      product_image_url: "https://r2.example.com/product.png",
      setting: "custom:rooftop infinity pool at dawn",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid preset key", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://r2.example.com/p.png",
      setting: "made_up_setting",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty product_name and invalid aspect_ratio", () => {
    expect(
      StructuredBriefSchema.safeParse({
        product_name: "",
        product_image_url: "https://x",
        aspect_ratio: "1:1",
      }).success
    ).toBe(false);
    expect(
      StructuredBriefSchema.safeParse({
        product_name: "X",
        product_image_url: "https://x",
        aspect_ratio: "2:3",
      }).success
    ).toBe(false);
  });

  it("allows pill fields to be omitted (null/undefined)", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://x",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domains/generation/__tests__/structured-brief.test.ts`
Expected: FAIL with "Cannot find module '../structured-brief'"

- [ ] **Step 3: Create `src/domains/generation/structured-brief.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domains/generation/__tests__/structured-brief.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domains/generation/structured-brief.ts src/domains/generation/__tests__/structured-brief.test.ts
git commit -m "feat(generation): add StructuredBriefSchema with custom: overrides"
```

---

## Task 3: Prompt assembler enum→label mapping

**Files:**
- Modify: `src/lib/ai/prompt-assembler.ts`
- Create: `src/lib/ai/__tests__/prompt-assembler.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/ai/__tests__/prompt-assembler.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { briefToAssemblerLines } from "../prompt-assembler";

describe("briefToAssemblerLines", () => {
  it("maps preset enum keys to human labels", () => {
    const lines = briefToAssemblerLines({
      product_name: "Pourfect Coffee",
      product_image_url: "https://x",
      setting: "home_kitchen",
      mood_palette: "warm_earthy",
      aspect_ratio: "1:1",
    });
    expect(lines).toContain("setting: Home kitchen");
    expect(lines).toContain("mood_palette: Warm earthy");
    expect(lines).toContain("product_name: Pourfect Coffee");
    expect(lines).toContain("aspect_ratio: 1:1");
  });

  it("forwards custom: values verbatim without prefix", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      setting: "custom:rooftop infinity pool at dawn",
      aspect_ratio: "1:1",
    });
    expect(lines).toContain("setting: rooftop infinity pool at dawn");
  });

  it("omits null or undefined pill fields", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      setting: null,
      aspect_ratio: "1:1",
    });
    expect(lines.find((l) => l.startsWith("setting:"))).toBeUndefined();
  });

  it("includes custom_notes when present", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      aspect_ratio: "1:1",
      custom_notes: "No sunglasses",
    });
    expect(lines).toContain("custom_notes: No sunglasses");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/__tests__/prompt-assembler.test.ts`
Expected: FAIL — `briefToAssemblerLines` not exported.

- [ ] **Step 3: Add `briefToAssemblerLines` to `src/lib/ai/prompt-assembler.ts`**

Add these imports at the top of `src/lib/ai/prompt-assembler.ts`:

```typescript
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  labelFor,
  type PillOption,
} from "@/config/campaign-options";
```

Add this exported function **before** `assemblePromptWithLLM`:

```typescript
const PILL_FIELD_GROUPS: Record<string, readonly PillOption[]> = {
  setting: SETTING_OPTIONS,
  time_lighting: TIME_LIGHTING_OPTIONS,
  mood_palette: MOOD_PALETTE_OPTIONS,
  interaction: INTERACTION_OPTIONS,
  pose_energy: POSE_ENERGY_OPTIONS,
  expression: EXPRESSION_OPTIONS,
  outfit_style: OUTFIT_STYLE_OPTIONS,
  camera_framing: CAMERA_FRAMING_OPTIONS,
};

function pillValueToLabel(field: string, value: string): string {
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  const group = PILL_FIELD_GROUPS[field];
  return group ? labelFor(value, group) : value;
}

/**
 * Convert a structured brief into the ordered line-list the LLM assembler expects.
 * Pill fields with null/undefined values are omitted — the LLM infers from creator style.
 */
export function briefToAssemblerLines(
  brief: Record<string, unknown>
): string[] {
  const lines: string[] = [];
  if (typeof brief.product_name === "string" && brief.product_name)
    lines.push(`product_name: ${brief.product_name}`);
  for (const field of Object.keys(PILL_FIELD_GROUPS)) {
    const v = brief[field];
    if (typeof v === "string" && v.length > 0) {
      lines.push(`${field}: ${pillValueToLabel(field, v)}`);
    }
  }
  if (typeof brief.aspect_ratio === "string")
    lines.push(`aspect_ratio: ${brief.aspect_ratio}`);
  if (typeof brief.custom_notes === "string" && brief.custom_notes)
    lines.push(`custom_notes: ${brief.custom_notes}`);
  return lines;
}
```

Then update `assemblePromptWithLLM` to use it — replace the existing `briefLines` construction block (lines ~82–97 in current file) with:

```typescript
  const briefLines = briefToAssemblerLines(brief as Record<string, unknown>);
  // Back-compat: if caller still passes loose v1 fields, merge those too.
  for (const k of ["subject", "setting", "pose", "expression", "style", "outfit", "props", "category", "product_description", "notes"] as const) {
    const v = (brief as Record<string, unknown>)[k];
    if (typeof v === "string" && v && !briefLines.some((l) => l.startsWith(`${k}:`))) {
      briefLines.push(`${k}: ${v}`);
    }
  }
  const userMessage = briefLines.join("\n");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/__tests__/prompt-assembler.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-assembler.ts src/lib/ai/__tests__/prompt-assembler.test.ts
git commit -m "feat(ai): map structured-brief enums to LLM assembler lines"
```

---

## Task 4: Creator list API enrichment

**Files:**
- Modify: `src/app/api/creators/route.ts`

- [ ] **Step 1: Read the existing route to understand current shape**

Run: `cat src/app/api/creators/route.ts`
Note the current SELECT and response shape. Preserve all existing fields.

- [ ] **Step 2: Add enrichment fields to the response**

In `src/app/api/creators/route.ts`, after the existing creator query, add these enrichment queries. Append the following properties to each creator object before returning: `hero_photo_url`, `approval_count`, `campaigns_last_30d`, `rating`, `avg_approval_hours`.

Add this helper inside the route handler (after creators are fetched, before the response):

```typescript
  const creatorIds = creators.map((c) => c.id);

  // 1. Hero photo: first entry from reference_photos per creator
  const { data: photos } = await supabaseAdmin
    .from("reference_photos")
    .select("creator_id, storage_path")
    .in("creator_id", creatorIds);
  const heroByCreator = new Map<string, string>();
  for (const p of photos ?? []) {
    if (!heroByCreator.has(p.creator_id)) {
      heroByCreator.set(
        p.creator_id,
        `${process.env.R2_PUBLIC_URL ?? ""}/${p.storage_path}`
      );
    }
  }

  // 2. Approval count + campaigns_last_30d via aggregate query
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("creator_id, created_at, id")
    .in("creator_id", creatorIds);
  const campaignsByCreator = new Map<string, { ids: string[]; last30: number }>();
  for (const c of campaignRows ?? []) {
    const entry = campaignsByCreator.get(c.creator_id) ?? { ids: [], last30: 0 };
    entry.ids.push(c.id);
    if (c.created_at >= thirtyDaysAgo) entry.last30 += 1;
    campaignsByCreator.set(c.creator_id, entry);
  }

  const allCampaignIds = [...campaignsByCreator.values()].flatMap((e) => e.ids);
  const { data: approvedGens } = allCampaignIds.length
    ? await supabaseAdmin
        .from("generations")
        .select("campaign_id, status")
        .in("campaign_id", allCampaignIds)
        .eq("status", "approved")
    : { data: [] as { campaign_id: string; status: string }[] };

  const approvalsByCampaign = new Map<string, number>();
  for (const g of approvedGens ?? []) {
    approvalsByCampaign.set(g.campaign_id, (approvalsByCampaign.get(g.campaign_id) ?? 0) + 1);
  }

  // Enrich
  const enriched = creators.map((c) => {
    const camp = campaignsByCreator.get(c.id) ?? { ids: [], last30: 0 };
    const approvalCount = camp.ids.reduce(
      (sum, id) => sum + (approvalsByCampaign.get(id) ?? 0),
      0
    );
    return {
      ...c,
      hero_photo_url: heroByCreator.get(c.id) ?? c.avatar_url,
      approval_count: approvalCount,
      campaigns_last_30d: camp.last30,
      rating: null as number | null, // rating system TBD — Section 8 open question
      avg_approval_hours: null as number | null, // computed in /api/creators/[id], not list
    };
  });

  return NextResponse.json({ creators: enriched });
```

Replace the existing `NextResponse.json({ creators })` line with the `enriched` version above.

- [ ] **Step 3: Manually verify the API returns new fields**

Run: `curl -s http://localhost:3000/api/creators | jq '.creators[0] | keys'`
Expected output includes: `approval_count`, `campaigns_last_30d`, `hero_photo_url`, `rating`, `avg_approval_hours`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/creators/route.ts
git commit -m "feat(api): enrich /api/creators with hero photo and stats"
```

---

## Task 5: Creator profile API

**Files:**
- Modify: `src/app/api/creators/[id]/route.ts`

- [ ] **Step 1: Read the existing route**

Run: `cat "src/app/api/creators/[id]/route.ts"`
Preserve the existing creator + categories fields.

- [ ] **Step 2: Add gallery + stats to the response**

After the existing creator fetch in `src/app/api/creators/[id]/route.ts`, append:

```typescript
  // Gallery: up to 8 most recent approved generations with delivery_url
  const { data: ownCampaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("creator_id", id);
  const campaignIds = (ownCampaigns ?? []).map((c) => c.id);

  let gallery: string[] = [];
  let approvalCount = 0;
  let avgApprovalMs: number | null = null;

  if (campaignIds.length > 0) {
    const { data: gens } = await supabaseAdmin
      .from("generations")
      .select("id, delivery_url, status, created_at")
      .in("campaign_id", campaignIds)
      .eq("status", "approved")
      .not("delivery_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    gallery = (gens ?? []).map((g) => g.delivery_url as string);
    approvalCount = gens?.length ?? 0;

    // avg approval hours: join approvals with generations
    const { data: approvals } = await supabaseAdmin
      .from("approvals")
      .select("generation_id, updated_at, created_at, status")
      .eq("status", "approved");
    const durations: number[] = [];
    const genMap = new Map(
      (gens ?? []).map((g) => [g.id, new Date(g.created_at).getTime()])
    );
    for (const a of approvals ?? []) {
      const start = genMap.get(a.generation_id);
      if (start) {
        durations.push(new Date(a.updated_at).getTime() - start);
      }
    }
    if (durations.length > 0) {
      avgApprovalMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  const stats = {
    followers: creator.instagram_followers ?? null,
    approval_count: approvalCount,
    avg_approval_hours:
      avgApprovalMs !== null ? Math.round(avgApprovalMs / (1000 * 60 * 60)) : null,
    approval_rate: null as number | null, // future work
    rating: null as number | null,
  };

  return NextResponse.json({ creator, gallery, stats });
```

Replace the existing final `NextResponse.json` call with the one above (keep `creator` shape identical).

- [ ] **Step 3: Manual verify**

Run: `curl -s http://localhost:3000/api/creators/<any-creator-id> | jq 'keys'`
Expected: `["creator", "gallery", "stats"]`

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/creators/[id]/route.ts"
git commit -m "feat(api): add gallery + stats to /api/creators/[id]"
```

---

## Task 6: Discover Creators — full-photo overlay cards

**Files:**
- Modify: `src/app/(dashboard)/dashboard/creators/page.tsx`

- [ ] **Step 1: Update the `CreatorWithDetails` interface**

In `src/app/(dashboard)/dashboard/creators/page.tsx`, extend the interface (around line 12–23):

```typescript
interface CreatorWithDetails {
  id: string;
  bio: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  display_name: string;
  avatar_url: string | null;
  hero_photo_url: string | null;
  approval_count: number;
  campaigns_last_30d: number;
  rating: number | null;
  categories: { category: string; price_per_generation_paise: number }[];
}
```

- [ ] **Step 2: Replace the card rendering block**

Replace the entire `{/* Creator Grid */}` block (lines ~268–364) with:

```tsx
      {!isLoading && filteredCreators.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {filteredCreators.map((creator) => {
            const minPrice = getMinPrice(creator);
            const isTop10 = creator.approval_count >= 50; // tentative threshold
            const isTrending = creator.campaigns_last_30d >= 5;
            const photo =
              creator.hero_photo_url ??
              creator.avatar_url ??
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                creator.display_name
              )}&background=c9a96e&color=fff&size=600`;

            return (
              <motion.div
                key={creator.id}
                variants={cardVariants}
                className="group relative overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]"
              >
                <Link
                  href={`/dashboard/creators/${creator.id}`}
                  className="block no-underline"
                >
                  <div className="relative h-[480px] w-full">
                    {(isTop10 || isTrending) && (
                      <span className="absolute left-3 top-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
                        {isTop10 ? "⭐ Top 10" : "🔥 Trending"}
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={creator.display_name}
                      className="h-full w-full object-cover object-top"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <h3 className="text-[17px] font-700 leading-tight">
                        {creator.display_name}
                      </h3>
                      <p className="mt-0.5 text-[11px] opacity-90">
                        {creator.instagram_handle && `@${creator.instagram_handle} • `}
                        {creator.instagram_followers
                          ? `${formatFollowersShort(creator.instagram_followers)} • `
                          : ""}
                        {creator.rating ? `${creator.rating.toFixed(1)}★` : "New"}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {creator.categories.slice(0, 2).map((cat, idx) => {
                          const c = MIST_COLORS[idx % MIST_COLORS.length];
                          return (
                            <span
                              key={cat.category}
                              className="rounded-full px-2.5 py-0.5 text-[10px] font-500"
                              style={{ backgroundColor: c.bg, color: c.text }}
                            >
                              {cat.category}
                            </span>
                          );
                        })}
                      </div>
                      {minPrice !== null && (
                        <p className="mt-2.5 text-[13px] font-600">
                          From {formatINR(minPrice)}/image
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
```

Add this helper near the top of the file (after the existing helpers):

```typescript
function formatFollowersShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
```

Remove the now-unused `AtSign`, `ArrowRight`, `Users` imports (only `Users` is still used in empty state — keep that).

- [ ] **Step 3: Start dev server and visually verify**

Run: `npm run dev`
Open: `http://localhost:3000/dashboard/creators`
Expected: cards are 480px tall, full-photo, bottom gradient overlay with name/handle/followers/rating/category pills/price.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/creators/page.tsx"
git commit -m "feat(creators): redesign discover page with full-photo overlay cards"
```

---

## Task 7: Creator profile page redesign

**Files:**
- Modify: `src/app/(dashboard)/dashboard/creators/[id]/page.tsx`

- [ ] **Step 1: Extend the profile fetch**

Change the data interface + fetch to consume the new `{ creator, gallery, stats }` shape.

At the top of `src/app/(dashboard)/dashboard/creators/[id]/page.tsx`:

```typescript
interface CreatorCategory {
  id: string;
  category: string;
  subcategories: string[] | null;
  price_per_generation_paise: number;
  is_active: boolean;
}

interface ProfilePayload {
  creator: {
    id: string;
    bio: string | null;
    instagram_handle: string | null;
    instagram_followers: number | null;
    kyc_status: string | null;
    display_name: string;
    avatar_url: string | null;
    hero_photo_url: string | null;
    categories: CreatorCategory[];
  };
  gallery: string[];
  stats: {
    followers: number | null;
    approval_count: number;
    avg_approval_hours: number | null;
    approval_rate: number | null;
    rating: number | null;
  };
}
```

- [ ] **Step 2: Replace page body with hero + stats + about + categories + pricing + gallery + trust**

Replace the entire component return JSX. Add state:

```typescript
const [isSheetOpen, setIsSheetOpen] = useState(false);
```

And render:

```tsx
  if (isLoading || !data) return <div className="p-8">Loading…</div>;
  const { creator, gallery, stats } = data;
  const heroPhoto =
    creator.hero_photo_url ??
    creator.avatar_url ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.display_name)}&background=c9a96e&color=fff&size=1200`;
  const minPrice = creator.categories.length
    ? Math.min(...creator.categories.map((c) => c.price_per_generation_paise))
    : null;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/creators"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-neutral-500)] no-underline hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to creators
      </Link>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]">
        {/* HERO */}
        <div className="relative h-[340px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroPhoto} alt={creator.display_name} className="absolute inset-0 h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-7 text-white sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-800 tracking-tight">{creator.display_name}</h1>
              {creator.instagram_handle && (
                <p className="mt-1 text-sm opacity-90 flex items-center gap-1">
                  <AtSign className="size-3.5" />{creator.instagram_handle}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.approval_count >= 50 && (
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">⭐ Top Creator</span>
                )}
                {creator.kyc_status === "verified" && (
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">✓ KYC Verified</span>
                )}
                <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">🔒 DPDP Consent</span>
              </div>
            </div>
            <Button
              onClick={() => setIsSheetOpen(true)}
              className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-3 font-700 text-white shadow-lg hover:bg-[var(--color-gold-hover)]"
            >
              Start Campaign →
            </Button>
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-2 gap-6 border-b border-[var(--color-neutral-100)] px-7 py-6 sm:grid-cols-4">
          <Stat big={stats.followers ? formatFollowersShort(stats.followers) : "—"} small="followers" />
          <Stat big={stats.rating ? `${stats.rating.toFixed(1)}★` : "—"} small={`from ${stats.approval_count} generations`} />
          <Stat big={stats.avg_approval_hours ? `${stats.avg_approval_hours}h` : "—"} small="avg approval time" />
          <Stat big={stats.approval_rate ? `${stats.approval_rate}%` : "—"} small="approval rate" />
        </div>

        <div className="space-y-8 p-7">
          {/* ABOUT */}
          {creator.bio && (
            <section>
              <h3 className="mb-2 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">About</h3>
              <p className="text-sm leading-relaxed text-[var(--color-neutral-600)]">{creator.bio}</p>
            </section>
          )}

          {/* CATEGORIES */}
          {creator.categories.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">Categories</h3>
              <div className="flex flex-wrap gap-2">
                {creator.categories.map((cat, i) => {
                  const c = MIST_COLORS[i % MIST_COLORS.length];
                  return (
                    <span key={cat.id} className="rounded-full px-3 py-1 text-xs font-600" style={{ backgroundColor: c.bg, color: c.text }}>
                      {cat.category}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* PRICING */}
          {creator.categories.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">Pricing</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {creator.categories.map((cat) => (
                  <div key={cat.id} className="rounded-xl border border-[var(--color-neutral-100)] bg-[var(--color-paper)] p-4">
                    <p className="text-xs text-[var(--color-neutral-500)]">{cat.category}</p>
                    <p className="mt-1 text-lg font-700 text-[var(--color-ink)]">
                      {formatINR(cat.price_per_generation_paise)}
                      <span className="ml-1 text-xs font-400 text-[var(--color-neutral-400)]">/image</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* GALLERY */}
          {gallery.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">Recent AI-Generated Work</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {gallery.map((url, idx) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={idx} src={url} alt="" className="h-[140px] w-full rounded-[10px] object-cover" />
                ))}
              </div>
            </section>
          )}

          {/* TRUST */}
          <section className="flex items-start gap-3 rounded-xl bg-[var(--color-mint)] p-4 text-sm text-[var(--color-ink)]">
            <span className="text-xl">🛡️</span>
            <p><strong>Consent-first licensing</strong> — {creator.display_name.split(" ")[0]} reviews every generation within 48h before it reaches you. Rejected generations get a full refund.</p>
          </section>
        </div>
      </div>

      {isSheetOpen && (
        <StartCampaignSheet
          creator={creator}
          minPrice={minPrice}
          onClose={() => setIsSheetOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div>
      <p className="text-2xl font-800 text-[var(--color-ink)]">{big}</p>
      <p className="mt-0.5 text-xs text-[var(--color-neutral-500)]">{small}</p>
    </div>
  );
}

function formatFollowersShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
```

Add imports:

```typescript
import { StartCampaignSheet } from "./start-campaign-sheet";
```

- [ ] **Step 3: Commit the skeleton (sheet stub will come in Task 9)**

Before committing, create a temporary stub at `src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx`:

```tsx
"use client";
export function StartCampaignSheet(_props: unknown) {
  return null;
}
```

Then:

```bash
git add "src/app/(dashboard)/dashboard/creators/[id]/page.tsx" "src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx"
git commit -m "feat(creators): redesign profile page with hero/stats/gallery/CTA"
```

---

## Task 8: Pill section component

**Files:**
- Create: `src/app/(dashboard)/dashboard/creators/[id]/pill-section.tsx`

- [ ] **Step 1: Implement the shared pill section**

Create `src/app/(dashboard)/dashboard/creators/[id]/pill-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { PillOption } from "@/config/campaign-options";

interface PillSectionProps {
  icon: string;
  label: string;
  options: readonly PillOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  allowCustom?: boolean;
  optional?: boolean;
}

export function PillSection({
  icon,
  label,
  options,
  value,
  onChange,
  allowCustom = true,
  optional = false,
}: PillSectionProps) {
  const isCustom = typeof value === "string" && value.startsWith("custom:");
  const [customText, setCustomText] = useState(
    isCustom ? value!.slice("custom:".length) : ""
  );

  function selectPreset(key: string) {
    onChange(value === key ? null : key);
  }

  function toggleCustom() {
    if (isCustom) {
      onChange(null);
      setCustomText("");
    } else {
      onChange("custom:");
    }
  }

  function onCustomInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.slice(0, 80);
    setCustomText(next);
    onChange(next ? `custom:${next}` : "custom:");
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
        <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)] text-[11px]">{icon}</span>
        {label}
        {optional && <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">• Optional</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => selectPreset(o.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] font-600 text-white"
                  : "border-[var(--color-neutral-100)] bg-white text-[var(--color-neutral-600)] hover:border-[var(--color-gold)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        {allowCustom && (
          <button
            type="button"
            onClick={toggleCustom}
            className={`rounded-full border px-3 py-1.5 text-xs font-600 transition-colors ${
              isCustom
                ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-white"
                : "border-dashed border-[var(--color-gold)] bg-white text-[var(--color-gold)]"
            }`}
          >
            + Custom
          </button>
        )}
      </div>
      {isCustom && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={onCustomInput}
            maxLength={80}
            placeholder="Type your own…"
            className="flex-1 rounded-lg border border-[var(--color-gold)] bg-[#fdf6e7] px-3 py-2 text-sm text-[var(--color-ink)]"
            autoFocus
          />
          <span className="text-[11px] text-[var(--color-neutral-400)]">{customText.length} / 80</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/dashboard/creators/[id]/pill-section.tsx"
git commit -m "feat(campaign): add reusable PillSection with custom escape hatch"
```

---

## Task 9: Start Campaign sheet

**Files:**
- Modify (replace stub): `src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx`

- [ ] **Step 1: Implement the full sheet**

Replace the stub with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { PillSection } from "./pill-section";

interface Creator {
  id: string;
  display_name: string;
  hero_photo_url: string | null;
  avatar_url: string | null;
  categories: { id: string; category: string; price_per_generation_paise: number }[];
}

interface Props {
  creator: Creator;
  minPrice: number | null;
  onClose: () => void;
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export function StartCampaignSheet({ creator, minPrice, onClose }: Props) {
  const router = useRouter();
  const pricePaise = minPrice ?? 0;

  const [productFile, setProductFile] = useState<File | null>(null);
  const [productUrl, setProductUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("");

  const [setting, setSetting] = useState<string | null>(null);
  const [timeLighting, setTimeLighting] = useState<string | null>(null);
  const [moodPalette, setMoodPalette] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<string | null>(null);
  const [poseEnergy, setPoseEnergy] = useState<string | null>(null);
  const [expression, setExpression] = useState<string | null>(null);
  const [outfitStyle, setOutfitStyle] = useState<string | null>(null);
  const [cameraFraming, setCameraFraming] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [count, setCount] = useState(5);
  const [customNotes, setCustomNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photo = creator.hero_photo_url ?? creator.avatar_url ?? "";
  const total = pricePaise * count;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductFile(file);
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/campaigns/upload-product-image", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setProductUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function onGenerate() {
    if (!productUrl) { setError("Upload a product image first"); return; }
    if (!productName.trim()) { setError("Enter the exact product name"); return; }
    setIsSubmitting(true);
    setError(null);
    try {
      const brief = {
        product_name: productName.trim(),
        product_image_url: productUrl,
        setting, time_lighting: timeLighting, mood_palette: moodPalette,
        interaction, pose_energy: poseEnergy, expression,
        outfit_style: outfitStyle, camera_framing: cameraFraming,
        aspect_ratio: aspectRatio,
        custom_notes: customNotes.trim() || null,
        _meta: {
          creator_id: creator.id,
          category: creator.categories[0]?.category ?? "general",
        },
      };
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: creator.id,
          count,
          price_per_generation_paise: pricePaise,
          structured_brief: brief,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Campaign create failed (${res.status}): ${body}`);
      }
      const { campaign_id } = (await res.json()) as { campaign_id: string };
      router.push(`/dashboard/campaigns/${campaign_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-white shadow-2xl"
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-6 py-4">
          {photo && /* eslint-disable-next-line @next/next/no-img-element */ (
            <img src={photo} alt="" className="size-11 rounded-full object-cover object-top" />
          )}
          <div className="flex-1">
            <p className="text-sm font-700 text-[var(--color-ink)]">
              New Campaign with {creator.display_name}
            </p>
            <p className="text-xs text-[var(--color-neutral-500)]">
              {creator.categories[0]?.category ?? "—"} • {formatINR(pricePaise)} per image
            </p>
          </div>
          <button onClick={onClose} className="text-xl text-[var(--color-neutral-400)]" aria-label="Close">
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-[var(--color-lilac)] px-3.5 py-3 text-xs">
            <span>✨</span>
            <div><strong>Click-based customization.</strong> Pills skip karega → AI creator ke style se infer karega.</div>
          </div>

          {/* PRODUCT */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">📦</span>
              Product <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">• Required</span>
            </div>
            <label className="flex items-center gap-3 rounded-lg border-2 border-dashed border-[var(--color-neutral-100)] bg-[var(--color-paper)] p-2.5 cursor-pointer">
              <div className="size-14 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-neutral-100)]">
                {productUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={productUrl} alt="" className="size-full object-cover" />) : <span className="flex size-full items-center justify-center text-xs text-[var(--color-neutral-400)]">Upload</span>}
              </div>
              <div className="flex-1 text-sm">
                <p className="font-600 text-[var(--color-ink)]">{productFile?.name ?? "Choose product image"}</p>
                <p className="text-xs text-[var(--color-neutral-400)]">{isUploading ? "Uploading…" : productUrl ? "✓ Uploaded" : "PNG / JPG, up to 5MB"}</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Exact product name (as printed on pack)"
              className="mt-2 w-full rounded-lg border border-[var(--color-neutral-100)] px-3 py-2.5 text-sm"
            />
          </div>

          <p className="mb-3 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">Scene & environment</p>
          <PillSection icon="🏠" label="Setting" options={SETTING_OPTIONS} value={setting} onChange={setSetting} />
          <PillSection icon="☀️" label="Time & lighting" options={TIME_LIGHTING_OPTIONS} value={timeLighting} onChange={setTimeLighting} />
          <PillSection icon="🎨" label="Mood & palette" options={MOOD_PALETTE_OPTIONS} value={moodPalette} onChange={setMoodPalette} />

          <p className="mb-3 mt-6 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">Subject & pose</p>
          <PillSection icon="🤲" label="Interaction with product" options={INTERACTION_OPTIONS} value={interaction} onChange={setInteraction} />
          <PillSection icon="💃" label="Pose & energy" options={POSE_ENERGY_OPTIONS} value={poseEnergy} onChange={setPoseEnergy} />
          <PillSection icon="😊" label="Expression" options={EXPRESSION_OPTIONS} value={expression} onChange={setExpression} />
          <PillSection icon="👗" label="Outfit style" options={OUTFIT_STYLE_OPTIONS} value={outfitStyle} onChange={setOutfitStyle} />

          <p className="mb-3 mt-6 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">Camera & output</p>
          <PillSection icon="📷" label="Camera & framing" options={CAMERA_FRAMING_OPTIONS} value={cameraFraming} onChange={setCameraFraming} />

          {/* ASPECT — no custom */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">📐</span>
              Platform & aspect
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIO_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAspectRatio(o.key)}
                  className={`rounded-lg border px-2 py-2.5 text-center text-xs ${
                    aspectRatio === o.key
                      ? "border-[var(--color-gold)] bg-[#fdf6e7] font-600 text-[var(--color-ink)]"
                      : "border-[var(--color-neutral-100)] text-[var(--color-neutral-600)]"
                  }`}
                >
                  <b className="block text-xs">{o.key}</b>
                  <span className="text-[10px] text-[var(--color-neutral-400)]">{o.label.replace(`${o.key} `, "")}</span>
                </button>
              ))}
            </div>
          </div>

          {/* COUNT */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">🔢</span>
              How many images?
            </div>
            <div className="flex items-center gap-3.5 rounded-lg border border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-3.5 py-2.5">
              <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} className="size-8 rounded-lg border border-[var(--color-neutral-100)] bg-white text-sm font-700">−</button>
              <span className="min-w-[36px] text-center text-xl font-700 text-[var(--color-ink)]">{count}</span>
              <button type="button" onClick={() => setCount((c) => Math.min(50, c + 1))} className="size-8 rounded-lg border border-[var(--color-neutral-100)] bg-white text-sm font-700">+</button>
              <div className="flex-1 text-right text-xs text-[var(--color-neutral-400)]">
                {formatINR(pricePaise)} × {count}<br />
                <b className="text-sm font-700 text-[var(--color-ink)]">{formatINR(total)}</b>
              </div>
            </div>
          </div>

          <div className="my-6 h-px bg-[var(--color-neutral-100)]" />

          {/* CUSTOM NOTES */}
          <div className="mb-2">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">✍️</span>
              Custom notes
              <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">• Optional — edge cases, brand refs, do-not-do</span>
            </div>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. 'No sunglasses', 'Pack label must be visible'"
              className="w-full resize-y rounded-lg border border-[var(--color-neutral-100)] px-3 py-2.5 text-sm"
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between border-t border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-6 py-4">
          <div className="text-xs text-[var(--color-neutral-500)]">
            Total<br />
            <b className="text-lg font-800 text-[var(--color-ink)]">{formatINR(total)}</b>
          </div>
          <button
            type="button"
            disabled={isSubmitting || isUploading}
            onClick={onGenerate}
            className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-6 py-3 font-700 text-white shadow-lg disabled:opacity-60"
          >
            {isSubmitting ? "Creating…" : "Generate Images →"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Visual verify**

Run `npm run dev` (if not already running), open `http://localhost:3000/dashboard/creators/<any-id>`, click **Start Campaign** → sheet opens. Click a pill — turns black. Click `+ Custom` — turns gold with input. Click `✕` — sheet closes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx"
git commit -m "feat(campaign): implement pill-based StartCampaignSheet"
```

---

## Task 10: /api/campaigns/create — accept new brief

**Files:**
- Modify: `src/app/api/campaigns/create/route.ts` (create if missing — inspect existing POST handler first)

- [ ] **Step 1: Inspect the existing campaign create handler**

Run: `ls src/app/api/campaigns/ && find src/app/api/campaigns -name route.ts -exec head -5 {} \;`
Note the current route path handling campaign creation (may be POST on `/api/campaigns/route.ts` rather than `/create`). Use whichever currently exists — do not create a duplicate. Adjust the sheet's fetch URL if needed.

- [ ] **Step 2: Validate the incoming brief and auto-generate campaign name**

In the campaign-create POST handler, before inserting:

```typescript
import { StructuredBriefSchema } from "@/domains/generation/structured-brief";

// inside the handler, after parsing body:
const parsed = StructuredBriefSchema.safeParse(body.structured_brief);
if (!parsed.success) {
  return NextResponse.json(
    { error: "Invalid structured_brief", details: parsed.error.flatten() },
    { status: 400 }
  );
}
const brief = parsed.data;

// Auto-generate campaign metadata
const creatorRes = await supabaseAdmin
  .from("users")
  .select("display_name")
  .eq("id", /* creator's user_id — look up via creators table */)
  .maybeSingle();
const creatorName = creatorRes.data?.display_name ?? "creator";
const dateStr = new Date().toISOString().slice(0, 10);
const name = `${brief.product_name} × ${creatorName} — ${dateStr}`;
const description = `${
  brief.setting ? `${brief.setting} ` : ""
}shoot with ${creatorName} featuring ${brief.product_name}. ${
  brief.aspect_ratio
} format.`;
```

Use `name` and `description` in the `campaigns` insert. Ensure `structured_brief` is written to the campaign row (or forwarded to `generations` — match existing behavior).

- [ ] **Step 3: Test end-to-end with the sheet**

Open dashboard → profile → Start Campaign → upload any PNG → type product name → click a few pills → Generate. Expect successful redirect to the campaign detail page (or an error surfaced in the red error line).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/
git commit -m "feat(api): validate structured_brief and auto-generate campaign name"
```

---

## Task 11: Deprecate old wizard route

**Files:**
- Modify: `src/app/(dashboard)/dashboard/campaigns/new/page.tsx`

- [ ] **Step 1: Replace the old page with a redirect**

Replace the file contents entirely with:

```tsx
import { redirect } from "next/navigation";

export default function DeprecatedNewCampaignPage() {
  redirect("/dashboard/creators");
}
```

- [ ] **Step 2: Verify manually**

Open `http://localhost:3000/dashboard/campaigns/new` → expect redirect to `/dashboard/creators`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/campaigns/new/page.tsx"
git commit -m "chore(campaigns): redirect old wizard to creator discovery"
```

---

## Task 12: End-to-end smoke verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the three new suites from tasks 1–3.

- [ ] **Step 2: Dev server smoke flow**

Run `npm run dev`, then manually walk through:
1. `/dashboard/creators` — cards are 480px full-photo with overlay. ✓
2. Click a card — profile page loads with hero, stats, gallery (if any approved generations exist), Start Campaign CTA. ✓
3. Click Start Campaign — right-docked sheet opens. ✓
4. Upload product PNG, enter name, click 3–4 pills, one `+ Custom` with typed text, pick aspect, set count = 2. ✓
5. Click Generate Images → redirected to campaign detail, generations start in Inngest. ✓
6. `/dashboard/campaigns/new` directly → redirects to `/dashboard/creators`. ✓

- [ ] **Step 3: Final commit if any doc/lint fixups remain**

```bash
git status
# If any cleanup needed:
git add -A && git commit -m "chore: final cleanup for simplified campaign flow"
```

---

## Self-Review Notes (inline fixes applied)

- Spec Section 1 (Discover cards): covered by Task 6. ✓
- Spec Section 2 (Profile page): covered by Task 7. ✓
- Spec Section 3 (Campaign sheet — 12 sections, pill-based, `+ Custom` pattern): covered by Tasks 8+9. ✓
- Spec Section 3 (auto-generated campaign name/description): covered by Task 10. ✓
- Spec Section 4 (structured_brief shape): covered by Task 2 + 3. ✓
- Spec Section 5 (API impact — `/api/creators` enrichment): Task 4. ✓
- Spec Section 5 (`/api/creators/[id]` profile payload): Task 5. ✓
- Spec Section 5 (`/api/campaigns/create` accepts new brief): Task 10. ✓
- Spec Section 6 (prompt-assembler enum → label): Task 3. ✓
- Spec Section 7 (deprecate old route): Task 11. ✓
- Spec Section 8 open questions: flagged in spec, not implementation blockers. Top 10 threshold hard-coded at `approval_count >= 50` in Task 6 — revisit once analytics available.

**Type consistency check:** `hero_photo_url` used identically across Tasks 4, 6, 7. `structured_brief` field names match exactly between Task 2 schema, Task 3 assembler, and Task 9 sheet state. `creator_id` vs `id` — spec uses `id` for creator primary key (matches `creators.id`), `creator_id` only appears in `_meta` and `campaigns.creator_id`. Consistent.
