# Design Pipeline — Skipped Items

Running log of things consciously deferred during the **Claude Design → React port** pipeline (creator profile, brand discover, studio, etc.). Address all at the end in one focused cleanup pass so nothing falls through cracks.

## How to use

- When porting a screen, anything that can't be wired right now (missing DB field, awkward grammar, dead asset, copy nits, etc.) → **append to "Open" below** with file path + reason + fix sketch.
- At end of design migration, single cleanup PR addresses everything in Open.
- Once handled, move the bullet to "Resolved" with a date.
- Keep entries terse but include enough info to act cold (path, line if known, what + why).

---

## 🔒 Theme decision — LOCKED

**Single theme across all of Faiceoff: dark editorial + rust accent (`#e8825d`).**

Tried + explicitly rejected by Pranav (do not reopen):
- Light theme — all 6 palette variants (Notion warm, Mercury minimalist, Hermès bold, Tesla mono, Beehiiv plum, Saffron heritage)
- Aurora Glass mixed-mode (light main + dark sidebar with gradient mesh)
- Sunset Studio (vivid multi-color gradient bg, magenta/coral/violet accents)
- Black & Gold luxury Art Deco

Pranav's call: dark + rust is the actual Faiceoff aesthetic. Stick with it on every surface — public marketing, dashboard, onboarding, checkout — all dark, all rust accent. Gold radial gradient is reserved for the "Faiceoff Verified" seal SVG only, never a UI accent.

If a future agent gets asked "let's try light theme" — point at this lock + this file before spinning up any experiments.

---

## Open

### 1) Schema additions needed (creators table)

- **`creators.city` (text, nullable)** — Location pin on Discover Creators cards was in the Claude Design source but skipped at port (no DB field yet). When added: re-enable the pin in `discover-grid.tsx` (`CreatorCardCmp`), wire `loadCreators()` in `discover/page.tsx` to include it, also surface on the public `/creators/[slug]` profile hero.
- **Thread `creators.created_at` through `CreatorCard` shape** — column exists, just not in the data we pass to the client. Without it:
  - "Newest" sort on Discover Creators falls back to ID-desc (`discover-grid.tsx` filtered useMemo, `case "newest"`).
  - "New" badge on Discover cards is hidden entirely (would show for creators created in the last 30 days).
  - Update `loadCreators()` to select `created_at` and pass it on the card shape; wire both the sort and the badge.

### 2) Copy / grammar fixes after the Style Reel → Style Previews global rename

Global `replace_all` was used to rename consistently. A few sentences now read awkwardly. Hand-edit when touched:

- `src/app/(dashboard)/creator/profile/setup/page.tsx:332` — "We'll build a hand-crafted Style Previews of you in each" → drop the article ("hand-crafted Style Previews of you") or revert to singular ("a hand-crafted Style Preview of you").
- `src/app/(dashboard)/creator/profile/setup/page.tsx:762` — "Build at least 1 Style Previews frame to unlock Publish" → "Build at least 1 Style Preview to unlock Publish" (singular reads cleaner).
- `src/app/(dashboard)/creator/dashboard/page.tsx:361` — "Style Previews auto-builds → drop the link in your IG bio" → "Style Previews auto-build" (subject-verb agreement; "previews" is plural).

### 3) Codebase-wide `font-mono` class rename

- 449 occurrences across 69 files still use the Tailwind `font-mono` class even though `--font-mono` now resolves to Plus Jakarta Sans (the global swap fix landed in commit `5f1ea43`).
- Visually identical, so this is low priority. Rename class-by-class to `font-sans uppercase tracking-wider` as files are touched.
- See `docs/DESIGN_SKIPPED.md` itself (this file) is the place to track that — don't reintroduce JetBrains Mono regardless. Locked in CLAUDE.md as a hard rule.

### 4) Letter-spacing tune after mono → Plus Jakarta Sans swap

- Existing `tracking-[0.18em]` / `letter-spacing: 0.16em` values were dialled in for JetBrains Mono (wider glyphs). With Plus Jakarta Sans they may look slightly bunched on some surfaces.
- No action needed unless a label feels visually wrong on review. Tighten on a per-component basis when noticed.

### 5) Server-side persistence for brand "Saved creators"

- `/brand/discover` heart button persists to `localStorage` only (`fco.saved_creators` key).
- Cross-device sync requires a small backend: new `brand_saved_creators` table (brand_id, creator_id, created_at, PK on the pair), plus `GET /api/brand/saved` + `POST/DELETE /api/brand/saved/[creatorId]` routes.
- Defer until users actually ask, or until we add a "Saved" tab to Discover.

### 6) Stale / dead files

- **`.tmp/claude-design/`** — gitignored extraction location for Claude Design bundles. Safe to delete locally any time; not tracked.

---

## Resolved

- ✅ **Stale preview HTML files** — `public/design-preview.html` + `public/collabs-light-preview.html` both deleted (theme decision locked, no more preview iteration). Cleanup commit alongside the theme-lock decision.
