# UX Quality Baseline — Motion, Animation, Mobile (Cross-cutting)

> **Scope:** Design system requirements that apply across Chunks A (landing), B (routes), and D (flow). Foundation chunk C is mostly server-side so UX applies less there (just admin/debug views).
>
> **Goal:** "Top quality best result in terms of UI, motion graphics, animations, mobile compatible" — per product owner directive (2026-04-22).

---

## 1. Design system lock-in

From `CLAUDE.md` — "Hybrid Soft Luxe v2". Non-negotiable constraints:

### Typography
- **Display:** Outfit, weights 500-800
- **Body:** Plus Jakarta Sans, weights 400-600
- **Code/numbers:** JetBrains Mono
- **NEVER italic** — bold geometric sans only. No `font-style: italic` anywhere.
- Line-height: body 1.6, display 1.15
- Letter-spacing: display -0.02em, body 0

### Color palette
```
--color-paper:    #fdfbf7   (background)
--color-ink:      #1a1513   (primary text)
--color-gold:     #c9a96e   (primary accent)
--color-blush:    #f6dfe0   (creator theme accent)
--color-ocean:    #d9e5f0   (brand theme accent)
--color-lilac:    #e2dcef   (generation / AI theme)
--color-mint:     #daece0   (approval / success theme)
```

Usage rules:
- Brand-role pages: ocean accents (backgrounds, chips, progress bars)
- Creator-role pages: blush accents
- Generation status: lilac
- Approval status: mint
- Interactive primary: gold
- Error/destructive: oxidized red `#b84a4a` (derived, not new)

### Shape
- Card radius: `1rem` (16px)
- Button radius: `0.625rem` (10px)
- Pill/chip radius: `9999px`
- Input radius: `0.5rem` (8px)
- Nested elements: 2px less than parent

### Elevation
- `--shadow-soft`: `0 2px 12px -2px rgba(26,21,19,0.06)`
- `--shadow-card`: `0 8px 32px -8px rgba(26,21,19,0.10)`
- `--shadow-elevated`: `0 24px 48px -16px rgba(26,21,19,0.14)`
- Hover transitions: elevate one level, 200ms

---

## 2. Motion system

### 2.1 Motion library stack
- **Framer Motion 12** (already in deps) — primary animation primitives
- **Lottie** (via `lottie-react`) — marketing hero illustrations, success/error states, empty states
- **CSS transitions** — simple hover/focus/press micro-interactions (don't load Framer for hover)
- **No GSAP** — Framer Motion covers everything, avoid dependency duplication

### 2.2 Motion principles

1. **Purposeful, not decorative.** Every animation must communicate something (state change, relationship, hierarchy).
2. **Fast by default.** 150-250ms for most transitions. Only hero-level moments get 400-600ms.
3. **Natural curves.** Default ease: `[0.22, 1, 0.36, 1]` (out-quint). Spring for physical feel: `{ type: "spring", stiffness: 300, damping: 30 }`.
4. **Never block interaction.** Animations must be interruptible — user clicks mid-transition, it finishes gracefully.
5. **Respect motion preferences.** `prefers-reduced-motion: reduce` → collapse to cross-fade only (150ms).

### 2.3 Animation vocabulary (approved primitives)

**Page transitions**
```tsx
// Enter
initial={{ opacity: 0, y: 12 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}

// Exit
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.2 }}
```

**Modals / overlays**
```tsx
// Backdrop: fade 200ms
// Panel: scale 0.96 → 1, opacity 0 → 1, 250ms with spring
initial={{ opacity: 0, scale: 0.96 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ type: "spring", stiffness: 400, damping: 34 }}
```

**Lists / staggered reveals**
```tsx
variants={{
  visible: { transition: { staggerChildren: 0.04 } }
}}
// Each child:
variants={{
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 }
}}
```

**Number counters** (currency, balances, progress)
- Use `motion.span` with `animate={{ count: targetValue }}` via `onUpdate` or `react-countup`
- Duration: 800ms for balances, 400ms for progress counts
- Ease: `easeOutExpo`

**Progress indicators**
- Linear: `motion.div` with animated `width: X%`, 400ms spring
- Circular (generation progress): SVG path with `strokeDashoffset` Framer animate
- Skeleton shimmer: CSS keyframe `background-position` 1.5s linear infinite

**Success celebrations (approval, withdrawal success, etc.)**
- Lottie "confetti-burst" (kept short, 1s)
- Supplemented with haptic-style motion.div scale 1 → 1.04 → 1 (200ms)

### 2.4 Micro-interactions

**Buttons**
- Hover: lift 2px (`y: -2`), shadow step up, 150ms
- Press: scale 0.97, 80ms
- Disabled: 60% opacity, no transition
- Loading: replace label with spinner (Framer rotate infinite)

**Inputs**
- Focus: border color transition 150ms, subtle `scale: 1.002` on focus-within
- Error shake: `x: [-4, 4, -4, 4, 0]`, 280ms, only on submit failure
- Success checkmark: inline SVG path draw (`pathLength: 0 → 1`), 400ms

**Cards (creator cards, license cards)**
- Hover: lift 4px, shadow step up, 200ms
- Image zoom inside card on hover: scale 1.04 on child image, 400ms
- Cursor: pointer + subtle ring glow (gold-tinted, 40% alpha)

**Drag handles / sortable**
- Grabbing: cursor change + shadow intensify
- Ghost position: 50% opacity + 2° rotation
- Drop: spring settle

### 2.5 Hero-level moments (heavier motion budget)

These get 400-800ms, purpose-built choreography.

**Brand: first credit top-up success**
- Confetti Lottie + big credit counter that animates from 0 to purchased amount
- Background gradient sweep (ocean → gold → ocean, 2s)
- Short Hindi/English success toast: "Credits add ho gaye 🎉"

**Creator: first license request received**
- Card flip-in from right with spring (scale 0.9 → 1, rotateY 15° → 0°)
- Pulse border animation (gold) for 3 cycles to draw attention
- Desktop: plays bell notification sound (user-settable mute)

**Generation complete**
- Image reveals with "scan" animation: linear gradient wipes across image (500ms), then clears
- Simultaneously: attempt counter increments with counter animation
- Approval buttons slide up from below (spring stagger)

**Withdrawal success**
- Bank icon Lottie: coins fall into bank
- Amount counter animates gross → net (showing deductions live)
- Subtle ₹ symbol particle burst

---

## 3. Mobile requirements

### 3.1 Breakpoints (Tailwind-native)
- `sm` 640px — large phones landscape, small tablets
- `md` 768px — tablets portrait
- `lg` 1024px — tablets landscape, small laptops
- `xl` 1280px — desktop
- `2xl` 1536px — large desktop

### 3.2 Mobile-first non-negotiables

**1. Touch targets ≥ 44×44 px.** No tiny icon buttons. If icon-only, wrap in `p-3` minimum.

**2. Bottom navigation on mobile.** For authenticated views:
- Brand: Home / Creators / Licenses / Credits / Profile (5 tabs)
- Creator: Home / Requests / Approvals / Earnings / Profile (5 tabs)
- Fixed bottom, 64px height, safe-area-inset aware
- Desktop: side nav, hidden on `< lg`

**3. Safe areas.** All fixed UI accounts for iOS notch / Android nav bar:
```css
padding-bottom: max(1rem, env(safe-area-inset-bottom));
```

**4. Viewport meta correct:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

**5. Sheet-based modals on mobile.** Modals that are centered overlays on desktop become bottom sheets on `< md`. Swipe-down to dismiss. Use `shadcn/ui` Sheet primitive.

**6. No hover-dependent UI.** Anything that only reveals on hover (tooltip, menu) MUST have a tap-equivalent on mobile.

**7. Forms single-column on mobile.** Never 2-column forms below `md`. Inputs full width, labels above (not placeholder-as-label — WCAG).

**8. Images responsive.**
```tsx
<Image
  src={...}
  width={800} height={800}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
/>
```

**9. Large tap areas for creator/license cards.** Entire card clickable, not just the title. Bottom action buttons stretch full width on mobile.

**10. No horizontal scroll unless intentional.** Tables become vertical card lists below `md`. Long pills wrap.

### 3.3 Mobile-specific motion

- Bottom sheet swipe: track drag with `motion.div` drag-y, dismiss on velocity > 400 or y > 40% height
- Pull-to-refresh on dashboard: Framer motion + haptic (where supported)
- Tab switch: swipe gesture support (left/right) for bottom nav tabs — optional, desktop unaffected
- Reduced motion preference respected more aggressively on mobile (battery friendly)

### 3.4 Performance budgets (mobile)

- **FCP** ≤ 1.8s on 4G
- **LCP** ≤ 2.5s
- **INP** ≤ 200ms (interactive responsiveness)
- **CLS** ≤ 0.1
- **Bundle size per route** ≤ 180KB gzipped initial JS

To meet these:
- Server components by default (Next 16 App Router)
- Lottie JSONs lazy-loaded per route, <50KB each (prefer CSS/Framer over Lottie where possible)
- Images always `next/image` with sizes + priority for LCP
- Framer Motion tree-shaken (import from `framer-motion/lightbox` where available)
- No heavy client-side state library (Zustand/Jotai only where needed; default to RSC + URL state)

---

## 4. Accessibility (WCAG 2.2 AA baseline)

### Non-negotiables
1. Color contrast: text-on-paper ≥ 4.5:1 (verified — ink `#1a1513` on paper `#fdfbf7` = 16.1:1 ✓)
2. All interactive elements keyboard accessible. Focus ring: 2px gold outline, 2px offset.
3. Forms: labels programmatically associated, error messages `aria-describedby` linked.
4. Modals: focus trap, ESC to close, return focus to trigger on close.
5. Animations: `prefers-reduced-motion` respected (drop to fade-only).
6. Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` on every page.
7. ARIA live regions for async updates (approval status, withdrawal progress).
8. Screen reader testing: pages pass VoiceOver + NVDA smoke test.

---

## 5. Component library alignment

Stack per `CLAUDE.md`:
- **shadcn/ui** — base primitives (button, input, dialog, sheet, etc.) — customized to our tokens
- **lucide-react** — icons (remember: `AtSign` for Instagram, NOT `Instagram` which doesn't export)
- **framer-motion** — animations
- **lottie-react** — named Lottie moments only

### New primitives we'll need (not in shadcn default)

Living in `src/components/ui-x/` (extended components):

- `BalanceCounter` — animated number with ₹ prefix, counts up from previous
- `LicenseCard` — role-themed card for license listings (blush/ocean variants)
- `PriceBreakdown` — live-calculation list with ease-between-numbers
- `PaymentStatus` — state-machine visualizer (6-dot pipeline)
- `MobileBottomNav` — 5-tab responsive nav, hidden on `lg+`
- `ContractViewer` — scrollable PDF render with accept-gate logic
- `CreatorAvatarStack` — overlapping avatars for collab_sessions
- `FlowTimeline` — vertical stepper with state-driven colors
- `EmptyStateIllustration` — Lottie loop wrapper + CTA

---

## 6. Content tone + copy system

### Voice
- Warm, plain Hinglish-friendly English (same as product owner's voice)
- Numbers in ₹ always (never "Rs" or "INR" in UI)
- Brief over verbose. "Request sent" not "Your license request has been submitted successfully."

### Empty states
- Every list view gets an empty state with:
  - Lottie illustration (3-5 predefined ones, reused across app)
  - Clear "what next" CTA
  - No apology language ("No data yet" not "Sorry, nothing here")

### Loading states
- Skeleton UI for structure-known content (lists, cards)
- Spinner only for indeterminate async (button loading)
- Never blank page — always show structure while data loads

### Error states
- Human-readable reason ("Cashfree is slow right now — retry in a few seconds" not "Error 500")
- Primary retry CTA always present
- Error Lottie for catastrophic states, inline icon for form validation

---

## 7. Dark mode (V2, not MVP)

Design system has dark mode tokens defined but not enabled in MVP. Ship light only. Add `prefers-color-scheme` auto-toggle in V2.

---

## 8. Cross-cutting deliverable requirements

Any feature spec (Chunk B, D, A) MUST include:

1. **Desktop wireframe** (lg+)
2. **Mobile wireframe** (sm)
3. **Motion specs** for key interactions (what animates, timing, ease)
4. **Empty / loading / error state** variants
5. **Accessibility notes** (keyboard flows, ARIA)
6. **Performance notes** (if heavy — bundle impact, lazy-loads)

If a spec is silent on any of the above, it is incomplete.

---

## 9. Measurement

### Launch checklist per page/feature
- [ ] Lighthouse mobile ≥ 90 (Perf), ≥ 95 (A11y, Best Practices, SEO)
- [ ] `prefers-reduced-motion` respected (manual test with OS toggle)
- [ ] Works on iPhone SE (375px wide) without horizontal scroll
- [ ] All tap targets ≥ 44px
- [ ] Keyboard-only navigation flows end-to-end
- [ ] VoiceOver reads flow correctly

### Ongoing (post-launch)
- Vercel Analytics web vitals dashboard
- PostHog funnel: onboarding drop-off, license request → accept, withdrawal completion
- Sentry performance tracing on slowest interactions

---

*This baseline is referenced from Chunks B and D specs. Update here first; downstream specs inherit.*
