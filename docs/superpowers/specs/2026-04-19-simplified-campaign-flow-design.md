# Simplified Campaign Creation Flow — Design Spec

**Date:** 2026-04-19
**Owner:** Pranav Chhipa
**Status:** Design approved, ready for implementation plan

---

## Goal

Replace the 3-step campaign wizard with a **single-screen, pill-based, industry-grade** campaign creation experience that launches directly from a redesigned creator profile page. Cut brand typing to the minimum (product name + optional notes) while giving professional-level creative control via structured click-based inputs.

## Non-Goals (explicitly out of scope)

- No tiered pricing (₹10k / ₹20k packages) — dropped.
- No editor role in the platform. Brand handles external editing themselves, downloads final, routes through creator approval like any other generation.
- No changes to the generation pipeline itself (v2/v3 routing, LoRA training, compliance checks, approval workflow remain unchanged).
- No changes to wallet/payment logic — per-image pricing stays.

## Why

Current 3-step wizard has ~15 fields across Details → Prompt → Review, with freetext dropdowns (setting, pose, style, outfit, props, notes). Problems:
- High friction — brand drops off mid-flow.
- Freetext inputs produce inconsistent LLM prompts → inconsistent output quality.
- Creator discovery and campaign creation are disconnected — brand has to remember creator name, then go to separate page.

New flow: brand browses Discover → clicks creator card → lands on rich profile → clicks "Start Campaign" → single sheet opens with creator pre-filled → pill-based structured inputs → generate.

---

## Section 1 — Discover Creators Page Redesign

**File:** `src/app/(dashboard)/dashboard/creators/page.tsx`

**Current:** Small 56px avatar circles with name/bio/pills in a 3-column card grid.

**New:** Variant B — Full-photo overlay cards (Instagram/Pinterest feel).

### Card layout
- 480px-tall card, full-bleed photo (first uploaded reference_photo, or face-anchor thumbnail if no reference set).
- `object-fit: cover; object-position: center top` (face stays visible, not center-cropped).
- Top-left badge pill when applicable: `⭐ Top 10` (by approval_count) or `🔥 Trending` (by campaigns in last 30d).
- Bottom gradient overlay with:
  - Name (17px, bold white)
  - `@handle • followersFormatted • rating★`
  - Category pills (max 2 visible, Faiceoff color tokens: blush/ocean/lilac/mint)
  - `From ₹X,XXX/image` (min price across creator's categories)

### Grid & filters
- 3 columns desktop, 2 tablet, 1 mobile (keep existing breakpoints).
- Keep existing search input + category pill filter row above the grid.
- Add sort dropdown (top-right): `Most popular` (default) / `Highest rated` / `Price: low to high` / `Newest`.

### Data additions needed on `/api/creators`
Currently returns `{ id, bio, instagram_handle, instagram_followers, display_name, avatar_url, categories[] }`. Add:
- `hero_photo_url` — first entry from `reference_photos` table for this creator (public URL from R2, or signed URL from private bucket).
- `approval_count` — count of approved generations across all their campaigns (for Top 10 badge).
- `campaigns_last_30d` — count of campaigns created in last 30 days (for Trending badge).
- `rating` — average rating if we track it; otherwise fixed 5.0 placeholder for now (rating system is future work, keep field optional in type).
- `avg_approval_hours` — average time from generation → approval for past campaigns (for profile page; computed from `approvals.updated_at - generations.created_at`).

All derived values can be a single SQL view or computed in the API route — not a schema change.

---

## Section 2 — Creator Profile Page

**File:** `src/app/(dashboard)/dashboard/creators/[id]/page.tsx`

### Sections (top to bottom)

1. **Hero (340px)** — full-bleed photo, gradient overlay, name + handle + city + three glass badges (`⭐ Top 10 Creator` / `✓ KYC Verified` / `🔒 DPDP Consent`). Top-right action row: `♡ Save` secondary + **`Start Campaign →`** gold primary CTA.

2. **Stats strip** — 4-column row: followers, rating + campaign count, avg approval hours, approval rate %.

3. **About** — bio text (existing `creators.bio` field).

4. **Categories** — colored pills (existing `categories` table).

5. **Pricing** — per-category price cards from `categories.price_per_generation_paise`.

6. **Recent AI-Generated Work** — 4-column gallery of up to 8 thumbnails. Source: last 8 `generations` where `campaign.creator_id = this creator` AND `status = 'approved'` AND `delivery_url IS NOT NULL`. Fallback: empty state "No campaigns yet — be the first".

7. **Trust banner** — "Consent-first licensing — creator reviews every generation within 48h before it reaches you. Rejected generations get a full refund." (static copy, no data).

### Start Campaign action
- Clicking CTA opens a right-docked sheet (or modal on mobile) — does NOT navigate to a separate `/new` route anymore.
- Sheet is the component described in Section 3.
- Sheet receives `creatorId` as prop; creator is pre-filled (not selectable).

### API additions
- Extend `/api/creators/[id]` to include `stats`, `gallery[]` (up to 8 delivery URLs), `all_categories_pricing[]`.

---

## Section 3 — Campaign Creation Sheet (single screen)

**New component:** `src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx`

**Old component (deprecate):** `src/app/(dashboard)/dashboard/campaigns/new/new-campaign-form.tsx` — keep for backward compat during migration, remove after new flow ships.

### Layout

Sticky header with creator avatar + name + category + per-image price.
Scrollable body (max-height 640px) containing 12 sections:
Sticky footer with live total + `Generate Images →` button.

### Required inputs (2 manual)

1. **Product** — image upload (R2 via existing `/api/campaigns/upload-product-image` route) + exact product name text input.
2. **Custom notes** — optional freetext textarea at the bottom for edge cases.

### Pill-based sections (10 click-only)

Each section is a horizontal wrap of single-select pills unless noted. All defaults are null (unselected) — when null, LLM infers from creator's style.

| # | Section | Options |
|---|---|---|
| 1 | **Setting** | Home kitchen, Living room, Bedroom, Bathroom, Balcony, Cafe, Restaurant, Office, Studio (white), Studio (colored), Outdoor street, Garden/park, Beach, Rooftop, Car interior |
| 2 | **Time & lighting** | Early morning, Soft daylight, Golden hour, Overcast, Blue hour, Night (ambient), Studio strobe, Window light, Candle/warm |
| 3 | **Mood & palette** | Warm earthy, Cool minimal, Pastel dreamy, Vibrant pop, Monochrome, Moody/dark, Sunwashed, Cinematic teal-orange, Editorial neutral |
| 4 | **Interaction with product** | Holding, Using, Applying, Drinking/eating, Wearing, Showing to camera, Pouring, Opening/unboxing, Product beside (flat-lay) |
| 5 | **Pose & energy** | Candid, Editorial, Seated relaxed, Standing confident, Walking, Mid-action, Over-shoulder, POV (first-person) |
| 6 | **Expression** | Warm smile, Laughing, Subtle smirk, Contemplative, Confident neutral, Surprise, Looking away, Eyes closed/serene |
| 7 | **Outfit style** | Casual Indian, Western casual, Ethnic (saree/kurta), Athleisure, Formal/blazer, Sleepwear/loungewear, Party/glam, Streetwear |
| 8 | **Camera & framing** | Close-up face, Shoulders up, Half-body, Full-body, Wide environmental, Low angle, High angle, Dutch tilt |
| 9 | **Platform & aspect** | 9:16 (Reels/Story), 1:1 (IG Post), 4:5 (IG Feed), 16:9 (YT/Web) |
| 10 | **Count** | −/+ counter, 1–50 range, live total (`price × count`) |

Pill options should be stored as a constant in `src/config/campaign-options.ts` so they stay DRY between frontend and server-side validation.

### Per-section "Custom" pill (escape hatch)

Every pill section (1–8) gets a trailing **`+ Custom`** pill. Clicking it:
- Selects this section as "custom" (deselects any preset pill).
- Reveals a small inline text input (max 80 chars) right below the pill row.
- The typed string replaces the enum value in `structured_brief` for that field, prefixed with `custom:` so the assembler can distinguish: e.g., `setting: "custom:rooftop infinity pool at dawn"`.
- Empty custom input = treated as null (fallback to creator's inferred style).

Schema update — each pill field accepts either a preset enum key, or a string matching `/^custom:[\s\S]{1,80}$/`. Server-side validator enforces this.

Prompt assembler handling: when it sees `custom:<text>`, it passes the raw text through to the model as-is (no enum-to-label mapping), trusting the brand's exact wording while still wrapping it in the section's semantic context (e.g., `Setting: rooftop infinity pool at dawn`).

**Aspect ratio (section 9) does NOT get a custom option** — it's tied to platform defaults and our AR-to-dimensions lookup, so freeform breaks image generation sizing.

### Auto-generated fields (not shown to brand)

- **Campaign name** — auto-generated: `"{Product name} × {Creator name} — {Date}"`. Brand never sees the field.
- **Campaign description** — auto-generated from selected pills: `"{Setting} shoot with {Creator name} featuring {Product name}. {Mood} mood, {aspect} format."`
- **Category** — inferred from creator's primary category (`categories` table entry with lowest price, or first entry).
- **Max generations** — equal to count input.

---

## Section 4 — Data Model Impact

### `generations.structured_brief` JSONB

Current shape (loose):
```json
{
  "subject": "...", "setting": "...", "pose": "...",
  "expression": "...", "style": "...", "outfit": "...",
  "props": "...", "notes": "...",
  "product_name": "...", "product_description": "...",
  "category": "...", "aspect_ratio": "1:1"
}
```

New shape (structured + enum-validated):
```json
{
  "product_name": "Pourfect Coffee",
  "product_image_url": "https://r2.../product.png",
  "setting": "home_kitchen",          // enum or null
  "time_lighting": "soft_daylight",    // enum or null
  "mood_palette": "warm_earthy",       // enum or null
  "interaction": "holding",            // enum or null
  "pose_energy": "candid",             // enum or null
  "expression": "warm_smile",          // enum or null
  "outfit_style": "western_casual",    // enum or null
  "camera_framing": "half_body",       // enum or null
  "aspect_ratio": "1:1",               // enum, required
  "custom_notes": "No sunglasses. Label must be visible.",  // optional freetext
  "_meta": {
    "creator_id": "...",
    "category": "fashion"
  }
}
```

No migration needed — `structured_brief` is JSONB, old shape still parseable by prompt-assembler for backward compat during rollout.

### `campaigns` table

No schema change. Campaign name + description populated by API on behalf of brand.

---

## Section 5 — API Impact

### `/api/creators` (GET)
Add `hero_photo_url`, `approval_count`, `campaigns_last_30d`, `rating` (optional), `avg_approval_hours` to response shape.

### `/api/creators/[id]` (GET) — new route
Returns full profile payload: creator info + stats + gallery + all categories with pricing.

### `/api/campaigns/create` (POST) — may need update
Accept the new structured_brief shape (enum keys). Auto-generate campaign name + description server-side. Return campaign_id so the sheet can immediately fire `/api/generations/create` for each image in the count.

### `/api/generations/create` (POST)
No change — already accepts `structured_brief` JSONB. Backward compatible.

---

## Section 6 — Prompt Assembler Impact

**File:** `src/lib/ai/prompt-assembler.ts`

The Gemini 2.5 Pro system prompt already handles natural-language freetext. With structured enum values, we pass them as labeled slots:

```
setting: home_kitchen
time_lighting: soft_daylight
mood_palette: warm_earthy
interaction: holding
...
product_name: Pourfect Coffee
custom_notes: No sunglasses. Label must be visible.
```

The LLM converts each enum to vivid prose. This tightens output variance and makes A/B testing possible (change a pill option → predictable prompt change).

**No prompt rewrite needed** — current system prompt already takes "structured brief" input and converts to cinematic photography prompt. Only the brief-construction step in `assemblePromptWithLLM()` changes to handle enum → label mapping (e.g., `home_kitchen` → `"a warm home kitchen with natural light"`).

---

## Section 7 — Deprecations

- Old route `/dashboard/campaigns/new` — keep file but redirect to `/dashboard/creators` (brand must pick creator first now). Plan can delete after new flow is live and stable.
- Component `new-campaign-form.tsx` — deprecated, remove in follow-up cleanup PR.

---

## Section 8 — Open Questions for Implementation

1. **Hero photo source** — profile hero uses first `reference_photos` entry. If creator hasn't uploaded any, fall back to face-anchor thumbnail from R2. Confirm with Pranav which bucket and whether to signed-URL-protect.
2. **Rating system** — spec lists `rating` field but rating system doesn't exist yet. Short-term: show `5.0★` or hide if null. Long-term: separate spec for brand → creator rating flow.
3. **"Top 10" threshold** — current definition is "top 10 by approval_count". Should this be category-scoped (top 10 in Fashion) or global? Pick one before implementation; recommend global to start.
4. **Sheet vs. modal** — design assumes right-docked sheet on desktop. Mobile must fall back to full-screen modal. Confirm Framer Motion variants for both.

---

## Deliverables (for the implementation plan)

1. New `/api/creators` fields + `/api/creators/[id]` route.
2. `creators/page.tsx` — full-photo overlay card redesign.
3. `creators/[id]/page.tsx` — new profile layout with hero + stats + gallery + "Start Campaign" CTA.
4. `start-campaign-sheet.tsx` — new pill-based single-screen component.
5. `src/config/campaign-options.ts` — enum constants shared by UI and server.
6. `prompt-assembler.ts` — enum → label mapping layer.
7. `/api/campaigns/create` — accept new brief shape, auto-generate name/description.
8. Deprecate `/dashboard/campaigns/new` route with redirect.
9. (Optional) DB view for `/api/creators` enrichment fields.

---

## References (mockups in `.superpowers/brainstorm/`)

- `creator-cards-v4.html` — Discover cards Variant B locked.
- `profile-page.html` — creator profile layout.
- `campaign-flow-v2.html` — 12-section pill-based sheet.
