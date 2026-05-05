# Faiceoff Marketplace Flow Redesign — Design Spec

**Date:** 2026-05-06
**Status:** Locked, ready for implementation
**Implementer:** Sonnet 4.6 (normal mode)
**Approved by:** Pranav (project owner)

---

## 0. How To Read This Document

This is the **single source of truth** for the new marketplace flow. Sonnet, when implementing, must:

1. Read this entire document end-to-end **before writing any code**
2. Implement strictly in the **phase order** in §15 — never skip ahead
3. After each phase, run `npm run typecheck && npm run build` and verify success before moving to next phase
4. If anything in this spec contradicts existing code, **this spec wins** — update the code, not the spec
5. If you find ambiguity that affects implementation, **stop and ask Pranav** before guessing

The current codebase has been preserved in commits up to `0ffd50f`. Use git history if you need to understand legacy behavior.

---

## 1. Executive Summary

Faiceoff is being redesigned from a **direct-generation campaign model** (brand picks creator → starts generating immediately) to a **request-based collab marketplace** (brand requests collab → creator accepts → contract signed → brand pays → generation begins).

**Why:** Current flow is too transactional and doesn't match how brand-creator collaborations work in industry. The new flow adds professional structure (request → accept → agreement → payment → generation → approval → payout) that creators and brands expect from a real licensing marketplace.

**Key changes:**
- New **Packages** model (Frame / Feature / Cover) replaces flat per-category pricing
- New **Collab Request** flow before any generation can begin
- New **Studio** (the brand's creative workspace inside each collab) replaces the current campaign-creation sheet
- Simpler **commission model** (15% from creator, no separate brand fee)
- Manual **payouts** via admin (RazorpayX automation deferred)
- Updated **navigation** for both creator and brand
- New **Reference Mode** in Studio (Gemini Flash analyzes uploaded reference image to auto-fill brief)

---

## 2. Goals & Non-Goals

### Goals
- Brand never generates without creator's explicit acceptance
- Creator sees structured collab requests with package, brief, and price upfront
- Each collab is a self-contained workspace with chat + studio + vault + details
- Creator earns transparent percentage (85%) with no hidden fees
- Per-image license certificates remain the legal proof artifact

### Non-Goals (NOT in scope for this redesign)
- Razorpay payment integration (still pending Razorpay keys — Cashfree stays as-is until those land)
- Automated RazorpayX payouts (manual admin payouts for MVP)
- Instagram OAuth (use existing self-reported flow; OAuth is a follow-up)
- TDS / GST automation (compliance items handled separately by CA later)
- Mobile app (web-only)
- Counter-offers on collab requests (creator only accepts or declines, no negotiation)
- Multi-image bulk generation in Studio (one generation at a time, always)

---

## 3. Current State (Reference)

### Current Database Tables (relevant ones)
- `creators` — creator profiles (with `is_active`, `onboarding_step`)
- `creator_categories` — `(creator_id, category, price_per_generation_paise, is_active)` — **flat per-category pricing, will be deprecated for new flow but kept for compliance/niche tracking**
- `creator_compliance_vectors` — blocked categories (keep)
- `creator_reference_photos` — face refs (keep)
- `collab_sessions` — renamed from `campaigns` in 00025 (keep, minor additions)
- `generations` — image generation records (keep, status enum already supports the flow)
- `approvals` — creator approval records (keep, fits new flow as-is)
- `conversations` + `conversation_messages` — chat (keep, but unlock condition changes)

### Current Pages (relevant)
- `/creator/dashboard` — overview
- `/creator/approvals` — pending image approvals (will be **moved into collab workspace**)
- `/creator/inbox` — chat (will be **moved into collab workspace**)
- `/creator/likeness` — face refs (keep)
- `/creator/earnings` — earnings (keep, **add bank account section**)
- `/creator/withdraw` — withdrawal request (keep)
- `/brand/dashboard` — overview
- `/brand/discover` — creator browsing (keep, update card fields)
- `/brand/discover/[creatorId]` — creator profile + Launch panel (refactor for packages)
- `/brand/sessions` + `/brand/sessions/[id]` — current campaign list (will be **renamed/restructured to /brand/collabs**)
- `/brand/vault` — top-level vault (keep)
- `/brand/inbox` — chat (will be **moved into collab workspace**)
- `/dashboard/onboarding/*` — 8 onboarding steps (will be **simplified to 6, packages step removed**)
- `/dashboard/creators/[id]/start-campaign-sheet.tsx` — current generation form (will be **replaced by Studio**)

### Current API Routes (relevant)
- `/api/onboarding/save-pricing` — saves to `creator_categories.price_per_generation_paise` (will be repurposed)
- `/api/campaigns/create` — creates collab_session + N generations + dispatches `runGenerationsBatch` (will be **completely rewritten as `/api/collabs/start-generation` triggered after payment**)
- `/api/generations/[id]/send-for-approval` — brand sends image to creator (keep)
- `/api/generations/[id]/retry` — brand retry (keep)
- `/api/generations/[id]/discard` — brand discard (keep)
- `/api/approvals/[id]/approve` — creator approves (keep, update payout-trigger logic)
- `/api/approvals/[id]/reject` — creator rejects (keep)
- `/api/chat/conversations` — chat list/create (update unlock condition)

---

## 4. Target State — Full Flow Walkthrough

### 4.1 Creator Journey

```
SIGNUP (existing)
  Email → 8-digit OTP via Resend → Supabase user + creators row
       ↓
ONBOARDING (6 steps, simplified)
  1. Identity     → display_name, DOB, city
  2. Social       → instagram_handle + followers (self-reported), optional youtube URL
  3. Categories   → niches multi-select (drives creator_categories rows; price field DEPRECATED)
  4. Photos       → face refs upload (current flow, unchanged — face embedding still runs)
  5. Compliance   → blocked categories (current flow, unchanged)
  6. Consent      → DPDP + Faiceoff Terms + Creator Likeness Agreement (NEW expanded consent)
       ↓
ONBOARDING COMPLETE → Creator hits dashboard, NOT live yet
       ↓
SET PACKAGES (in My Packages section)
  Creator opens /creator/packages
  Fills 1-3 packages (Frame, Feature, Cover) with price + final_images per tier
  Activates at least one
       ↓
GO LIVE
  Creator clicks "Go Live" toggle in /creator/packages
  creators.is_live = true → appears on /brand/discover
       ↓
RECEIVE COLLAB REQUEST (when brand sends one)
  Notification → /creator/requests
  Card shows: brand name, package tier, price, product, brief one-liner
  [View] → opens detail sheet with full T&C + product image
       ↓
ACCEPT WITH AGREEMENT
  Creator clicks "Accept" on detail
  T&C modal opens (auto-generated from package terms + Likeness Agreement clauses)
  Creator ticks "I agree" + clicks "Confirm & Accept"
  → collab_request.status = 'accepted'
  → conversation created (chat unlocks immediately)
  → Brand receives notification "request accepted, payment required"
       ↓
WAIT FOR BRAND PAYMENT
  Brand pays → collab_session created, generation credits unlocked
       ↓
COLLAB ACTIVE — appears in /creator/collabs
  Creator opens collab → 3 tabs: Chat | Images | Details
  Brand sends an image for approval → appears in Images tab with 48h timer
  Creator approves or rejects with feedback
  Each approval increments collab.approved_count, money is logically released to creator's earnings
  When approved_count = final_images → collab.status = 'completed'
       ↓
PAYOUT
  /creator/earnings shows accrued amount
  Creator clicks "Request Withdrawal" → enters/confirms bank account → submits
  Admin sees request → manually transfers via UPI/NEFT → marks as paid
  Creator receives notification + payout record created
```

### 4.2 Brand Journey

```
SIGNUP (existing flow, kept)
       ↓
ONBOARDING (3 steps, simplified)
  1. Company info  → company_name, industry, website, logo
  2. GST           → gst_number (optional, can skip)
  3. Welcome       → "Explore creators, top up wallet when you're ready"
       ↓
DASHBOARD — explore freely, no wallet required yet
       ↓
DISCOVER → /brand/discover
  Browse creators (filtered by niche, price range, rating)
  Click a creator → /brand/discover/[creatorId] → full profile + 1-3 package cards
       ↓
SEND COLLAB REQUEST
  Click any package card → request form opens
  Fill: product name, product image upload, one-liner brief
  Submit → collab_request created (status='pending')
  Notification sent to creator
       ↓
WAIT FOR CREATOR ACCEPTANCE (notification)
       ↓
PAYMENT
  Creator accepted → /brand/collabs/[id] payment screen unlocks
  Razorpay (or Cashfree until swap) checkout → payment
  → collab_session created with package metadata
  → generation_credits unlocked = final_images × 3
       ↓
STUDIO (inside the collab workspace)
  /brand/collabs/[id]/studio
  Two modes: Reference Mode (upload ref image → Gemini Flash analyzes → auto-fills) OR Manual Mode
  Brand fills brief → Generate → Gemini 3 Pro Image returns
  Brand reviews → [Send to Creator] [Retry] [Discard]
  Sent images appear in creator's view
       ↓
TRACKING IMAGES
  Studio shows all generated images with status badges
  When creator approves → ✅ + License Certificate link
  When creator rejects → ❌ + feedback (brand can regenerate using feedback)
       ↓
COLLAB COMPLETE
  All final_images approved → collab status='completed'
  Brand can download single + bulk from collab Vault tab AND top-level /brand/vault
  License clock starts (90d / 6mo / 12mo per package tier)
```

---

## 5. Database Schema Changes

All migrations go in `supabase/migrations/` in order. Migration numbers continue from 00040.

### Migration 00041 — `creator_packages` Table (NEW)

**File:** `supabase/migrations/00041_creator_packages.sql`

```sql
-- Creator-defined collaboration packages.
-- Tier name + usage scope are platform-fixed; creator only sets price + final_images.

create table public.creator_packages (
  id              uuid primary key default extensions.uuid_generate_v4(),
  creator_id      uuid not null references public.creators(id) on delete cascade,
  tier            text not null check (tier in ('frame', 'feature', 'cover')),
  price_paise     integer not null check (price_paise >= 150000), -- ₹1,500 minimum floor
  final_images    integer not null check (final_images between 1 and 20),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (creator_id, tier)  -- one row per creator per tier
);

create index idx_creator_packages_creator on public.creator_packages(creator_id);
create index idx_creator_packages_active on public.creator_packages(creator_id, is_active) where is_active = true;

-- RLS
alter table public.creator_packages enable row level security;

create policy "Creators read own packages" on public.creator_packages
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
create policy "Creators write own packages" on public.creator_packages
  for all using (creator_id in (select id from public.creators where user_id = auth.uid()));
create policy "Anyone reads active packages" on public.creator_packages
  for select using (is_active = true);

create trigger on_creator_packages_updated
  before update on public.creator_packages
  for each row execute function public.handle_updated_at();

-- Computed in application code (not as generated column due to portability):
--   gen_credits = final_images × 3
--   usage_scope is mapped from tier:
--     frame    → 'social_organic'      (90 days)
--     feature  → 'social_paid'         (6 months)
--     cover    → 'digital_full'        (12 months)
-- The `commercial_pro` scope from brainstorm is reserved for future addition.

comment on table public.creator_packages is
  'Creator-defined collab packages. Tier (frame/feature/cover) fixes name + usage scope. Creator sets price + final_images count. gen_credits computed in app as final_images × 3.';
```

### Migration 00042 — Add `is_live` to `creators` (NEW)

**File:** `supabase/migrations/00042_creator_live_flag.sql`

```sql
-- Separate "is_live" from "is_active". A creator may be active (account intact)
-- but paused (not accepting new requests). Brands only see is_live=true creators.

alter table public.creators
  add column is_live boolean not null default false;

create index idx_creators_is_live on public.creators(is_live) where is_live = true;

comment on column public.creators.is_live is
  'Creator visible on Discover and accepts new collab requests. Set to true only after onboarding complete + at least one package active. Toggleable from /creator/packages.';
```

### Migration 00043 — `collab_requests` Table (NEW)

**File:** `supabase/migrations/00043_collab_requests.sql`

```sql
-- Brand → Creator collaboration requests. Sit between "discover" and "active collab".
-- Once accepted + paid, a collab_session row is created (existing table).

create table public.collab_requests (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  brand_id            uuid not null references public.brands(id) on delete cascade,
  creator_id          uuid not null references public.creators(id) on delete cascade,
  package_id          uuid not null references public.creator_packages(id) on delete restrict,

  -- Snapshot of package terms at request time (immune to creator changes mid-flight)
  package_tier        text not null check (package_tier in ('frame', 'feature', 'cover')),
  package_price_paise integer not null,
  final_images        integer not null,
  gen_credits         integer not null,
  usage_scope         text not null check (usage_scope in ('social_organic', 'social_paid', 'digital_full')),
  license_duration_days integer not null,

  -- Brief (brand fills these on request)
  product_name        text not null,
  product_image_url   text not null,
  brief_one_liner     text not null check (length(brief_one_liner) between 1 and 500),

  status              text not null check (status in (
    'pending',     -- waiting for creator decision
    'accepted',    -- creator accepted, awaiting brand payment
    'declined',    -- creator declined
    'paid',        -- brand paid, collab_session created (terminal for this row)
    'expired',     -- creator didn't respond in time
    'cancelled'    -- brand cancelled before acceptance
  )) default 'pending',

  decline_reason      text,
  expires_at          timestamptz not null,  -- typically created_at + 72h
  decided_at          timestamptz,
  paid_at             timestamptz,
  collab_session_id   uuid references public.collab_sessions(id),  -- linked once paid

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_collab_requests_brand on public.collab_requests(brand_id, status);
create index idx_collab_requests_creator on public.collab_requests(creator_id, status);
create index idx_collab_requests_pending_expiry on public.collab_requests(expires_at) where status = 'pending';

alter table public.collab_requests enable row level security;
create policy "Brand reads own requests" on public.collab_requests
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));
create policy "Creator reads own requests" on public.collab_requests
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
-- Inserts/updates go through admin client in API routes only.

create trigger on_collab_requests_updated
  before update on public.collab_requests
  for each row execute function public.handle_updated_at();

comment on table public.collab_requests is
  'Brand-initiated collab requests. Snapshots package terms at request time. Transitions: pending → accepted → paid → (links collab_session). Or pending → declined/expired/cancelled.';
```

### Migration 00044 — Extend `collab_sessions` for Package Linkage (NEW)

**File:** `supabase/migrations/00044_collab_session_package_link.sql`

```sql
-- Link a collab_session back to its originating package + request, and snapshot
-- approved_count for fast progress display.

alter table public.collab_sessions
  add column collab_request_id uuid references public.collab_requests(id),
  add column package_id uuid references public.creator_packages(id),
  add column package_tier text check (package_tier in ('frame', 'feature', 'cover')),
  add column package_price_paise integer,
  add column final_images_target integer,
  add column approved_count integer not null default 0,
  add column gen_credits_total integer,
  add column gen_credits_used integer not null default 0,
  add column usage_scope text check (usage_scope in ('social_organic', 'social_paid', 'digital_full')),
  add column license_expires_at timestamptz;

create index idx_collab_sessions_package on public.collab_sessions(package_id) where package_id is not null;
create index idx_collab_sessions_request on public.collab_sessions(collab_request_id) where collab_request_id is not null;

comment on column public.collab_sessions.approved_count is
  'Cached count of approved generations within this session. Updated by approvals trigger or in approve API route.';
comment on column public.collab_sessions.gen_credits_total is
  'Total generation credits granted at collab start (= final_images × 3).';
comment on column public.collab_sessions.license_expires_at is
  'Computed at collab completion: completed_at + (license_duration_days from package).';
```

### Migration 00045 — Bank Account Storage on Creators (NEW)

**File:** `supabase/migrations/00045_creator_bank_account.sql`

```sql
-- Bank account details for manual payouts.
-- Stored encrypted at rest; KYC_ENCRYPTION_KEY env var already exists.

alter table public.creators
  add column bank_account_holder_name text,
  add column bank_account_number_encrypted text,  -- AES-256-GCM
  add column bank_ifsc text,
  add column bank_added_at timestamptz;

comment on column public.creators.bank_account_number_encrypted is
  'AES-256-GCM ciphertext using KYC_ENCRYPTION_KEY env var. Decrypt only in admin payout flows.';
```

### Migration 00046 — Update `conversations` Unlock Condition (DOCUMENTATION ONLY)

The new flow unlocks chat at **collab_request acceptance**, not at first approval. This is enforced at the API layer (in `/api/chat/conversations` POST), so no schema change required — but update the comment:

**File:** `supabase/migrations/00046_chat_unlock_condition_update.sql`

```sql
comment on table public.conversations is
  'Brand-creator DM threads. Created when collab_request.status transitions to accepted (was: post-first-approval, changed 2026-05). Unique per pair. Eligibility checked at API layer.';
```

### Migration 00047 — Drop Pricing From `creator_categories` (NEW)

**File:** `supabase/migrations/00047_deprecate_category_pricing.sql`

```sql
-- creator_categories.price_per_generation_paise is no longer the source of
-- truth — packages are. Keep the column for one release cycle (data audit /
-- rollback safety) but mark deprecated.

comment on column public.creator_categories.price_per_generation_paise is
  'DEPRECATED 2026-05: packages (creator_packages table) are now the pricing source. Column retained for one release for audit; new code MUST NOT read this. Will be dropped in a future migration.';
```

---

## 6. New Pages & Routes

### 6.1 Creator Side

| Route | File | Purpose | Replaces |
|---|---|---|---|
| `/creator/packages` | `src/app/(dashboard)/creator/packages/page.tsx` | Manage Frame/Feature/Cover + Go Live toggle | NEW |
| `/creator/requests` | `src/app/(dashboard)/creator/requests/page.tsx` | Pending collab requests list | NEW |
| `/creator/requests/[id]` | `src/app/(dashboard)/creator/requests/[id]/page.tsx` | Request detail + Accept/Decline | NEW |
| `/creator/collabs` | `src/app/(dashboard)/creator/collabs/page.tsx` | List of active/completed collabs | Replaces `/creator/collaborations` |
| `/creator/collabs/[id]` | `src/app/(dashboard)/creator/collabs/[id]/page.tsx` | Collab workspace (Chat / Images / Details tabs) | Replaces `/creator/inbox` + `/creator/approvals` |
| `/creator/earnings` | (existing — extend) | Add bank account section | Modified |

### 6.2 Brand Side

| Route | File | Purpose | Replaces |
|---|---|---|---|
| `/brand/onboarding` | `src/app/(dashboard)/brand/onboarding/page.tsx` | 3-step brand onboarding | NEW |
| `/brand/discover/[creatorId]` | (existing — refactor) | Show 1-3 package cards instead of "per-image" launch panel | Modified |
| `/brand/discover/[creatorId]/request` | `src/app/(dashboard)/brand/discover/[creatorId]/request/page.tsx` | Send collab request form | NEW |
| `/brand/collabs` | `src/app/(dashboard)/brand/collabs/page.tsx` | List of brand's collabs | Replaces `/brand/sessions` |
| `/brand/collabs/[id]` | `src/app/(dashboard)/brand/collabs/[id]/page.tsx` | Collab workspace (Chat / Studio / Vault / Details tabs) | NEW |
| `/brand/collabs/[id]/studio` | `src/app/(dashboard)/brand/collabs/[id]/studio/page.tsx` | Full-page Studio (generation workspace) | Replaces `start-campaign-sheet.tsx` |
| `/brand/collabs/[id]/payment` | `src/app/(dashboard)/brand/collabs/[id]/payment/page.tsx` | Payment screen (Razorpay/Cashfree checkout) | NEW |

### 6.3 Onboarding (Creator) — Reduce From 8 to 6 Steps

Current: identity → instagram → categories → compliance → consent → photos → ~~lora_review~~ → pricing → complete
**New:** identity → instagram → categories → photos → compliance → consent → complete

**Changes:**
- Pricing step **deleted** (`src/app/(dashboard)/dashboard/onboarding/pricing/page.tsx` — REMOVE)
- Order swap: photos comes BEFORE compliance (per Pranav: "photos is most crucial — front-load it")
- After consent → straight to `/dashboard/onboarding/complete` (which redirects to `/creator/dashboard`)
- `complete` step shows banner: "Set up your packages to go live → /creator/packages"

**File changes:**
- `src/app/api/onboarding/save-pricing/route.ts` — DELETE (no longer used)
- `src/app/api/onboarding/get-pricing/route.ts` — DELETE
- `src/app/api/onboarding/current-step/route.ts` — update STEP_ROUTES to remove `pricing` and `lora_review`; reorder photos before compliance
- `src/app/(dashboard)/dashboard/onboarding/page.tsx` — update STEP_ROUTES map likewise
- `src/app/(dashboard)/dashboard/onboarding/complete/page.tsx` — add "Go set up packages" CTA

### 6.4 Admin Side (Minor)

| Route | File | Purpose |
|---|---|---|
| `/admin/payouts` | `src/app/(dashboard)/admin/payouts/page.tsx` | Manual payout queue + Mark as Paid action |

---

## 7. New & Modified API Routes

### 7.1 New Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/creator/packages` | GET, POST, PATCH, DELETE | List, create, update, delete creator's own packages |
| `/api/creator/go-live` | POST | Toggle `creators.is_live` (validates ≥1 active package + onboarding complete) |
| `/api/creator/bank-account` | GET, PUT | Read/update encrypted bank details |
| `/api/collab-requests` | POST (brand creates) | New collab request → notification + email to creator |
| `/api/collab-requests/[id]` | GET, PATCH | Get details; brand can `cancel` while pending |
| `/api/collab-requests/[id]/accept` | POST (creator) | Accept with T&C → unlock chat, notify brand for payment |
| `/api/collab-requests/[id]/decline` | POST (creator) | Decline with reason → notify brand |
| `/api/collabs` | GET (per-role) | List collabs (brand or creator) |
| `/api/collabs/[id]` | GET | Collab full state (package, progress, payment, license) |
| `/api/collabs/[id]/start-payment` | POST (brand) | Create Razorpay/Cashfree order tied to collab_request |
| `/api/collabs/[id]/confirm-payment` | POST (webhook+manual) | After payment success → create `collab_session`, set `collab_requests.status='paid'`, unlock studio |
| `/api/collabs/[id]/generate` | POST (brand, in studio) | Run a single generation (uses 1 credit, dispatches `runGeneration`) |
| `/api/studio/analyze-reference` | POST (brand) | Upload reference → Gemini Flash analyzes → returns auto-filled brief JSON |
| `/api/admin/payouts` | GET, POST | Admin: list pending withdrawal requests + mark as paid |

### 7.2 Modified Routes

| Route | What Changes |
|---|---|
| `/api/campaigns/create` | **DEPRECATE.** New entry point is `/api/collabs/[id]/generate` per single image. Old route can stay for one release as a 410 stub returning "use /api/collabs/[id]/generate". |
| `/api/generations/[id]/send-for-approval` | Update to: charge generation credit from `collab_sessions.gen_credits_used`, not from old wallet/credits ledger |
| `/api/approvals/[id]/approve` | On approve: increment `collab_sessions.approved_count`. If `approved_count == final_images_target`: set collab status='completed', set `license_expires_at = now() + license_duration_days`, fire-and-forget create license PDFs and email notifications |
| `/api/approvals/[id]/reject` | On reject: just record feedback. **Do NOT refund a credit** — the credit was already spent on generation; brand can use a remaining credit to regenerate |
| `/api/chat/conversations` | Update eligibility check: `exists collab_request where (brand_id, creator_id) match AND status IN ('accepted', 'paid')`. Old check (any approval exists) — keep as fallback for legacy conversations |
| `/api/onboarding/current-step` | Remove `pricing`, `lora_review` from valid steps |

### 7.3 Routes To Remove (After 1-Release Deprecation Window)

- `/api/onboarding/save-pricing` (delete immediately, replaced by package CRUD)
- `/api/onboarding/get-pricing` (delete immediately)
- `/api/campaigns/create` (deprecate, return 410 for one release, then delete)

---

## 8. Component Changes

### 8.1 New Components

| File | Purpose |
|---|---|
| `src/components/creator/package-card-editor.tsx` | Single Frame/Feature/Cover card with editable price + final_images, Active toggle |
| `src/components/creator/go-live-toggle.tsx` | Top-of-page Go Live switch with validation status |
| `src/components/creator/request-card.tsx` | Compact request preview in list |
| `src/components/creator/request-detail-sheet.tsx` | Full request view with T&C and Accept/Decline |
| `src/components/brand/package-display-card.tsx` | Read-only package card on creator profile (with "Send Request" CTA) |
| `src/components/brand/collab-request-form.tsx` | Brand's request form (product name, image, one-liner) |
| `src/components/brand/collab-payment-screen.tsx` | Razorpay/Cashfree checkout panel |
| `src/components/collab/workspace-tabs.tsx` | Tabs (Chat / Studio (brand only) / Images (creator only) / Vault / Details) |
| `src/components/collab/details-tab.tsx` | Package, status, license, progress bar |
| `src/components/studio/studio-shell.tsx` | Full-page Studio layout (left brief panel, right images grid) |
| `src/components/studio/brief-panel.tsx` | All brief fields (Scene / Creator / Camera / Output groupings) |
| `src/components/studio/reference-mode.tsx` | Upload reference, see Gemini Flash analysis, auto-fill |
| `src/components/studio/manual-mode-toggle.tsx` | Mode switcher at top of brief panel |
| `src/components/studio/image-grid.tsx` | Generated images with status badges + per-image actions |
| `src/components/studio/image-status-badge.tsx` | One badge component for all 5 statuses |
| `src/components/admin/payout-queue.tsx` | Admin's manual payout list + actions |

### 8.2 Components To Refactor

| File | Change |
|---|---|
| `src/app/(dashboard)/dashboard/creators/[id]/start-campaign-sheet.tsx` | DELETE (replaced by Studio) |
| `src/app/(dashboard)/dashboard/creators/[id]/launch-section.tsx` | DELETE (replaced by `<PackageDisplayCard>`) |
| `src/app/(dashboard)/brand/discover/discover-grid.tsx` | Update card fields: pull lowest-tier package price (not category price); show "Frame from ₹X" |
| `src/components/dashboard/topbar.tsx` (or whichever creator nav lives in) | Update creator nav items per §9 |
| `src/components/chat/chat-inbox.tsx` | Repurpose: render inside collab workspace Chat tab; remove standalone /inbox route usage |
| `src/config/nav-items.creator.ts` | Replace nav items per §9.1 |
| `src/config/nav-items.brand.ts` | Replace nav items per §9.2 |

---

## 9. Navigation Changes

### 9.1 Creator Nav (`src/config/nav-items.creator.ts`)

**New `CREATOR_SIDE_NAV`:**
```ts
[
  { label: "Overview",  href: "/creator/dashboard", icon: LayoutDashboard, group: "Primary" },
  { label: "Requests",  href: "/creator/requests",  icon: Inbox,           group: "Primary" },  // NEW
  { label: "Collabs",   href: "/creator/collabs",   icon: Megaphone,       group: "Primary" },  // NEW
  { label: "Packages",  href: "/creator/packages",  icon: Tags,            group: "Primary" },  // NEW
  { label: "Earnings",  href: "/creator/earnings",  icon: IndianRupee,     group: "Primary" },
  { label: "Withdraw",  href: "/creator/withdraw",  icon: ArrowDownToLine, group: "Primary" },
  { label: "Likeness",  href: "/creator/likeness",  icon: Camera,          group: "Primary" },
  // Secondary (overflow / command palette)
  { label: "Licenses",          href: "/creator/licenses",          icon: FileSignature, group: "Secondary" },
  { label: "Analytics",         href: "/creator/analytics",         icon: TrendingUp,    group: "Secondary" },
  { label: "Blocked categories", href: "/creator/blocked-categories", icon: ShieldOff,    group: "Secondary" },
  { label: "Settings",          href: "/creator/settings",          icon: SettingsIcon,  group: "Secondary" },
]
```

**Remove:** `Approvals`, `Inbox`, `Collaborations`, `Payouts` (Approvals + Inbox folded into Collabs; Collaborations renamed; Payouts merged into Earnings/Withdraw).

**Mobile nav:** Home, Requests, Collabs, Earn, Profile.

### 9.2 Brand Nav (`src/config/nav-items.brand.ts`)

**New `BRAND_SIDE_NAV`:**
```ts
[
  { label: "Dashboard",         href: "/brand/dashboard", icon: LayoutDashboard, group: "Work" },
  { label: "Discover creators", href: "/brand/discover",  icon: Users,           group: "Work" },
  { label: "Collabs",           href: "/brand/collabs",   icon: Megaphone,       group: "Work" }, // RENAMED from Sessions
  { label: "Vault",             href: "/brand/vault",     icon: ImageIcon,       group: "Work" },
  { label: "Wallet",            href: "/brand/wallet",    icon: Wallet,          group: "Money" },
  { label: "Billing",           href: "/brand/billing",   icon: Receipt,         group: "Money" },
  { label: "Settings",          href: "/brand/settings",  icon: SettingsIcon,    group: "Account" },
]
```

**Remove:** `Sessions` (renamed → Collabs), `Inbox` (folded into Collabs), `Licenses` (auto-attached to vault images), `Credits` (merged into Wallet — credits are now bundled with packages, no separate purchase).

**Mobile nav:** Home, Discover, Collabs, Vault, Profile.

### 9.3 Legacy Redirects (`src/config/legacy-redirects.ts`)

Add:
- `/creator/approvals` → `/creator/collabs` (param-aware: if `?id=...`, redirect to `/creator/collabs/[id]?tab=images`)
- `/creator/inbox` → `/creator/collabs` (similar param handling for Chat tab)
- `/creator/collaborations` → `/creator/collabs`
- `/brand/sessions` → `/brand/collabs`
- `/brand/sessions/[id]` → `/brand/collabs/[id]`
- `/brand/inbox` → `/brand/collabs`
- `/brand/credits` → `/brand/wallet`

---

## 10. External APIs Required

### 10.1 Already Have

| Service | Use | Status |
|---|---|---|
| Supabase | DB + Auth + Storage + Realtime | ✅ |
| Gemini API | Image generation (Gemini 3 Pro Image) | ✅ |
| Gemini API (same key) | Reference analysis (Gemini Flash) | ✅ same `GEMINI_API_KEY` works |
| OpenRouter | LLM prompt assembly | ✅ |
| Hive | Content moderation | ✅ |
| Cloudflare R2 | Image storage | ✅ |
| Resend | Transactional email | ✅ |
| Cashfree | Payments (current, will swap to Razorpay) | ✅ |
| Upstash Redis | Rate limiting | ⚠️ stale, user needs to rotate |

### 10.2 New APIs Needed (For Later — Not Required For This Implementation)

| Service | Use | Blocked On |
|---|---|---|
| Razorpay | Replaces Cashfree | User providing keys |
| RazorpayX | Automated creator payouts | Future automation phase |
| Instagram Graph API | OAuth-based profile pull | Future polish phase |
| YouTube Data API v3 | Channel stats | Future polish phase |

**For this implementation:** keep using Cashfree until Razorpay keys arrive. The payment flow change is structural (new payment screen, new endpoints) — the underlying provider can swap later with a small adapter layer.

---

## 11. Studio Redesign Detail

### 11.1 Layout

Full-page route at `/brand/collabs/[id]/studio`. Two-column flex:

```
┌──────────────────────┬─────────────────────────────────┐
│  BRIEF PANEL (380px) │  IMAGE GRID (fills rest)        │
│                      │                                 │
│  Mode toggle         │  Progress strip (sticky top):   │
│  [Reference|Manual]  │  Feature · 2 of 5 approved      │
│                      │  ▓▓▓▓░░░░░░ · 12 credits left  │
│  ─── Brief ───       │                                 │
│  Product             │  Generated images grid:         │
│  Scene               │  - Generating (spinner)         │
│  Creator direction   │  - Review (brand actions)       │
│  Camera              │  - Sent (locked, awaiting)      │
│  Output              │  - Approved (license link)      │
│                      │  - Rejected (feedback shown)    │
│  [Generate]          │                                 │
└──────────────────────┴─────────────────────────────────┘
```

### 11.2 Brief Fields (Manual Mode)

Grouped in 4 sections:

**Product** (auto-pulled from collab_request — read-only):
- Product image
- Product name

**Scene:**
- Setting (pill row: Indoor / Outdoor / Studio / Street / Cafe / Home)
- Background (pill row: Plain white / Plain black / Textured / Natural / Colorful)
- Time & Lighting (pill row: Daylight / Golden Hour / Night / Studio Light / Soft / Dramatic)
- Mood & Palette (pill row: Warm / Cool / Vibrant / Muted / Dreamy / Bold)
- Season / Context (pill row: None / Festive / Summer / Winter / Wedding / Monsoon)

**Creator direction:**
- Outfit Style (pill row: Casual / Formal / Ethnic / Streetwear / Athleisure / Glam)
- Pose & Energy (pill row: Standing / Sitting / Action / Candid / Power)
- Expression (pill row: Smile / Serious / Playful / Confident / Neutral)
- Product Interaction (pill row: Holding / Wearing / Showing / Using)

**Camera:**
- Shot Type (pill row: Full body / Half body / Face focus / Product focus)
- Camera Type (pill row: Phone / DSLR / Cinematic / Film)
- Camera Framing (pill row: Wide / Medium / Close-up / Over-shoulder)

**Output:**
- Aspect Ratio (pill row: 1:1 / 9:16 / 16:9 / 4:5)
- Custom Notes (textarea, 500 chars)

### 11.3 Reference Mode

```
┌─────────────────────────────────────┐
│ Mode: ⦿ Reference  ○ Manual         │
├─────────────────────────────────────┤
│ Drop reference image here            │
│ [or click to upload]                 │
│                                     │
│ [reference image preview]            │
│                                     │
│ Analyzing… (1-2s)                    │
│                                     │
│ ✓ Analysis complete:                 │
│   Setting: Outdoor                   │
│   Lighting: Golden Hour              │
│   Mood: Warm, dreamy                 │
│   ...                                │
│                                     │
│ [Adjust fields]  [Generate]          │
└─────────────────────────────────────┘
```

**Implementation flow:**
1. Brand drops image into upload zone
2. POST to `/api/studio/analyze-reference` with image (form-data)
3. Server-side: read image, send to Gemini Flash with structured-output prompt requesting JSON shape matching brief schema
4. Returns parsed brief JSON
5. Frontend fills brief state with returned values; brand can click "Adjust fields" to switch to manual mode (preserves auto-filled values), or "Generate" to use as-is
6. **Reference image is NOT passed to Gemini 3 Pro Image during generation — only brief JSON is**

### 11.4 Image Grid Statuses & Actions

| Status | Visual | Brand Actions | Creator Sees |
|---|---|---|---|
| `generating` | spinner overlay | none | not visible |
| `ready_for_brand_review` | 👀 badge | Send to Creator / Retry / Discard | not visible |
| `ready_for_approval` | 📨 "Sent" badge | none (locked) | "New for approval" in their Images tab |
| `approved` | ✅ + License link | Download | ✅ in their grid |
| `rejected` | ❌ + feedback | "Regenerate with feedback" (uses 1 credit) | ❌ in their grid |
| `discarded` | hidden by default, "Show discarded" toggle | none | not visible |

### 11.5 Mode Conflict Prevention

Per §brainstorm decision: user can use **either Reference OR Manual, never both at the same time**. Mode toggle is a hard switch:
- Switching from Reference → Manual: keep auto-filled values as starting point, allow editing
- Switching from Manual → Reference: warn ("Your manual fields will be replaced") before discarding

Inside the prompt sent to Gemini 3 Pro Image, only ONE source of brief is included. No merging.

---

## 12. Payment Flow

### 12.1 Money Math (Single Source of Truth)

Brand pays the package's `price_paise` (e.g. ₹10,000 for a Feature package).
Platform takes 15% from creator's share.
Creator receives 85%.

```
Brand pays:         price_paise              (e.g. 10,000)
Platform fee:       price_paise × 0.15       (e.g.  1,500)
Creator earns:      price_paise × 0.85       (e.g.  8,500)
```

**TDS / GST:** Out of scope for MVP per Pranav. Add later when CA structures. For now: store gross amounts only; statutory deductions are handled outside the app at payout time by admin.

### 12.2 Payment Trigger

Payment screen appears at `/brand/collabs/[id]/payment` only when `collab_request.status = 'accepted'` (creator accepted, not yet paid).

Order create endpoint: `POST /api/collabs/[id]/start-payment`
- Validates `collab_request.status = 'accepted'`
- Creates Razorpay/Cashfree order with `amount = price_paise`
- Returns `{order_id, key, amount}` for client checkout

After successful payment webhook (existing `/api/webhooks/cashfree` or future `/api/razorpay/webhook`):
- Verify HMAC signature
- POST internally to `/api/collabs/[id]/confirm-payment`
- That endpoint:
  1. Locks the row (idempotency check)
  2. Creates `collab_sessions` row with snapshotted package fields
  3. Sets `gen_credits_total = final_images × 3`, `gen_credits_used = 0`
  4. Updates `collab_requests.status = 'paid'`, `paid_at = now()`, `collab_session_id = <new id>`
  5. Sends notification + email to creator: "Payment received, brand can now generate"

### 12.3 Generation Credit Accounting

Each `POST /api/collabs/[id]/generate`:
- Reads `gen_credits_used` and `gen_credits_total`
- Rejects with 402 if `gen_credits_used >= gen_credits_total`
- Increments `gen_credits_used` atomically
- Dispatches generation pipeline

**No bonus credits** (per Pranav: "x3 rakhde sirf"). Brand exhausts → must buy more credits via separate purchase (out of scope for this rollout).

### 12.4 Payout Trigger

When `collab_sessions.approved_count == final_images_target`:
- Set `collab_sessions.status = 'completed'`
- Set `license_expires_at = now() + interval (license_duration_days)`
- Insert into existing `escrow_ledger` for creator's earned amount (₹8,500)
- Insert into existing `platform_revenue_ledger` for platform's amount (₹1,500)
- Notify creator: "₹X earned, withdraw anytime"

When creator clicks Request Withdrawal:
- POST to existing `/api/withdrawals` (already implemented, may need minor fixes)
- Admin sees in `/admin/payouts`
- Admin transfers manually via UPI/NEFT (out of band)
- Admin clicks "Mark as Paid" → POST `/api/admin/payouts` → record settled

---

## 13. Legal Documents

### 13.1 In-App (Auto-Generated)

| Document | When | Source |
|---|---|---|
| Collaboration Agreement | Creator clicks Accept on a request | Auto-generated from `collab_requests` snapshot fields + `creator_likeness_terms.md` template |
| License Certificate | Each approved image | Existing flow in `src/lib/licenses/` (already works); update content to reference package's `usage_scope` and `license_duration_days` from `collab_sessions` |

### 13.2 Static Pages (Need Lawyer Review)

| Page | Route | Status |
|---|---|---|
| Terms of Service | `/terms` | Stub — Pranav supplies copy, agent embeds |
| Privacy Policy | `/privacy` | Stub — Pranav supplies copy |
| Refund Policy | `/refund` | Stub — Pranav supplies copy |
| Creator Likeness Agreement | `/creator-agreement` | **CRITICAL** — Pranav must get lawyer review (DPDP Act compliance for biometric data) |
| DPDP Notice | `/dpdp` | Already exists in marketing routes; expand to include AI generation specifics |

**Implementation:** Sonnet creates the empty page shells with placeholder text (`<!-- LEGAL TEXT TO BE PROVIDED BY PRANAV -->`); does NOT write legal copy. Pranav fills in actual text after lawyer review.

### 13.3 Required Clauses For Creator Likeness Agreement (Brief — for Pranav's lawyer)

- AI-generation consent (explicit per DPDP Act for biometric data)
- Permitted scope (matches package usage_scope)
- Prohibited uses (matches blocked_categories per creator)
- License duration (per package tier)
- Revocation rights (creator can revoke future use; existing approved licenses honor their term)
- Data retention policy (face embeddings retained X years; deletable on creator account closure)
- Approval workflow disclosure (creator approves each image)
- Compensation terms (15% platform fee disclosed)
- Jurisdiction (India, specific state)
- Watermark / EXIF metadata clause (already implemented)

---

## 14. Onboarding Step Reorder Detail

Current state per `/api/onboarding/current-step` and `STEP_ROUTES`:
```
identity → instagram → categories → compliance → consent → photos → lora_review → pricing → complete
```

**Target:**
```
identity → instagram → categories → photos → compliance → consent → complete
```

**Specific code changes:**

`src/app/(dashboard)/dashboard/onboarding/page.tsx` — update `STEP_ROUTES`:
```ts
const STEP_ROUTES: Record<string, string> = {
  identity:   "/dashboard/onboarding/identity",
  instagram:  "/dashboard/onboarding/instagram",
  categories: "/dashboard/onboarding/categories",
  photos:     "/dashboard/onboarding/photos",       // moved up
  compliance: "/dashboard/onboarding/compliance",   // moved down
  consent:    "/dashboard/onboarding/consent",
  complete:   "/dashboard/onboarding/complete",
  // pricing + lora_review removed
};
```

`src/app/api/onboarding/current-step/route.ts` — update enum/validation to drop `pricing` and `lora_review`. Map any legacy creators with `onboarding_step IN ('lora_review', 'pricing')` → `'complete'` on read.

Each step's `update-step` call gets adjusted to advance to the new next step:
- categories → photos (was categories → compliance)
- photos → compliance (was photos → lora_review)
- consent → complete (was consent → photos)

`src/app/(dashboard)/dashboard/onboarding/complete/page.tsx` — show CTA banner:
> "🎉 Setup complete! You're not live yet. **[Set up your packages →](/creator/packages)** to start receiving collab requests."

---

## 15. Implementation Phases (Strict Order)

Each phase is self-contained — implementation can stop at any phase and the system remains in a working state. Phases must be done in order.

### Phase 1: Database Migrations
**Goal:** All schema changes land first. Application code can read these tables before code changes ship.

1. Run migrations 00041–00047 (in order)
2. Verify with `psql` or Supabase Studio: tables exist, indexes created, RLS policies active
3. Commit: `chore(db): migrations 00041-00047 for marketplace flow redesign`

### Phase 2: Creator Packages CRUD
**Goal:** Creator can manage packages in /creator/packages, but brand-side discover still uses old per-category pricing.

1. Build `/api/creator/packages` GET/POST/PATCH/DELETE
2. Build `/api/creator/go-live` POST
3. Build `/creator/packages` page with `<PackageCardEditor>` × 3 + `<GoLiveToggle>`
4. Add Packages to creator nav (insert at index 4)
5. Test: creator can create Frame/Feature/Cover, set price + final_images, activate, toggle Go Live
6. Commit: `feat(creator): packages CRUD + Go Live toggle`

### Phase 3: Onboarding Simplification
**Goal:** New creators go through 6 steps; existing creators on `pricing`/`lora_review` get fast-forwarded.

1. Update `STEP_ROUTES` in onboarding page
2. Update `/api/onboarding/current-step` enum
3. Update `/api/onboarding/update-step` flow
4. Reorder photos before compliance (update each step's "next" URL + `update-step` payload)
5. Update `complete` page to show "Set up packages" CTA
6. Delete old `/dashboard/onboarding/pricing` page + APIs
7. Test: fresh signup goes through 6 steps and lands on dashboard
8. Commit: `feat(onboarding): 6-step flow, packages moved to dashboard`

### Phase 4: Brand Discover + Profile Refactor
**Goal:** Brand sees packages on creator profiles, not flat per-category prices.

1. Update `/brand/discover` query: pull lowest active package price per creator (was: lowest category price)
2. Refactor `/brand/discover/[creatorId]` page: replace `<LaunchSection>` with three `<PackageDisplayCard>`s
3. Each card shows: tier name, price, final_images, usage_scope, license_duration, "Send Request" CTA (CTA disabled if creator not live)
4. Test: visiting any creator shows their packages; clicking a package opens (next phase) request form
5. Commit: `feat(brand): discover + profile show creator packages`

### Phase 5: Collab Request Flow (Brand → Creator)
**Goal:** Brand can send a collab request; creator sees and accepts/declines.

1. Build `/brand/discover/[creatorId]/request` page with `<CollabRequestForm>` (product name, image upload, brief one-liner)
2. Build `POST /api/collab-requests` (validates package_id is active and creator is_live)
3. Snapshot package terms into the new `collab_requests` row
4. Send transactional email + in-app notification to creator
5. Build `/creator/requests` list page (show all pending + recent decisions)
6. Build `/creator/requests/[id]` detail page with `<RequestDetailSheet>` showing T&C
7. Build `POST /api/collab-requests/[id]/accept` — generates agreement, sets `accepted`, creates `conversations` row, notifies brand
8. Build `POST /api/collab-requests/[id]/decline` — sets `declined`, notifies brand
9. Add Requests to creator nav
10. Test end-to-end: brand sends request → creator sees → accepts → chat unlocked
11. Commit: `feat(collabs): request → accept/decline flow with auto-agreement`

### Phase 6: Payment Flow + Collab Session Creation
**Goal:** Accepted requests become paid collab_sessions; brand reaches the studio.

1. Build `/brand/collabs/[id]/payment` page with `<CollabPaymentScreen>`
2. Build `POST /api/collabs/[id]/start-payment` — Cashfree order create (Razorpay later)
3. Webhook handler updates `collab_requests.status = 'paid'`, creates `collab_sessions` row with snapshotted package fields, sets gen_credits_total
4. Build `/api/collabs/[id]/confirm-payment` for manual reconciliation
5. Test: brand pays, collab_sessions row created, status `paid`, brand redirected to `/brand/collabs/[id]/studio`
6. Commit: `feat(collabs): payment → session creation`

### Phase 7: Collabs List + Workspace
**Goal:** Both brand and creator have a Collabs section showing all their collabs with workspace tabs.

1. Build `/brand/collabs` page (list)
2. Build `/brand/collabs/[id]` page with `<WorkspaceTabs>`: Chat, Studio, Vault, Details
3. Build `/creator/collabs` page (list)
4. Build `/creator/collabs/[id]` page with `<WorkspaceTabs>`: Chat, Images, Details
5. Wire Chat tab: render existing `<ChatInbox>` scoped to this conversation
6. Wire Vault tab (brand): list approved generations with download buttons
7. Wire Details tab (both sides): package, status, license, progress, contract download link
8. Update creator + brand nav: add Collabs link
9. Add legacy redirects (/brand/sessions → /brand/collabs, /creator/inbox → /creator/collabs, /creator/approvals → /creator/collabs)
10. Commit: `feat(collabs): unified workspace with Chat / Studio / Vault / Details / Images tabs`

### Phase 8: Studio (Brand's Generation Workspace)
**Goal:** Brand generates images inside the collab.

1. Build `/brand/collabs/[id]/studio` page with `<StudioShell>`
2. Build `<BriefPanel>` with the 4 grouped sections (Scene / Creator / Camera / Output) + all pill rows from §11.2
3. Build `<ManualModeToggle>` and `<ReferenceMode>`
4. Build `POST /api/studio/analyze-reference` — Gemini Flash vision call returning structured JSON
5. Build `POST /api/collabs/[id]/generate` — uses 1 credit, dispatches `runGeneration`
6. Build `<ImageGrid>` polling generation status
7. Wire existing `/api/generations/[id]/send-for-approval`, `/retry`, `/discard` from per-image actions
8. Show progress strip: "X of Y approved · Z credits left"
9. Test: brand generates, reviews, sends to creator
10. Commit: `feat(studio): full-page generation workspace with Reference Mode`

### Phase 9: Approval Flow Updates
**Goal:** Creator approves; on full collab approval, payouts unlock.

1. Update `/api/approvals/[id]/approve` to:
   - Increment `collab_sessions.approved_count`
   - When `approved_count == final_images_target`: set status `completed`, compute `license_expires_at`, write to `escrow_ledger` + `platform_revenue_ledger`
2. Update `/api/approvals/[id]/reject` to: just record feedback, no credit refund
3. Update existing creator's Images tab in collab workspace to show pending approvals + 48h timer
4. Test full path: brand generates → sends → creator approves → on Nth approval, collab completes
5. Commit: `feat(approvals): tied to collab progress, payout unlock on completion`

### Phase 10: Earnings + Bank Account + Payout Admin
**Goal:** Creator can withdraw; admin can mark payouts.

1. Update `/creator/earnings` to show:
   - Available balance from `escrow_ledger` (existing query)
   - Bank Account section (new) with form to add/edit
2. Build `GET /api/creator/bank-account`, `PUT /api/creator/bank-account` (encrypts before save)
3. Update existing `/creator/withdraw` to use bank account from creator row (no separate input)
4. Build `/admin/payouts` page with `<PayoutQueue>`: pending requests with creator name, amount, bank decrypted (admin-only), Mark as Paid button
5. Build `POST /api/admin/payouts` to flip status + send creator notification
6. Test full payout: collab completes → creator requests → admin pays → creator notified
7. Commit: `feat(payouts): bank account on creators, manual admin queue`

### Phase 11: Legal Page Stubs + Brand Onboarding
**Goal:** Required pages exist (lawyer review pending), brand onboarding simplified.

1. Build `/brand/onboarding` 3-step page (company info → GST → welcome)
2. Build empty page stubs at `/terms`, `/privacy`, `/refund`, `/creator-agreement` with `<!-- TBD: lawyer copy -->` placeholder
3. Wire creator's onboarding consent step to link to /creator-agreement
4. Commit: `feat(legal): page stubs + brand onboarding`

### Phase 12: Cleanup + Deprecation
**Goal:** Old code paths removed.

1. Delete `/api/campaigns/create` (or replace with 410 stub)
2. Delete `/dashboard/creators/[id]/start-campaign-sheet.tsx` and `/launch-section.tsx` if unused
3. Delete `/api/onboarding/save-pricing` and `/api/onboarding/get-pricing`
4. Run typecheck + build, fix any leftover imports
5. Update `CLAUDE.md`:
   - Update tech stack
   - Update routing section
   - Update anti-patterns (add: "don't use `creator_categories.price_per_generation_paise` — use `creator_packages` instead")
6. Commit: `chore: cleanup legacy campaign-creation paths`

---

## 16. Migration Strategy For Existing Data

Faiceoff has live test data (Pranav's accounts, seeded test funds). Don't break it.

### Existing Creators
- Their `creator_categories` rows are kept; column comment says deprecated
- They have NO `creator_packages` — they will see empty Packages page on first visit
- `creators.is_live = false` for all (their old `is_active = true` is preserved separately)
- Banner on dashboard: "We've updated to packages! Set yours up to go live again."

### Existing Brands
- Their `wallet` and `credits` balances are preserved
- Their old `collab_sessions` (without package_id) remain visible in the new `/brand/collabs` page; the workspace shows "Legacy session" badge and falls back to old behavior (no package metadata available)
- New collabs going forward use the new flow

### Existing Generations / Approvals
- All preserved as-is. They appear under their parent `collab_session` in Vault.
- Old "ready_for_approval" generations continue through the existing approval routes.

### Existing Conversations
- All preserved. New unlock condition is additive: existing conversations remain readable; new ones must satisfy the new condition.

### Onboarding Step Migration
On read of `creators.onboarding_step`, map:
- `lora_review` → `complete`
- `pricing` → `complete`
- All other values pass through

This is a DB-level mapping in the API route, not a destructive update. Original values are preserved in the column.

---

## 17. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Stale Supabase types after new tables | Run `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts` after Phase 1; if can't, use `as any` cast at admin client boundary (already established pattern) |
| Razorpay keys still not provided | Continue with Cashfree until they arrive; the new payment screen + endpoints accept either via small adapter |
| Chat unlock break for existing collabs | Keep fallback: if `collab_request_id` is null on a conversation (legacy), allow if any approval exists (old condition) |
| Existing creators stuck on deprecated onboarding step | Step migration in Phase 3; on first dashboard visit, fast-forward to `complete` |
| Brand's old sessions appearing weird in /brand/collabs | Show "Legacy" badge; workspace uses fallback rendering when package_id is null |
| TDS/GST audit trail | Don't auto-deduct anything for MVP; admin manually handles at payout time, off-band |
| Creator without bank account requests withdrawal | Block at API: 400 "Add bank account first"; UI greys out withdrawal button until bank added |
| Reference Mode prompt injection (malicious image with embedded text) | Gemini Flash output is JSON-validated against a strict schema before passed to brief panel; reject anything off-schema |
| Generation pipeline still expects `runGenerationsBatch` (multiple) | New endpoint dispatches a single `runGeneration` call (already exported from `run-generation.ts`) — do NOT use the batch wrapper for studio flow |

---

## 18. Testing Checklist (For Sonnet After Each Phase)

After every phase:
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds (with current `ignoreBuildErrors: true`)
- [ ] `git status` shows only intended files changed
- [ ] Manual smoke test of the just-built feature

After Phase 12 (final):
- [ ] Full creator flow: signup → onboard (6 steps) → set packages → go live → receive request → accept → chat → see image → approve → earnings credited
- [ ] Full brand flow: signup → onboard (3 steps) → discover → profile → send request → wait → pay → studio generate → send to creator → approve → vault download
- [ ] Admin payout flow: creator withdraws → admin sees → marks paid → creator notified
- [ ] Legacy redirect smoke: `/brand/sessions` → `/brand/collabs`, `/creator/inbox` → `/creator/collabs`
- [ ] Reference Mode in studio: upload reference → analysis → brief auto-fills → generate works
- [ ] No console errors in browser, no Sentry exceptions in production logs

---

## 19. Out Of Scope (Explicitly Deferred)

- Razorpay swap (waiting on keys)
- RazorpayX automated payouts
- Instagram Graph API + YouTube Data API v3 (using self-reported for now)
- TDS / GST automation
- Counter-offer flow on collab requests
- Bulk generation in Studio (single image at a time always)
- Multi-creator campaigns (one collab = one creator always)
- Mobile app
- Real legal copy (Pranav supplies after lawyer review)
- Removing `creator_categories.price_per_generation_paise` column (defer to next migration cycle)
- Razorpay Route / true escrow (manual payouts via admin for now)
- Bonus credits if package credits exhaust (per Pranav: "rehne de", x3 ratio is final)

---

## 20. Sign-Off

This document represents the complete brainstormed plan from the 2026-05-06 session between Pranav and Claude. It is locked. Changes require Pranav's explicit approval.

**Next step:** Sonnet reads this end-to-end, then begins **Phase 1**.
