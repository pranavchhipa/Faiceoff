# Chunk B — Route Restructure (`/brand/*` + `/creator/*`) Design

> **Context:** Second chunk in product revamp sequence (C → B → D → A). Splits the current single `/dashboard/*` space into two role-specific spaces. Depends on Chunk C schema for role-aware routing.
>
> **References:** `2026-04-22-chunk-c-foundation-design.md` (tables, role model), `2026-04-22-ux-quality-baseline-design.md` (motion + mobile requirements)

**Goal:** Clear URL-level separation between brand and creator experiences, with role-based redirects, mobile bottom nav per role, and backward-compatible redirects from old `/dashboard/*` paths.

---

## 1. Scope

### In scope
- New route tree: `/brand/*` and `/creator/*` top-level segments
- Updated `proxy.ts` middleware: role-based routing guards + auto-redirect
- Role-themed shell layouts (ocean for brand, blush for creator)
- Mobile bottom nav component per role
- Legacy `/dashboard/*` redirects preserved for 90 days
- Shared public routes unchanged (`/`, `/login`, `/signup`, marketing)
- Admin routes (`/admin/*`) for platform ops (thin, role-gated)

### Out of scope
- Page content / feature UI — each page's functionality is Chunk D's problem (Chunk B only creates the route scaffolding + shells)
- Landing page revamp — Chunk A
- API route restructure — keep as-is; add new API routes for Chunk C features

---

## 2. Decision log

| # | Decision | Choice | Rationale |
|---|---|---|---|
| B1 | Top-level segments | `/brand/*` and `/creator/*` (NOT `/dashboard/brand/*`) | Cleaner URLs, shareable, matches product owner's stated preference |
| B2 | Post-login redirect | Role-aware — brand → `/brand/dashboard`, creator → `/creator/dashboard` | Default lands user in their space |
| B3 | Wrong-role access | Silent redirect to own role's equivalent or dashboard | No hostile error messages |
| B4 | Settings page | **Per-role** (`/brand/settings`, `/creator/settings`) — NOT shared | Brand settings (GSTIN, team) ≠ Creator settings (KYC, bio, IG). Duplicating route avoids conditional rendering hell. |
| B5 | Legacy `/dashboard/*` | 308 permanent redirect to new `/brand/*` or `/creator/*` based on user role | Preserves bookmarks, SEO, link equity |
| B6 | Mobile nav | Bottom tab bar, 5 tabs, role-specific | Mobile-first navigation pattern |
| B7 | Desktop nav | Side nav (expandable, 240px wide, collapses to 64px icon-only) | Follows Linear/Notion pattern |
| B8 | Admin routes | `/admin/*` top-level, role-gated (role = 'admin' in users table) | Separate from brand/creator to avoid privilege confusion |
| B9 | Onboarding | Per role (`/brand/onboarding`, `/creator/onboarding`) under role segment | Onboarding is role-specific anyway |
| B10 | Route groups | Use Next 16 `(shell)` groups inside each role for shared layouts | Next App Router idiomatic |

---

## 3. Architecture principles

1. **Role is first-class URL segment.** The URL tells you what space you're in. No ambiguous shared paths.
2. **Shell layouts scoped to role.** Brand layout ≠ creator layout — different sidebar items, different theme accent, different bottom nav.
3. **Auth state checked at middleware.** Role-aware redirects happen before page render.
4. **Progressive enhancement.** Layout works without JS for initial render (critical for SEO on marketing + login).
5. **No conditional rendering inside shared components.** If brand and creator need different UI, make two components. Don't `{role === 'brand' ? <BrandX /> : <CreatorX />}`.

---

## 4. Route map

### 4.1 Public routes (unchanged)

```
/                        Landing page (Chunk A will revamp content)
/for-brands              Marketing page for brand audience
/for-creators            Marketing page for creator audience
/pricing                 Credit pack pricing page
/about                   About/mission page
/contact                 Contact / support
/terms                   T&C
/privacy                 Privacy policy
/dpdp                    DPDP compliance disclosure
```

### 4.2 Auth routes

```
/login                   Email entry → OTP send
/signup                  Role selection (brand / creator)
/signup/brand            Brand signup form
/signup/creator          Creator signup form  
/auth/verify             8-digit OTP entry
/auth/callback           OAuth return (future — not MVP)
/forgot-password         (Not actively used w/ OTP but path reserved)
/reset-password          (Not actively used w/ OTP but path reserved)
```

### 4.3 Brand routes (`/brand/*`)

```
/brand/dashboard         Brand home — credits balance, active licenses, recent activity
/brand/onboarding        5-step brand setup wizard
/brand/onboarding/[step]
/brand/credits           Balance, transaction history, top-up CTA
/brand/credits/top-up    Credit pack selection + Cashfree Collect checkout
/brand/creators          Browse/search creators (discovery)
/brand/creators/[id]     Creator profile — likeness samples, license offerings, stats
/brand/licenses          All license requests (tabs: active / pending / past)
/brand/licenses/new      Request new license — select creator + template
/brand/licenses/[id]     Single license detail — chat, progress, image gallery
/brand/sessions          Collaboration sessions view (legacy "campaigns" renamed)
/brand/sessions/[id]     Single session — all licenses + generations under it
/brand/settings          Company settings, team, brand kit
/brand/settings/billing  Invoices, tax documents, GSTIN
/brand/settings/team     Multi-user access (V2, schema ready)
/brand/settings/api-keys Developer API (V2)
```

### 4.4 Creator routes (`/creator/*`)

```
/creator/dashboard       Creator home — earnings, requests count, pending approvals
/creator/onboarding      7-step creator setup wizard (per HTML flow)
/creator/onboarding/[step]
/creator/listings        My license listings (Creation / Creation+Promotion)
/creator/listings/new    Create new listing
/creator/listings/[id]   Edit listing (price/quota/validity)
/creator/requests        Incoming license requests (tabs: new / accepted / rejected)
/creator/requests/[id]   Review single request + sign contract
/creator/sessions        Active collab sessions
/creator/sessions/[id]   Single session with brand
/creator/approvals       Pending image approvals queue
/creator/approvals/[id]  Review single generated image
/creator/earnings        Balance, pending, withdrawal history
/creator/earnings/withdraw  Initiate withdrawal + live deduction calc
/creator/kyc             KYC verification flow (PAN → Aadhaar → bank)
/creator/reference-photos  Manage likeness gallery (upload/delete)
/creator/settings        Profile, bio, IG handle, availability
/creator/settings/notifications  Email/push preferences
```

### 4.5 Shared utility routes (`/u/*`)

```
/u/generations/[id]      Public generation preview (watermarked) — for sharing
/u/profile/[creator_id]  Public creator profile — read-only landing page
```

### 4.6 Admin routes (`/admin/*`)

```
/admin                   Admin dashboard (ops metrics)
/admin/disputes          All disputes queue
/admin/disputes/[id]     Single dispute with ledger context
/admin/ledgers           Financial ledger drill-down (credit / escrow / tax)
/admin/reconcile         Cashfree reconciliation status
/admin/users             User management
/admin/users/[id]        Single user detail (impersonate, KYC override)
/admin/contracts         Contract template management
/admin/audit-log         Audit log viewer
```

### 4.7 API routes (unchanged location, add new)

```
# Existing (keep)
/api/auth/*              OTP flow
/api/health              Health check
/api/inngest             Inngest webhook

# New for Chunk C
/api/cashfree/webhook    Cashfree events (payment, payout, kyc)
/api/credits/top-up      Create top-up order
/api/licenses/request    Brand requests a license
/api/licenses/[id]/accept   Creator accepts + signs contract
/api/licenses/[id]/reject   Creator rejects request
/api/licenses/[id]/contract/view   Generate signed URL for contract PDF
/api/withdrawals/create  Creator initiates withdrawal
/api/kyc/submit-pan      PAN submission
/api/kyc/submit-aadhaar  Aadhaar submission
/api/kyc/submit-bank     Bank account + penny drop
/api/images/[id]/approve Creator approves image
/api/images/[id]/reject  Creator rejects image + reason

# Existing routes to migrate/rename
/api/wallet/*            DELETE — replaced by /api/credits/*
/api/campaigns/*         KEEP but alias under /api/sessions/*
```

---

## 5. Middleware (`proxy.ts`) changes

### 5.1 Role-aware routing logic

```typescript
// Pseudocode — actual implementation in src/proxy.ts

async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await getSessionUser();

  // 1. Public routes — no checks
  if (isPublicRoute(pathname)) return next();

  // 2. Auth routes — redirect logged-in to role home
  if (isAuthRoute(pathname) && user) {
    return redirectToRoleHome(user.role);
  }

  // 3. Protected routes — must be logged in
  if (!user) return redirectToLogin(pathname);

  // 4. Legacy dashboard redirects
  if (pathname.startsWith('/dashboard/')) {
    return redirectLegacyPath(pathname, user.role);
  }

  // 5. Role boundary enforcement
  if (pathname.startsWith('/brand/') && user.role !== 'brand') {
    return redirectToRoleHome(user.role);  // wrong role, silent redirect
  }
  if (pathname.startsWith('/creator/') && user.role !== 'creator') {
    return redirectToRoleHome(user.role);
  }
  if (pathname.startsWith('/admin/') && user.role !== 'admin') {
    return redirectToRoleHome(user.role);
  }

  // 6. Onboarding gate
  // If brand/creator hasn't completed onboarding AND not already on onboarding path
  //   → redirect to /{role}/onboarding
  const onboardingComplete = await checkOnboardingComplete(user);
  if (!onboardingComplete && !pathname.includes('/onboarding')) {
    return redirect(`/${user.role}/onboarding`);
  }

  return next();
}

function redirectToRoleHome(role: 'brand' | 'creator' | 'admin') {
  switch (role) {
    case 'brand': return redirect('/brand/dashboard');
    case 'creator': return redirect('/creator/dashboard');
    case 'admin': return redirect('/admin');
  }
}
```

### 5.2 Legacy redirect map (308 Permanent)

```
/dashboard                   → /{role}/dashboard
/dashboard/campaigns         → /{role}/sessions (if brand), /creator/sessions (if creator)
/dashboard/generations/*     → /{role}/sessions/[parent-session]
/dashboard/creators          → /brand/creators (if brand)
/dashboard/creators/[id]     → /brand/creators/[id]
/dashboard/approvals         → /creator/approvals (if creator)
/dashboard/approvals/[id]    → /creator/approvals/[id]
/dashboard/wallet            → /brand/credits (if brand), /creator/earnings (if creator)
/dashboard/onboarding        → /{role}/onboarding
/dashboard/brand-setup       → /brand/onboarding
/dashboard/settings          → /{role}/settings
/dashboard/likeness          → /creator/reference-photos
/dashboard/analytics         → /{role}/dashboard  (analytics merged into dashboard home)
```

These live in a typed map in `src/config/legacy-redirects.ts`. Proxy reads map, constructs redirect URL.

### 5.3 Onboarding gating

Brand onboarding steps (5): Company info → GSTIN (optional) → Brand kit → Use case → Starter credit offer
Creator onboarding steps (7 per HTML): Basic info → Reference photos → Likeness agreement (DPDP) → Category/subcategory → Blocked concepts (compliance) → License listings → KYC (bank can be deferred)

If user hits any `/{role}/*` route except `/{role}/onboarding/*`, they're redirected to the next incomplete step.

---

## 6. Shell layouts

### 6.1 Directory structure

```
src/app/
├── layout.tsx              # Root — fonts, theme provider, global providers
├── loading.tsx
├── error.tsx
├── not-found.tsx
│
├── (marketing)/            # Route group — no auth, public layout
│   ├── layout.tsx         # Marketing shell (header, footer, CTA)
│   ├── page.tsx           # Landing (Chunk A)
│   ├── for-brands/page.tsx
│   ├── for-creators/page.tsx
│   ├── pricing/page.tsx
│   ├── about/page.tsx
│   ├── contact/page.tsx
│   ├── terms/page.tsx
│   ├── privacy/page.tsx
│   └── dpdp/page.tsx
│
├── (auth)/                 # Route group — public, auth-focused layout
│   ├── layout.tsx         # Auth shell (centered card, logo only)
│   ├── login/page.tsx
│   ├── signup/page.tsx    # Role selector
│   ├── signup/brand/page.tsx
│   ├── signup/creator/page.tsx
│   └── auth/verify/page.tsx
│
├── brand/                  # Brand space
│   ├── layout.tsx         # BrandShell — ocean theme
│   ├── dashboard/page.tsx
│   ├── onboarding/
│   │   ├── layout.tsx     # OnboardingShell (progress bar, no sidebar)
│   │   └── page.tsx
│   ├── credits/...
│   ├── creators/...
│   ├── licenses/...
│   ├── sessions/...
│   └── settings/...
│
├── creator/                # Creator space
│   ├── layout.tsx         # CreatorShell — blush theme
│   ├── dashboard/page.tsx
│   ├── onboarding/
│   │   ├── layout.tsx     # OnboardingShell
│   │   └── page.tsx
│   ├── listings/...
│   ├── requests/...
│   ├── sessions/...
│   ├── approvals/...
│   ├── earnings/...
│   ├── kyc/...
│   ├── reference-photos/...
│   └── settings/...
│
├── admin/                  # Admin space
│   ├── layout.tsx         # AdminShell — neutral theme
│   ├── page.tsx
│   ├── disputes/...
│   ├── ledgers/...
│   ├── reconcile/...
│   ├── users/...
│   └── audit-log/...
│
├── u/                      # Public utility routes
│   ├── layout.tsx         # Minimal public layout
│   ├── generations/[id]/page.tsx
│   └── profile/[creator_id]/page.tsx
│
└── api/                    # API routes (Next 16 route handlers)
    └── ...
```

### 6.2 BrandShell layout (`src/app/brand/layout.tsx`)

**Desktop (lg+)**
- Left side nav (240px expanded, collapses to 64px)
  - Logo at top (64px tile)
  - Nav items: Dashboard / Creators / Licenses / Sessions / Credits / Settings
  - User avatar + name at bottom, popover menu on click (logout, switch, help)
- Main content area — max-width 1280px, ocean-tinted subtle gradient at top
- Top bar (56px) with: page title, credits balance chip (animated counter), notifications bell, search (⌘K)

**Mobile (< lg)**
- No side nav
- Top bar simpler: hamburger → drawer with nav items, logo centered, notifications right
- Bottom nav: 5 tabs (Home / Creators / Licenses / Credits / Profile) fixed bottom, 64px + safe-area
- FAB floating "New license" button above bottom nav on relevant pages

### 6.3 CreatorShell layout (`src/app/creator/layout.tsx`)

Same structure as BrandShell but:
- Blush theme accents
- Nav items: Dashboard / Requests / Approvals / Sessions / Earnings / Listings / Settings
- Mobile bottom nav: Home / Requests / Approvals / Earnings / Profile (Listings accessible via Profile menu)
- Top bar shows pending balance chip (animated, gold tint)

### 6.4 OnboardingShell layout

Used for `/brand/onboarding/*` and `/creator/onboarding/*`:
- No sidebar, no bottom nav — focus mode
- Top bar: logo + step progress (animated Framer width), step count ("3 of 7"), "Save & exit" link
- Main area: centered card (max-width 720px)
- Bottom: prev/next buttons, fixed on mobile

### 6.5 AdminShell layout

- Neutral grey theme (not ocean/blush — visually distinct from user roles)
- Side nav always expanded (admins get more screen budget)
- Top bar shows impersonation status if active (loud warning banner)
- No mobile bottom nav — admin is desktop-first

---

## 7. Components to build (Chunk B)

Living in `src/components/layouts/`:

```
src/components/layouts/
├── brand-shell.tsx
├── creator-shell.tsx
├── admin-shell.tsx
├── onboarding-shell.tsx
├── marketing-shell.tsx
├── auth-shell.tsx
│
├── nav/
│   ├── side-nav.tsx               # Desktop side nav (role-themed via props)
│   ├── side-nav-item.tsx
│   ├── mobile-bottom-nav.tsx      # 5-tab fixed bottom (role-themed)
│   ├── mobile-nav-drawer.tsx      # Hamburger overlay drawer
│   ├── top-bar.tsx                # Sticky header
│   ├── user-menu.tsx              # Avatar dropdown
│   ├── notifications-popover.tsx
│   └── command-palette.tsx        # ⌘K search (desktop only)
│
└── brand-kit/
    ├── balance-chip.tsx           # Animated counter chip
    ├── role-theme-provider.tsx    # Injects role accent CSS var
    └── page-title.tsx             # h1 with subtle entrance animation
```

### 7.1 Motion specs

| Component | Animation | Timing |
|---|---|---|
| Side nav collapse | Width spring 240 → 64 | 280ms spring |
| Side nav expand on hover (when collapsed) | Width spring 64 → 240 | 220ms spring |
| Mobile drawer open | Slide-in from left + backdrop fade | 280ms |
| Mobile bottom nav tab switch | Indicator slide + icon color interp | 200ms |
| Command palette open | Scale 0.96 → 1 + fade, backdrop fade | 220ms |
| User menu popover | Scale 0.95 + fade, origin top-right | 180ms |
| Page route transition (AnimatePresence) | Fade + y 12 → 0 | 400ms enter, 200ms exit |
| Balance chip count-up on change | Tween number with cubic-out | 800ms |
| Onboarding step progress bar | Width transition | 320ms |
| Notifications bell on new notification | Tilt wiggle + pulse dot | 400ms |

### 7.2 Mobile-specific

- Bottom nav always visible on `< lg`, hidden on `lg+`
- Safe area padding: `pb-[max(1rem,env(safe-area-inset-bottom))]`
- Tab indicator uses `layoutId` from Framer for smooth cross-tab transitions
- Touch targets: every nav item ≥ 44×44px

---

## 8. Theme injection

Role determines accent color variable. Each shell does:

```tsx
// In brand-shell.tsx
<div style={{ '--role-accent': 'var(--color-ocean)', '--role-accent-strong': '#8aabc8' } as CSSProperties}>
  {children}
</div>

// In creator-shell.tsx
<div style={{ '--role-accent': 'var(--color-blush)', '--role-accent-strong': '#d4949a' }}>
  {children}
</div>
```

Child components reference `var(--role-accent)` for chips, hovers, progress fills. Same component code, role-specific appearance.

---

## 9. Accessibility

- All role shells have correct landmarks (`header`, `nav`, `main`, `footer`)
- Skip-to-content link in top bar (hidden until focused)
- Mobile drawer: focus-trap, ESC close, return focus to trigger
- Bottom nav: `role="navigation"`, `aria-label="Main navigation"`, current tab has `aria-current="page"`
- Keyboard shortcuts: ⌘K (search), G-H (go home), G-L (licenses), documented in in-app help
- Reduced-motion: all transitions drop to 150ms fade

---

## 10. Files to create / modify

### Create
```
src/app/brand/layout.tsx
src/app/brand/dashboard/page.tsx               (stub, populated in Chunk D)
src/app/brand/onboarding/layout.tsx
src/app/brand/onboarding/page.tsx
src/app/brand/credits/page.tsx                 (stub)
src/app/brand/creators/page.tsx                (stub)
src/app/brand/licenses/page.tsx                (stub)
src/app/brand/sessions/page.tsx                (stub)
src/app/brand/settings/page.tsx                (stub)

src/app/creator/layout.tsx
src/app/creator/dashboard/page.tsx             (stub)
src/app/creator/onboarding/layout.tsx
src/app/creator/onboarding/page.tsx
src/app/creator/listings/page.tsx              (stub)
src/app/creator/requests/page.tsx              (stub)
src/app/creator/sessions/page.tsx              (stub)
src/app/creator/approvals/page.tsx             (stub)
src/app/creator/earnings/page.tsx              (stub)
src/app/creator/kyc/page.tsx                   (stub)
src/app/creator/reference-photos/page.tsx      (stub)
src/app/creator/settings/page.tsx              (stub)

src/app/admin/layout.tsx
src/app/admin/page.tsx                         (stub)

src/app/u/layout.tsx
src/app/u/generations/[id]/page.tsx            (stub)
src/app/u/profile/[creator_id]/page.tsx        (stub)

src/components/layouts/brand-shell.tsx
src/components/layouts/creator-shell.tsx
src/components/layouts/admin-shell.tsx
src/components/layouts/onboarding-shell.tsx
src/components/layouts/nav/side-nav.tsx
src/components/layouts/nav/side-nav-item.tsx
src/components/layouts/nav/mobile-bottom-nav.tsx
src/components/layouts/nav/mobile-nav-drawer.tsx
src/components/layouts/nav/top-bar.tsx
src/components/layouts/nav/user-menu.tsx
src/components/layouts/nav/notifications-popover.tsx
src/components/layouts/nav/command-palette.tsx
src/components/layouts/brand-kit/balance-chip.tsx
src/components/layouts/brand-kit/role-theme-provider.tsx
src/components/layouts/brand-kit/page-title.tsx

src/config/legacy-redirects.ts
src/config/nav-items.brand.ts
src/config/nav-items.creator.ts
src/config/nav-items.admin.ts
```

### Modify
```
src/proxy.ts                                    (add role logic, legacy redirects)
src/config/navigation.ts                        (split into role-specific nav configs)
src/config/site.ts                              (update route constants)
src/app/layout.tsx                              (add role theme provider)
src/app/(dashboard)/dashboard/page.tsx          (deprecate — will be deleted after migration)
```

### Delete (after 90 days, not in initial Chunk B)
```
src/app/(dashboard)/dashboard/                  (entire directory, once all users migrated)
```

### Keep unchanged
```
src/app/(marketing)/
src/app/(auth)/
src/app/api/ (add new routes in Chunk C/D, don't restructure)
```

---

## 11. Migration safety

### 11.1 Soft cutover strategy
1. Ship new `/brand/*` and `/creator/*` alongside existing `/dashboard/*` (both work simultaneously)
2. Add 308 redirects from legacy paths (proxy reads user role, redirects)
3. Update all internal links to new paths
4. Monitor for external inbound traffic to old paths (PostHog event)
5. After 90 days of < 1% legacy traffic, delete `/app/(dashboard)/`

### 11.2 Testing
- Playwright e2e: each role lands on correct dashboard post-login
- Playwright e2e: wrong-role URL access silently redirects
- Playwright e2e: legacy paths redirect correctly for both roles
- Unit tests: `proxy.ts` role logic (matrix: role × path × auth state)
- Mobile viewport (iPhone 12 Pro): bottom nav renders, tap targets ≥ 44px

---

## 12. Performance notes

### Bundle impact
- New shells add ~12KB gzipped (Framer Motion already loaded)
- Role-specific nav configs are tree-shaken (brand shell doesn't bundle creator nav)
- Lottie illustrations for empty states: lazy-loaded per page

### Mobile
- Bottom nav uses CSS `position: sticky` + `bottom: 0` + backdrop blur
- Safe-area-inset handled via `env()` — no JS measurement
- Nav drawer is portal-based, prerendered offscreen, shown on demand (no layout thrash)

---

## 13. Success criteria

Chunk B complete when:

1. ✅ Logged-in brand auto-lands on `/brand/dashboard`
2. ✅ Logged-in creator auto-lands on `/creator/dashboard`
3. ✅ Wrong-role URL silently redirects to own role's equivalent
4. ✅ Old `/dashboard/*` paths 308-redirect to new location
5. ✅ BrandShell renders ocean-themed side nav (desktop) + bottom nav (mobile)
6. ✅ CreatorShell renders blush-themed side nav + bottom nav
7. ✅ AdminShell renders (for role=admin users only)
8. ✅ Onboarding gate works — incomplete users redirected to onboarding
9. ✅ Keyboard navigation: tab order makes sense, ⌘K opens command palette
10. ✅ Mobile test on iPhone SE (375×667): no horizontal scroll, bottom nav visible + tappable
11. ✅ Lighthouse mobile: perf ≥ 90, a11y ≥ 95 on brand dashboard stub
12. ✅ Motion specs match (tested manually — side nav collapse spring, page transitions, bottom nav indicator)

---

*End of Chunk B spec. Page content + features come in Chunk D.*
