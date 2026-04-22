# Chunk D — End-to-End Flow Design

> **Context:** Third chunk in product revamp sequence (C → B → D → A). Wires the full 5-stage user flow: Book → Accept → Generate → Approve → Close. Depends on Chunk C (DB/Cashfree) and Chunk B (route shells).
>
> **References:** 
> - `2026-04-22-chunk-c-foundation-design.md` (ledgers, state machines)
> - `2026-04-22-chunk-b-route-restructure-design.md` (route map, shells)
> - `2026-04-22-ux-quality-baseline-design.md` (motion + mobile requirements)
> - Source of truth: `C:\Users\Pranav\Downloads\faiceoff-new-flow.html`

**Goal:** Ship the complete marketplace flow — creator listings, brand discovery, license request + contract, chat, per-image generation + approval, delivery, payout, dispute. With top-quality UI, motion, mobile-first responsive behavior.

---

## 1. Scope

### In scope
- All `/brand/*` and `/creator/*` page content (Chunk B built shells, D fills them)
- 5-stage flow UI: Book → Accept → Generate → Approve → Close
- Per-license chat system (brand ↔ creator messaging)
- Per-image generation loop UI (with Inngest pipeline wiring)
- Creator approval queue UI with 48h SLA timer
- Withdrawal flow UI (deduction preview, Cashfree wiring)
- Dispute raise + tracking UI
- Brand dashboard home + creator dashboard home
- Creator onboarding (7 steps) + brand onboarding (5 steps)
- Mobile responsive across all

### Out of scope
- DB schema (Chunk C) — consumed here as fact
- Route scaffolding (Chunk B) — assumed ready
- Payment provider integration (Chunk C) — consumed via client SDK
- Landing page (Chunk A) — separate
- V2 features: team seats, API keys, commercial-scope upgrade, dark mode, multi-language

---

## 2. Decision log

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Chat model | **Per-license dedicated thread** (chat bound to license_request) | Scoped context, no ambiguity about what's being discussed |
| D2 | Chat attachments | Text + image (pre-generation references) only for MVP. No video/file. | Image sufficient for creative direction |
| D3 | Approval SLA | **48 hours** — after that, system auto-approves OR auto-rejects? | Auto-REJECT to creator (protects creator time, brand can resubmit) |
| D4 | Generation queue | Brand requests N images at once; system processes 1 at a time per license | Rate limit Gemini, predictable pipeline |
| D5 | Regeneration | Always counts against retry budget (3 free per slot) | Per Chunk C decision D4 |
| D6 | Image delivery | R2 signed URL, 1-year TTL, brand downloads before TTL | Cost-effective, brand owns the right to redownload during license validity |
| D7 | Notification channels | **In-app + email** for MVP. Push notifications in V2. | Email via Resend (already in stack) |
| D8 | Onboarding flow | **Stepwise, resumable, can skip optional steps** | Reduce drop-off |
| D9 | Creator discovery | **Filter + sort + search** (no algorithmic feed for MVP) | Deterministic, simpler trust model |
| D10 | Ratings / reviews | **Brand rates creator after session close** (1-5 stars + optional text) | Builds marketplace trust. No creator→brand ratings in MVP (feels transactional for brand). |

---

## 3. The 5-stage flow — detailed

Each stage is a distinct UI experience with its own motion language.

### Stage 1: BOOK (Brand side)
**Brand discovers creator → requests license**

#### 1.1 Flow

```
/brand/creators (discovery)
  ↓ search/filter
  ↓ click card
/brand/creators/[id] (profile)
  ↓ view license listings
  ↓ click "Request license"
/brand/licenses/new?creator=[id]&template=[creation|creation_promotion]
  ↓ review breakdown
  ↓ confirm credits
  ↓ submit
  → creator_notifications, status: REQUESTED
  → brand sees request in /brand/licenses (tab: Pending)
```

#### 1.2 Key screens

**`/brand/creators` — Discovery**
- Header: "Find creators" title, search bar, filter drawer trigger
- Filter sheet (mobile bottom sheet, desktop right panel):
  - Category (cookery, fashion, fitness, etc.)
  - Price range (₹1k–₹50k)
  - License type availability (Creation / Creation+Promotion)
  - IG followers range
  - Has IG verification
- Sort: Popular (default) / Price low→high / Price high→low / Newest
- Results: masonry grid of creator cards
  - **CreatorCard**: cover photo (16:9), avatar overlay, name, category pills, starting-price chip, "View profile" button
  - Hover: card lifts 4px, cover image scales 1.04
  - Mobile: full-width cards, 2 per row on ≥ sm

**`/brand/creators/[id]` — Profile**
- Hero: full-width cover, avatar floating on left, name + category, follower counts
- Tabs below: About / Licenses / Gallery / Reviews
- Licenses tab (default):
  - Two license cards side-by-side (desktop) / stacked (mobile): Creation License and Creation+Promotion (if creator has both)
  - Each card: template badge, price, quota, validity, digital-use scope chip, "Request this license" CTA
- Gallery tab: masonry of reference samples (creator's past work, watermarked)
- Reviews tab: brand reviews from completed sessions

**`/brand/licenses/new` — Request form**
- Pre-filled creator + template from URL params
- Editable fields: brand's use-case brief (textarea, 500 char), reference images (drag-drop, max 3)
- Live checkout summary card (sticky right on desktop, bottom sheet on mobile):
  - Base price
  - Platform fee 18% (expandable tooltip: "Platform operations, moderation, dispute cover")
  - GST on platform fee
  - **Total** (big number)
  - Credits to be used (with remaining balance shown)
  - If insufficient credits: "Top up X credits" inline CTA → routes to /brand/credits/top-up with auto-return
- Submit button: "Request license" (gold, full-width on mobile)
- On submit: loading state → success celebration:
  - Backdrop darkens
  - Centered success animation: check mark draws (Framer pathLength), card lifts
  - Copy: "Request sent to [Creator Name]. You'll be notified when they accept."
  - CTA: "View request" → `/brand/licenses/[new-id]`

#### 1.3 Motion specs

| Element | Animation |
|---|---|
| Creator card hover | Lift 4px + cover zoom 1.04 (200ms) |
| Filter sheet | Desktop: slide from right (280ms); Mobile: slide up (300ms with spring) |
| License card selection | Scale 0.98 pulse + border glow gold 1.5s |
| Checkout summary line-items | Stagger fade-in 40ms each on form change |
| Total updates on input change | Counter tween 400ms cubic-out |
| Submit → success | Button morphs to spinner (200ms), then check draws (400ms), card lifts (300ms spring) |

#### 1.4 Mobile

- Discovery: 2-col grid ≥ 640px, 1-col below
- Profile: hero cover 56vw height (not full 16:9 — too tall on mobile); avatar 72px
- License cards stack full-width
- Request form: single column, sticky bottom bar with Total + CTA

---

### Stage 2: ACCEPT (Creator side)
**Creator receives request → reviews → signs contract → ACTIVE**

#### 2.1 Flow

```
Creator notification (in-app badge + email)
  ↓
/creator/requests (tab: New)
  ↓ click request
/creator/requests/[id]
  ↓ review brief + brand info
  ↓ click "View contract"
/creator/requests/[id]?view=contract (side panel)
  ↓ scroll to bottom (gate)
  ↓ check "I agree"
  ↓ click "Accept & sign"
  → contract generated + R2 upload
  → escrow locks via Cashfree Nodal
  → license_request.status = ACTIVE
  → brand notified
  → redirect to /creator/sessions/[new-session-id]
```

#### 2.2 Key screens

**`/creator/requests` — Inbox**
- Tabs: New (default) / Accepted / Rejected / Expired
- Each request is a **RequestCard**:
  - Brand logo + name
  - License template badge
  - Amount (your share)
  - Brand's brief preview (2 lines, truncated)
  - Received time ("2h ago")
  - Expiry countdown ("Respond in 23h 45m" — red tint when < 3h)
- Hover: subtle lift, border glow ocean tint
- Click: expands inline OR navigates to detail (mobile always navigates)

**`/creator/requests/[id]` — Request detail**
- Top: brand card (logo, name, verification badge if GSTIN verified)
- Brief section: brand's use-case text + reference images
- License snapshot: price, quota, validity (creator sees what's proposed, same as their listing since it's their listing)
- Your earnings breakdown (live): base → TCS 1% → TDS 1% → GST 18% → Net to bank
- Actions: **Accept** (gold primary) / **Reject** (ghost) — mobile: fixed bottom bar
- On "Accept" click → contract panel slides in from right (desktop) / covers screen (mobile)

**Contract Viewer panel**
- Scrollable PDF render (via `react-pdf` or embed iframe with signed URL)
- Scroll-to-bottom gate: checkbox "I have read and agree" disabled until user scrolls to bottom
- Progress indicator: "You've read 34% of the contract" (scroll %)
- Accept button enabled only after gate satisfied
- Click "Accept & sign":
  - Button → spinner
  - API call logs IP + UA + timestamp + scroll depth
  - Cashfree escrow lock triggered
  - On success: celebration animation (checkmark + "Contract signed")
  - Brief 2s delay → redirect to `/creator/sessions/[id]`

#### 2.3 Motion specs

| Element | Animation |
|---|---|
| Request card new-arrival | Slide-in from top + spring (first visit only, once per card) |
| Request card expiry timer | Number ticks down every second, red pulse when < 3h |
| Accept button | Hover lift 2px + shadow step up |
| Contract panel entrance | Desktop: slide from right (400ms); Mobile: slide up + bg fade (300ms) |
| Scroll progress indicator | Width animates based on scroll position |
| Accept signing → success | Button morphs → checkmark draws (400ms) → card scale bump (spring) → auto-navigate |

#### 2.4 Mobile

- Request inbox: cards stack full-width
- Bottom fixed action bar on detail page (Accept / Reject always visible)
- Contract panel takes full screen height on mobile (pseudo-page)
- Scroll gate works same as desktop — scroll-to-bottom check

#### 2.5 Reject flow (brief)
- Click "Reject" → bottom sheet with reason dropdown:
  - Busy / Not a fit / Price too low / Other (textarea)
- Submit → license_request.status = REJECTED, brand notified, request archived

---

### Stage 3: GENERATE (Both sides + AI pipeline)
**Brand triggers image generation → Inngest pipeline → output ready**

#### 3.1 Flow

```
Brand on /brand/licenses/[id] (ACTIVE session)
  ↓ sees "Generate images" card with remaining slots (e.g., 25 available)
  ↓ enters prompt (structured brief)
  ↓ clicks "Generate"
  → API /api/images/generate (creates generation row, emits inngest event)
  → Inngest pipeline: compliance check → prompt assembly → Gemini → output safety → save
  → Brand sees progress (live via Inngest Realtime OR polling)
  → When done: image appears in gallery, status: AWAITING_APPROVAL
  ↓
Creator gets notification → approves or rejects (Stage 4)
```

#### 3.2 Key screens

**`/brand/licenses/[id]` or `/brand/sessions/[id]` — Active license detail**

Layout (desktop):
- Left column (40%): license meta + chat thread
- Right column (60%): image gallery + generation controls

Layout (mobile):
- Tabs on top: Chat / Gallery
- Full-width below

**License meta card (top-left)**
- Creator avatar + name
- License template badge (Creation / Creation+Promotion)
- Quota visualizer: `[ ██████████░░░░░░░░░░ ] 12 of 25 images used`
  - Bar animates on completion
  - Remaining slots in mint, used in gold, rejected (consumed by retry) in light-red
- Validity: "Expires Jun 14, 2026" + countdown
- Total spent: ₹X so far

**Chat thread (left column, scrollable)**
- Messages list: text + image attachments
- Brand messages right-aligned (ocean bubble), creator left-aligned (blush bubble)
- Message input at bottom: text + attach image button + send
- Typing indicator when other party is typing (via Inngest Realtime or Supabase Realtime)
- System messages for key events ("License activated", "Image #5 approved", "Payment processed") in muted gold pill

**Gallery (right column)**
- Grid of image cards by status:
  - Generating (lilac pulse border + progress)
  - Awaiting approval (mint border + "Sent for approval" badge)
  - Approved (gold border + ✓ checkmark)
  - Rejected (red border + "Retry available" or "Slot consumed")
  - Delivered (clean, full resolution, download button)
- Filter pills: All / Generating / Awaiting / Approved / Rejected

**Generation controls (top of gallery or floating CTA)**
- Input: structured brief (text + optional reference image upload)
- Quick prompt suggestions (chips) based on category
- "Generate" button with remaining-slots indicator
- After click: new generating card appears at top of gallery with live progress

**Generation card (active)**
- Lilac theme (generation accent)
- Progress steps visualizer (5 dots — compliance / prompt / image / safety / done):
  - Each dot lights up sequentially as Inngest pipeline advances
  - Active dot has pulsing ring + gold
  - Completed dots solid gold
- Estimated time remaining ("~45s")
- On completion: morphs to awaiting-approval state

#### 3.3 Motion specs

| Element | Animation |
|---|---|
| Quota bar update | Width spring transition 400ms when images approved |
| Chat message new | Slide in from bottom + fade (200ms) + avatar scale bump |
| Typing indicator | 3-dot bounce (CSS keyframes) |
| Generation progress dots | Sequential light-up + ring pulse (400ms per dot transition) |
| Image card reveal on generation complete | Scan animation (linear gradient wipe, 500ms), then blur-up (200ms) |
| Status transition (awaiting → approved) | Border color spring, checkmark draws from 0 (400ms), subtle scale bump (150ms) |
| Download click on delivered image | Button → spinner → check → resets (200ms each) |

#### 3.4 Mobile

- Gallery single-column on `< md`, 2-col on `md`, 3-col on `lg`
- Generation card takes full-width on mobile, progress dots wrap if needed
- Chat takes full tab on mobile (separate screen from gallery)
- Image preview: tap card → lightbox (full-screen modal) with swipe between images

---

### Stage 4: APPROVE (Creator side)
**Creator reviews each generated image → approves or rejects**

#### 4.1 Flow

```
Image generated → creator_notifications (in-app + email)
  ↓
/creator/approvals (queue)
  ↓ click card
/creator/approvals/[generation_id]
  ↓ review image + brand brief context
  ↓ approve or reject
  → if approve: release payment, image: DELIVERED, brand notified
  → if reject: image: REJECTED, attempt++, retry available if <3
  ↓
48h SLA timer: if untouched, auto-reject (creator protection)
```

#### 4.2 Key screens

**`/creator/approvals` — Queue**
- Header: "Pending approvals" + count
- Sort: Oldest first (default — clears SLA pressure) / Newest first
- Each queue card: image preview (blurred subtly until click), brand name, license template, time remaining (SLA countdown), accept/reject inline buttons

**`/creator/approvals/[id]` — Single review**
- Full-width image preview (watermarked "FACEOFF — PREVIEW" diagonal)
- Context sidebar:
  - Brand who requested
  - Original brief (so creator sees what was asked)
  - License snapshot (quota progress, etc.)
  - Attempt # (e.g., "Attempt 2 of 3 for slot 12")
  - Your earnings from this image: ₹240 → deductions → net
- Actions: **Approve** (mint primary) / **Reject** (ghost) — mobile: fixed bottom bar
- Reject flow: modal asks reason (Quality / Off-brief / Likeness mismatch / Other)
- SLA timer prominent: "Respond in 42h 15m" — red when < 6h

#### 4.3 Motion specs

| Element | Animation |
|---|---|
| Queue card arrival (new generation) | Slide-in top + soft gold glow pulse (attention) |
| SLA timer | Number ticks down; color interp gold → red as < 6h |
| Image preview load | Blur-up (LQIP → full) over 300ms |
| Approve click | Button → spinner (150ms) → mint flash background (300ms) → Lottie "payment landed" (800ms) → redirect back to queue |
| Reject click | Modal slides up (mobile) or scales in (desktop), 250ms |

#### 4.4 Mobile

- Queue cards full-width, thumbnail 16:9
- Review page: image takes 60vh, context below scrollable
- Fixed bottom action bar with Approve (left, 50%) + Reject (right, 50%)
- Watermark readable on image (doesn't block subject)

---

### Stage 5: CLOSE (Both sides)
**License completes → images delivered → brand rates → creator withdraws**

#### 5.1 Flow

```
Last approved image OR expiry reached
  ↓ license_request.status = COMPLETED (or EXPIRED with refund)
  ↓ Brand gets "License complete" notification
  ↓
Brand: /brand/sessions/[id] shows "Complete" badge
  ↓ Brand downloads images (signed URLs, 1-year TTL)
  ↓ Brand can leave rating (1-5 stars + optional text)
  ↓
Creator: /creator/sessions/[id] shows "Complete" badge
  ↓ Creator sees final earnings in /creator/earnings
  ↓ When balance ≥ ₹500, hits Withdraw button
  → /creator/earnings/withdraw: KYC gate, deduction preview, confirm
  → Cashfree Payouts API: IMPS to bank
  → Webhook confirms success
  → Creator sees "₹X sent to your bank" notification + confetti moment
```

#### 5.2 Key screens

**Session complete view (brand & creator)**
- Large "Complete" badge at top (mint)
- Stats: total images delivered, total spent/earned, date range
- Gallery: all delivered images with batch download option (brand)
- Rating widget (brand only):
  - 5-star animated input (hover-fill, click-lock)
  - Optional textarea
  - Submit posts to `creator_ratings` table → shows on creator profile

**`/creator/earnings` — Earnings dashboard**
- Hero: pending balance (big animated number), lifetime earned
- Secondary: next milestone ("Earn ₹X more to unlock higher withdrawals" V2)
- Tabs: Overview / Withdrawals / Tax docs
- Overview:
  - Earnings breakdown chart (by month)
  - Breakdown by session (list, click → session detail)
- Withdrawals tab: list of past payouts with status chips, click → detail
- Tax docs tab: Form 16A downloads per quarter (auto-generated)
- Prominent CTA: "Withdraw ₹X" button (enabled when ≥ ₹500, KYC verified)

**`/creator/earnings/withdraw` — Withdrawal flow**
- If KYC incomplete: redirect/inline block → "Complete KYC to withdraw" CTA
- If bank not verified: penny-drop flow
- If eligible:
  - Gross amount (prefilled with current balance, optionally editable to partial)
  - Live breakdown (as per Chunk C math):
    ```
    Withdrawing:        ₹6,000
    TCS 1%:             - ₹60
    TDS 1%:             - ₹60
    GST 18%:            - ₹1,080
    ────────────────────────────
    To your bank:       ₹4,800
    Claimable in ITR:   ₹120
    ```
  - Bank account display (last 4 digits, IFSC, holder name)
  - Confirm button "Withdraw ₹4,800 to HDFC ••••1234"
  - On submit → Cashfree Payouts API → processing state → success/failure
  - Success: Lottie "coins to bank" animation + toast + SMS/email receipt

#### 5.3 Motion specs

| Element | Animation |
|---|---|
| Session complete badge appear | Scale 0 → 1 + rotation spring (500ms) + subtle confetti |
| Rating stars hover-fill | Stars fill sequentially left-to-right on hover (100ms each) |
| Pending balance counter | Count up from 0 on first load; delta animation on updates (800ms) |
| Withdraw button enabled-state transition | Gold fill grows from left to right when becomes eligible |
| Deduction breakup | Each line stagger fade-in 60ms apart |
| Withdrawal success | Full-screen Lottie "bank transfer" (1200ms) + ₹ particle burst + toast |

#### 5.4 Mobile

- Session complete: stats stack vertical, gallery 2-col
- Earnings: tabs become segmented control at top
- Withdrawal: full-screen modal with sticky bottom confirm button
- Live breakdown takes ~40vh, confirm sits at bottom safe-area

---

## 4. Dashboards (home pages)

### 4.1 `/brand/dashboard`

**Top (hero strip)**
- Credits balance (big animated counter) + "Top up" CTA
- Active licenses count + "View all"
- Images generated this month

**Middle**
- **Active licenses** — horizontal scroll of cards (large desktop), stack (mobile) — 3 most recent
- **Quick actions** — 3 tiles: Find creators / Top up credits / View sessions

**Bottom**
- Recent activity feed (system-generated events in reverse chrono)
- Recommended creators (V2 — algorithmic; MVP shows recent onboarded)

Motion: hero stats count-up on load (stagger 100ms), cards reveal with stagger 40ms

### 4.2 `/creator/dashboard`

**Top**
- Pending balance (big animated counter) + "Withdraw" CTA (dim when < ₹500)
- Pending approvals count (urgent red if > 0 and SLA close) + "Review now"
- Active sessions count

**Middle**
- **Pending approvals list** — 3 most urgent (SLA-sorted) with quick approve action
- **New requests** — 3 most recent unseen requests

**Bottom**
- Earnings chart (last 90 days) — simple line/bar (recharts-light or d3)
- Recent session closures with ratings received
- Tips card (rotating static tips — how to improve listing, etc.)

Motion: SLA timers tick in real-time; hero counters animate on load

---

## 5. Onboarding flows

### 5.1 Creator onboarding (7 steps, per HTML)

Each step is its own page under `/creator/onboarding/` with shared `OnboardingShell`.

```
Step 1: Welcome + Basic info
  - Full name, display name, phone (already from signup), brief bio (140 char)

Step 2: Reference photos (likeness)
  - Upload 10-20 photos (drag-drop area, progress bars)
  - Photo grid with retake option
  - Face embedding extraction kicks off in background
  - Must confirm 10+ photos before proceed

Step 3: Likeness agreement (DPDP consent)
  - Scroll-gate checkbox: "I consent to likeness processing per DPDP"
  - Signed + audit row inserted

Step 4: Category & subcategory
  - Primary category (single select from 12 options)
  - Subcategories (multi-select up to 5)

Step 5: Blocked concepts (compliance)
  - Pre-populated list of common blocks (alcohol, tobacco, gambling, etc.)
  - Custom blocks: textarea, comma-separated
  - These embeddings go into compliance_vectors

Step 6: License listings
  - Live-calc form for Creation License (price + quota + validity)
  - Optional: add Creation+Promotion listing
  - Either must have IG handle verified for Creation+Promotion

Step 7: KYC (can defer)
  - PAN (via Cashfree KYC)
  - Aadhaar (last 4 + hash)
  - Bank account + penny drop
  - CTA: "Complete later" → land in dashboard with banner

  OR CTA: "Complete now" → all 3 KYC sub-steps → verified → dashboard
```

Motion per step:
- Progress bar fills on advance
- Step transition: current slides left, next slides in from right (300ms)
- Upload progress: individual file progress bars, spring
- Success checkmark at end of each step (100ms before transition)

### 5.2 Brand onboarding (5 steps)

```
Step 1: Welcome + Company info
  - Company name, category, team size

Step 2: GSTIN (optional)
  - "Add GSTIN for ITC benefit" — skippable

Step 3: Brand kit (optional)
  - Logo upload, brand color hex, brand voice note

Step 4: Use case
  - Dropdown: "What will you use Faiceoff for?" (UGC ads, product shots, social content, internal campaigns, other)

Step 5: Starter credits
  - 5 free credits auto-granted + option to top up
  - Show credit pack options, can skip → lands in dashboard
```

Same motion system as creator onboarding.

---

## 6. Notifications system

### 6.1 Channels
- **In-app**: bell popover in top bar + badge count
- **Email**: Resend-sent digest + urgent events
- **Push**: V2 (web push via Inngest + Push API)

### 6.2 Event catalog

| Event | Who gets | Channel |
|---|---|---|
| License requested (brand → creator) | Creator | In-app + email |
| License accepted | Brand | In-app + email |
| License rejected | Brand | In-app + email |
| Image generated & awaiting approval | Creator | In-app + email (batched, max 1/hr) |
| Image approved | Brand | In-app |
| Image rejected | Brand | In-app + email |
| License completed | Both | In-app + email |
| License expired with refund | Both | In-app + email |
| Withdrawal initiated | Creator | In-app |
| Withdrawal success | Creator | In-app + email + SMS (future) |
| Withdrawal failed | Creator | In-app + email (urgent) |
| Credits topped up | Brand | In-app + email (receipt) |
| Dispute raised on your work | Counterparty | In-app + email |
| SLA expiring on approval | Creator | In-app (at 6h remaining) |

### 6.3 In-app notification popover
- Bell icon in top bar with red dot if unread
- Click: popover with list (50 most recent)
- Each: icon by type, title, short desc, time ago, unread dot
- Click notification: routes to relevant page, marks read
- "Mark all read" at top

### 6.4 Motion
- Bell wiggle + gold pulse dot on new notification (400ms, once)
- Popover entrance: scale 0.95 + fade (180ms), origin top-right
- List item mark-read: dot fades out (150ms)
- Unread count badge pulse on decrement (100ms)

---

## 7. Dispute flow

### 7.1 Raise dispute
- Any party can raise dispute on a specific image or license
- From image detail: "Report issue" button (ghost)
- Form: reason dropdown + description + evidence attachments
- Creates `disputes` row, status: OPEN, both parties notified
- During dispute: affected image/license frozen (no more actions possible)

### 7.2 Dispute UI
- `/{role}/disputes` (new route, missed in Chunk B — add): list of active + past disputes
- Each dispute has a thread (similar to chat) for back-and-forth with admin mediator
- Admin can: refund brand, release to creator, split, close no-action

### 7.3 Admin dispute management
- `/admin/disputes` with all open disputes queued by age
- Click → full ledger context + original chat + dispute thread + actions
- Actions trigger state machine transitions + ledger entries

---

## 8. Component inventory

Net-new components on top of Chunk B shells:

```
src/components/brand/
  creator-card.tsx
  creator-profile-header.tsx
  license-card-listing.tsx
  license-request-form.tsx
  checkout-summary.tsx
  credits-balance-widget.tsx
  credit-pack-selector.tsx

src/components/creator/
  request-card-inbox.tsx
  request-detail-view.tsx
  contract-viewer.tsx
  approval-queue-card.tsx
  approval-review-panel.tsx
  earnings-hero.tsx
  withdrawal-form.tsx
  withdrawal-breakdown.tsx
  license-listing-editor.tsx          # live-calc price/quota/validity
  earnings-chart.tsx

src/components/shared/
  license-progress-bar.tsx            # quota visualizer
  generation-progress-pipeline.tsx    # 5-dot pipeline
  image-gallery.tsx
  image-card.tsx                      # status-aware (generating/awaiting/approved/rejected/delivered)
  image-lightbox.tsx
  chat-thread.tsx
  chat-message.tsx
  chat-composer.tsx
  sla-countdown.tsx
  session-status-badge.tsx
  rating-input.tsx                    # 5-star animated
  ledger-timeline.tsx                 # for admin disputes + dispute history

src/components/animations/
  lottie-confetti.tsx
  lottie-success.tsx
  lottie-empty-state.tsx
  lottie-payment-landed.tsx
  lottie-bank-transfer.tsx
  generation-scan-reveal.tsx          # Framer gradient wipe on image
  number-counter.tsx                  # animated currency counter
  checkmark-draw.tsx                  # SVG pathLength animate
  staggered-list.tsx                  # wrapper for stagger reveals
```

---

## 9. State management

### 9.1 Server state (primary)
- **React Query (TanStack Query)** for server state. Already in ecosystem or install.
- Each resource has a query hook: `useLicense(id)`, `useCreatorProfile(id)`, `useApprovals()`, `useEarnings()`
- Mutations: `useAcceptLicense()`, `useApproveImage()`, `useWithdraw()`
- Cache invalidation: tagged per resource

### 9.2 Real-time updates
- **Supabase Realtime** for: chat messages, approval status changes, notification arrivals
- **Inngest Realtime** for: generation pipeline progress (per-step updates as Inngest steps complete)
- Channel per resource: `license:{id}`, `user:{id}:notifications`, `generation:{id}:pipeline`

### 9.3 Local state
- React useState for UI toggles (drawer open, tab active)
- URL state for filters + sorts (nuqs or simple useSearchParams)
- Zustand **only** for cross-page ephemeral state (e.g., ongoing upload progress, chat draft)

---

## 10. Performance

### 10.1 Route-level optimizations
- Server components by default
- Client components only for interactive parts (chat input, approval buttons, Framer Motion islands)
- Parallel routes for dashboards (hero + sections loaded in parallel)
- Streaming with `<Suspense>` for slow data (reviews, charts)

### 10.2 Image handling
- `next/image` everywhere with explicit `sizes`
- LQIP (low-quality image placeholder) for gallery grid — blur-up
- R2 URLs served via signed URLs cached for 1h
- Gallery: virtualized if > 50 images (react-virtuoso)

### 10.3 Bundle budgets
- Each role dashboard initial JS ≤ 180KB gzipped
- Lottie JSONs lazy-loaded per moment, each < 40KB
- Contract viewer (react-pdf): lazy-loaded only when viewing contract
- Chart library: dynamic import, load only on earnings page

---

## 11. Accessibility deep-dive

- Every form validates inline with `aria-describedby` linked error messages
- Modals: `role="dialog"`, `aria-modal="true"`, focus-trap, ESC close
- Progress bars: `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Chat: `role="log"`, `aria-live="polite"` for new message announcements
- SLA timers: announce at 6h and 1h remaining via `aria-live="assertive"` (urgent)
- Image gallery: keyboard nav between cards, Enter opens lightbox, arrows navigate in lightbox
- Contract viewer: alternative text description of scope + critical clauses accessible outside PDF
- Withdraw flow: confirm step has explicit "you are transferring ₹X to bank Y" — clear for screen readers

---

## 12. Inngest pipeline integration points (Chunk D wiring)

Generation pipeline already exists in `src/inngest/functions/generation/generation-pipeline.ts`. Wiring:

### 12.1 Events emitted from UI

```
generation/created                  Brand clicks "Generate" → UI emits event
license/accepted                    Creator signs contract → triggers escrow lock
withdrawal/requested                Creator hits withdraw → triggers Cashfree Payouts
image/approved                      Creator approves → releases per-image payment
image/rejected                      Creator rejects → increments retry counter
license/expired-check               Scheduled — runs daily, triggers refunds
reconcile/cashfree                  Scheduled — runs hourly, reconciles stuck txns
```

### 12.2 UI listens to Inngest Realtime

For `generation/created`:
- Frontend subscribes to `generation:{id}:pipeline` channel
- Each Inngest step completion (`compliance-check.done`, `prompt-assembly.done`, `generate-image.done`, `output-safety.done`) emits realtime event
- UI updates the 5-dot progress pipeline in real-time
- On final `generation/completed` event: gallery card morphs to "Awaiting approval"

### 12.3 Error handling

- If Inngest pipeline fails (e.g., face similarity 0, safety rejection): gallery card shows red border with error message + retry option
- Brand can click "Retry" → counts against retry budget (per Chunk C decision)
- Platform cost protection: pipeline uses `retries: 0` + NonRetriableError wrap (already implemented)

---

## 13. Testing strategy

### 13.1 E2E (Playwright)
- **Brand journey**: signup → onboarding → top-up → browse creators → request license → view breakdown → await accept
- **Creator journey**: signup → onboarding + KYC → accept request → sign contract → approve 1 image → withdraw
- **Dispute journey**: raise dispute → admin resolves with refund → both parties notified + balances updated

### 13.2 Visual regression (Chromatic or Percy — MVP can defer)
- Storybook stories for each key component with motion states captured
- Screenshot diff on PR

### 13.3 Component tests (Vitest + Testing Library)
- Each custom component has tests for: render, interactions, motion variants (motion tests mock Framer)
- Forms: input validation, submission flow, error states

### 13.4 Mobile
- Playwright mobile projects (iPhone 12 Pro, Pixel 5) — subset of E2E
- Manual QA checklist on real devices before each release

---

## 14. Analytics events

PostHog events to instrument per flow:

```
creator.signup.started
creator.onboarding.step_completed           {step: 1-7}
creator.listing.created                     {template, price, quota}
creator.request.accepted                    {license_id, price}
creator.contract.signed                     {license_id}
creator.image.approved                      {image_id, time_to_approve_ms}
creator.image.rejected                      {image_id, reason}
creator.withdrawal.initiated                {amount_paise}
creator.withdrawal.success                  {net_amount_paise}

brand.signup.started
brand.onboarding.step_completed             {step: 1-5}
brand.credits.topped_up                     {pack, amount_paise}
brand.creator.viewed                        {creator_id}
brand.license.requested                     {creator_id, template, price}
brand.image.generated                       {license_id, attempt_number}
brand.session.rated                         {creator_id, rating}

platform.sla.timer_expired                  {request_id, type}
platform.dispute.raised                     {entity_type, entity_id}
```

---

## 15. Files to create (Chunk D scope)

This is the biggest chunk by file count. High-level summary:

```
src/app/brand/dashboard/page.tsx              (actual content, replaces stub)
src/app/brand/creators/page.tsx
src/app/brand/creators/[id]/page.tsx
src/app/brand/licenses/page.tsx
src/app/brand/licenses/new/page.tsx
src/app/brand/licenses/[id]/page.tsx
src/app/brand/sessions/page.tsx
src/app/brand/sessions/[id]/page.tsx
src/app/brand/credits/page.tsx
src/app/brand/credits/top-up/page.tsx
src/app/brand/onboarding/step-[n]/page.tsx    (5 step files)
src/app/brand/settings/*                      (profile, billing, team stubs)
src/app/brand/disputes/page.tsx
src/app/brand/disputes/[id]/page.tsx

src/app/creator/dashboard/page.tsx
src/app/creator/listings/page.tsx
src/app/creator/listings/new/page.tsx
src/app/creator/listings/[id]/page.tsx
src/app/creator/requests/page.tsx
src/app/creator/requests/[id]/page.tsx
src/app/creator/sessions/page.tsx
src/app/creator/sessions/[id]/page.tsx
src/app/creator/approvals/page.tsx
src/app/creator/approvals/[id]/page.tsx
src/app/creator/earnings/page.tsx
src/app/creator/earnings/withdraw/page.tsx
src/app/creator/kyc/page.tsx
src/app/creator/reference-photos/page.tsx
src/app/creator/onboarding/step-[n]/page.tsx  (7 step files)
src/app/creator/settings/*
src/app/creator/disputes/page.tsx
src/app/creator/disputes/[id]/page.tsx

src/app/admin/disputes/page.tsx
src/app/admin/disputes/[id]/page.tsx
src/app/admin/ledgers/page.tsx
src/app/admin/reconcile/page.tsx
src/app/admin/users/page.tsx
src/app/admin/audit-log/page.tsx

src/components/brand/*
src/components/creator/*
src/components/shared/*
src/components/animations/*

src/app/u/generations/[id]/page.tsx           (public watermarked preview)
src/app/u/profile/[creator_id]/page.tsx       (public creator profile)

src/lib/hooks/*                               (React Query hooks per resource)
src/lib/realtime/                             (Supabase + Inngest realtime clients)
```

---

## 16. Success criteria

Chunk D complete when:

1. ✅ Brand can signup → onboard → top-up → find creator → request license (full Stage 1)
2. ✅ Creator can signup → onboard → create listing → receive request → view contract → accept (Stage 2)
3. ✅ Brand can generate images in active license; progress visible in real-time (Stage 3)
4. ✅ Creator can approve/reject images; SLA timer works; auto-reject at 48h (Stage 4)
5. ✅ Session completes on quota use or expiry; refund on expiry correct (Stage 5)
6. ✅ Creator can withdraw; deductions displayed correctly; Cashfree IMPS fires; bank receives (Stage 5)
7. ✅ Brand can rate creator post-completion
8. ✅ Dispute flow works end-to-end for both roles; admin can resolve
9. ✅ Notifications (in-app + email) trigger on all catalog events
10. ✅ Real-time updates: chat messages appear live, generation progress ticks live, approvals update live
11. ✅ Mobile: iPhone SE (375px) passes — bottom nav, stacked cards, no horizontal scroll, touch targets ≥ 44px
12. ✅ Motion: all 30+ micro-animations in spec implemented; reduced-motion respected
13. ✅ Lighthouse mobile perf ≥ 85 on dashboards, ≥ 90 on marketing
14. ✅ Accessibility: keyboard navigable, screen-reader friendly (VoiceOver smoke test)
15. ✅ PostHog events firing for all catalog events; funnels visible

---

*End of Chunk D spec. This is the biggest chunk — implementation will span multiple sub-phases (see implementation plan for detailed task breakdown).*
