@AGENTS.md

# Faiceoff — AI Likeness Licensing Marketplace (India)

> **For incoming agent (Antigravity / future Claude):** This file is the
> source of truth for the current state of the codebase. Read it before
> touching anything. Critical sections: **Current State**, **Canonical Flows**,
> **Known Issues**, **Pending Work**, **Anti-Patterns to Avoid**.

---

## What is Faiceoff?

Two-sided marketplace where **creators license their face** and **brands generate AI content** using that licensed likeness. Every generation is consented, tracked, and paid in INR. Built for India (DPDP Act compliance, GST-invoiced, Razorpay).

**Live URL:** https://faiceoff.com (Vercel hosted)
**Repo:** https://github.com/pranavchhipa/Faiceoff

---

## 🚨 CRITICAL CURRENT STATE (read this first)

### What's working in production right now
- ✅ Brand signup/login → wallet top-up (Cashfree path; Razorpay swap pending)
- ✅ Brand discovers creator → starts campaign → Gemini 3 Pro Image generates
- ✅ Brand review gate (Approve / Retry / Discard) before creator sees image
- ✅ Creator approval flow → license PDF + escrow credit + email notification
- ✅ 48h auto-approve cron (daily, due to Vercel Hobby tier cron limit)
- ✅ Brand ↔ Creator chat (realtime via Supabase channels) — gated behind 1st approval
- ✅ Vault with single + bulk download (ZIP)
- ✅ Compliance vector check enforces creator's blocked categories
- ✅ Sentry, PostHog (3 funnel events), rate limits, EXIF metadata embed

### What's BROKEN / soft-failing right now
| Issue | Impact | Fix |
|---|---|---|
| **Upstash Redis stale** | Rate limiter returns "fail-open" — no actual rate limiting | User must rotate `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` from console.upstash.com |
| **`deduct_credit` RPC schema mismatch** | Soft-failed via try/catch — generations effectively run free | Postgres RPC references column `credits` of `credit_transactions` that doesn't exist. Need DB migration to fix RPC OR add column |
| **Cashfree integration** | Half-wired — top-up uses Cashfree, payouts incomplete | Will be ripped out and replaced with Razorpay (see Pending Work) |
| **Stale Supabase types** | TypeScript build errors — fixed by `ignoreBuildErrors: true` in `next.config.ts` | Run `supabase gen types typescript` after migrations 00025, 00040 are reflected; remove the flag |

### What needs the user (cannot do without their input)
1. **Razorpay 7 keys** — for payment swap (4h work after I have keys)
2. **GST registration** — required for B2B invoicing
3. **Resend domain DNS** — emails currently work but from test address
4. **Sentry account + DSN** — error monitoring not active in prod
5. **PostHog account + key** — events fire but no dashboard
6. **Legal copy** (T&C / Privacy / Refund / DPDP) — required before public launch
7. **Mobile QA testing** — needs to be done on real phone, screenshots back to agent

---

## Tech Stack (current)

- **Framework**: Next.js 16 App Router (React 19)
- **Database**: Supabase PostgreSQL + pgvector (1536-dim embeddings)
- **Auth**: Supabase Auth — email OTP (8-digit) via Resend SMTP
- **Payments** (CURRENT, will change): Cashfree partial; **MUST swap to Razorpay** when keys land
- **AI Pipeline**: Gemini 3 Pro Image (Nano Banana Pro) via `@google/genai` SDK; OpenRouter (Llama 3.1 8B for prompt assembly); Hive (content moderation)
- **Storage**: Cloudflare R2 (S3-compatible CDN) — for generated images; Supabase Storage — for product/reference photos
- **Background tasks**: Next.js `after()` (Inngest was deleted — see Anti-Patterns)
- **Realtime**: Supabase channels (chat)
- **Rate Limiting**: Upstash Redis (currently failing-open due to stale credentials)
- **Observability**: Sentry, PostHog (server + client)
- **Email**: Resend — OTP working; transactional templates wired but domain may need DNS verification
- **Styling**: Tailwind CSS v4, Framer Motion 12, shadcn/ui components

---

## Design System — "Hybrid Soft Luxe v2"

- **Fonts**: Outfit (display 500-800), Plus Jakarta Sans (body 400-600), JetBrains Mono (code), Space Grotesk, Manrope
- **NEVER use italic fonts** — bold geometric sans only
- **Canonical color tokens** (use these everywhere, NOT the legacy `--color-ink` etc.):
  - `var(--color-foreground)` — text
  - `var(--color-muted-foreground)` — secondary text
  - `var(--color-card)` — card background
  - `var(--color-secondary)` — subtle background
  - `var(--color-border)` — borders
  - `var(--color-primary)` — accent (gold)
  - `var(--color-primary-foreground)` — text on primary
- **Anti-pattern**: hardcoded `bg-white`, `text-[var(--color-ink)]`, `border-[var(--color-neutral-200)]` — these break dark mode. Always use canonical tokens above.
- **Radius**: `--radius-card` `1rem`, `--radius-button` `0.625rem`, `--radius-pill` `9999px`, `--radius-input` `0.5rem`
- **Logo**: `/public/logo-mark.png` — used in sidebars (no gold background, just the mark)

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                # Login, signup, OTP verify, forgot/reset
│   ├── (dashboard)/           # Authenticated — single layout in (dashboard)/layout.tsx
│   │   ├── layout.tsx         # Switches CREATOR_NAV / BRAND_NAV / ADMIN_NAV by role
│   │   ├── dashboard/         # Legacy role-aware pages (kept; re-exported from /creator|/brand)
│   │   ├── admin/             # /admin, /admin/safety, /admin/stuck-gens, /admin/packs
│   │   ├── brand/             # /brand/dashboard, /discover, /sessions, /vault, /licenses,
│   │   │                      # /credits, /wallet, /billing, /settings, /inbox (NEW: chat)
│   │   └── creator/           # /creator/dashboard, /approvals, /likeness, /earnings,
│   │                          # /withdraw, /collaborations, /licenses, /payouts, /analytics,
│   │                          # /blocked-categories, /settings, /inbox (NEW: chat)
│   ├── (marketing)/           # Landing, /for-brands, /for-creators, /pricing, /verify/[license_id]
│   ├── api/
│   │   ├── auth/              # sign-up, sign-in, verify-otp, sign-out, delete-account
│   │   ├── credits/           # top-up (Cashfree, swap to Razorpay), balance
│   │   ├── cashfree/          # webhook receiver (REMOVE after Razorpay swap)
│   │   ├── razorpay/          # NEW (TODO) — webhook + order creation
│   │   ├── chat/              # NEW: conversations + messages
│   │   │   ├── conversations/route.ts        # GET list, POST create (eligibility-gated)
│   │   │   └── conversations/[id]/messages/route.ts  # GET paginated, POST send
│   │   ├── creator/           # likeness-data, approvals
│   │   ├── generations/[id]/  # GET, approve (legacy), retry, discard, send-for-approval
│   │   ├── approvals/[id]/    # CANONICAL approve/reject (with license + emails)
│   │   ├── onboarding/        # 8 routes (save-photos triggers face embedding)
│   │   ├── settings/          # GET/PUT profile, avatar upload
│   │   ├── vault/             # list, [id], [id]/download, bulk-download (NEW)
│   │   ├── webhooks/          # Cashfree + Replicate (Cashfree to be removed)
│   │   ├── whoami/            # Role/profile resolver
│   │   ├── withdrawals/       # create, list, [id]
│   │   ├── cron/              # auto-approve (NEW), license-renewals, etc.
│   │   ├── admin/             # safety/queue, stuck-gens, packs
│   │   └── campaigns/create   # Brand creates campaign + N draft gens, dispatches via after()
│   ├── sitemap.ts             # NEW: SEO sitemap
│   └── robots.ts              # NEW: SEO robots
├── components/
│   ├── chat/chat-inbox.tsx    # NEW: Split-pane realtime chat UI (shared brand+creator)
│   ├── dashboard/             # Sidebars, topbars, mobile nav
│   ├── providers/             # Auth, theme
│   ├── landing/               # Hero, BrandDemo, CreatorDemo, AuthShell, images.ts
│   └── ui/                    # shadcn/ui (button, card, input, dialog, etc.)
├── config/
│   ├── nav-items.brand.ts     # BRAND_SIDE_NAV + BRAND_MOBILE_NAV
│   ├── nav-items.creator.ts   # CREATOR_SIDE_NAV + CREATOR_MOBILE_NAV
│   ├── nav-items.admin.ts
│   ├── routes.ts              # Role + ROLE_HOME map
│   ├── legacy-redirects.ts    # Old /dashboard/* → role-prefixed redirects
│   └── campaign-options.ts    # Pill option enums (settings, pose, mood, etc.)
├── lib/
│   ├── ai/
│   │   ├── gemini-client.ts        # generateImage() + refineProductInImage() — book-end prompt
│   │   ├── prompt-assembler.ts     # OpenRouter LLM, switched to Llama 3.1 8B for speed
│   │   ├── run-generation.ts       # Orchestrator (after() entry point) — full pipeline
│   │   ├── image-metadata.ts       # NEW: EXIF embed (sharp)
│   │   ├── face-similarity.ts      # NEW: skeleton (off by default, env-gated)
│   │   ├── hive-client.ts          # Content safety
│   │   └── openrouter-client.ts    # LLM helper
│   ├── billing/
│   │   ├── wallet-service.ts       # reserveWallet, releaseReserve, spendWallet, refundWallet
│   │   ├── credits-service.ts      # deductCredit, addCredits (RPC currently broken)
│   │   ├── pack-catalog.ts, pricing-engine.ts, rpc.ts
│   │   └── index.ts                # Barrel export + PLATFORM_COMMISSION_RATE constants
│   ├── compliance/
│   │   ├── three-layer-check.ts    # Layer 1 keywords, Layer 2 vector, Layer 3 LLM
│   │   ├── category-mapping.ts
│   │   └── index.ts                # runComplianceCheck()
│   ├── email/
│   │   ├── send-otp.ts             # Resend OTP via Supabase admin
│   │   └── transactional.ts        # NEW: 5 templates (creator approval req, brand approved/rejected, payout, low credits)
│   ├── licenses/                   # issueLicense + cert-pdf + verify
│   ├── payments/cashfree/          # CURRENT (to be deleted on Razorpay swap)
│   ├── observability/
│   │   ├── sentry.ts               # initSentry + withSentryContext helper
│   │   ├── posthog.ts              # Browser client
│   │   └── analytics.ts            # NEW: server-side track() helper
│   ├── redis/                      # Upstash + rate-limiter (fail-open)
│   ├── storage/                    # R2 client
│   ├── supabase/                   # client.ts (BROWSER, static env access), server.ts, admin.ts, middleware.ts
│   ├── vault/                      # vault-service, download-formats (ZIP/PDF/DOCX)
│   └── utils/                      # cn, errors, format-currency, invariant, image-compression
├── proxy.ts                        # Middleware (session refresh, route guards, legacy redirects)
└── types/supabase.ts               # STALE — needs regen after 00025, 00039, 00040
```

**`/src/inngest/` was DELETED** — pipeline runs via `after()` now. Don't recreate.

---

## Database Tables

### Core (existing pre-this-session)
1. `users` — id, email, phone, role, display_name, avatar_url
2. `creators` — user_id, instagram_handle, bio, kyc_status, onboarding_step (9 steps), is_active, dpdp_consent, face_anchor_pack
3. `brands` — user_id, company_name, gst_number, website_url, industry, is_verified, credits_balance_paise, credits_reserved_paise
4. `creator_categories` — creator_id, category, subcategories[], price_per_generation_paise, is_active
5. `creator_compliance_vectors` — creator_id, blocked_concept, embedding (1536-dim)
6. `creator_reference_photos` — creator_id, storage_path, is_primary, **face_embedding (512-dim)** ← populated by onboarding/save-photos
7. `collab_sessions` — RENAMED from `campaigns` in migration 00025. brand_id, creator_id, budget_paise, max_generations, status, license_request_id
8. `generations` — collab_session_id (renamed from campaign_id), structured_brief (JSONB), **status check constraint** includes: `draft, compliance_check, generating, output_check, ready_for_brand_review, ready_for_approval, approved, rejected, failed, discarded`. Plus: assembled_prompt, image_url, cost_paise, retry_count, is_free_retry, base_image_url, upscaled_url, quality_scores, generation_attempts, provider_prediction_id, pipeline_version
9. `approvals` — generation_id, creator_id, brand_id, status, feedback, expires_at (48h)
10. `wallet_transactions_archive` — legacy ledger, sealed read-only
11. `disputes` — generation_id, raised_by, status, resolution_notes
12. `licenses` — issued on approval, has cert PDF + R2 URL

### Money ledgers (00020-00023)
- `credit_top_ups` — Cashfree/Razorpay order lifecycle
- `credit_transactions` — credit movements (⚠️ deduct_credit RPC has stale column reference)
- `escrow_ledger` — creator-held funds, 7-day holding period
- `platform_revenue_ledger` — commission + GST recognition
- `gst_output_ledger`, `tcs_ledger`, `tds_ledger` — statutory tax ledgers
- `webhook_events` — idempotent webhook audit log

### Brand review gate (00039) — NEW
- Added statuses to `generations.status` check constraint:
  - `ready_for_brand_review` — image generated + safety-passed; brand previews
  - `discarded` — brand rejected at preview OR superseded by retry

### Brand-creator chat (00040) — NEW
- `conversations` — unique (brand_id, creator_id), last_message_at
- `conversation_messages` — sender_role, body, read_by_brand, read_by_creator
- Trigger: `handle_message_insert` bumps conversations.last_message_at
- RLS enabled — both sides only read their own threads
- **Realtime publication MUST be enabled**: `alter publication supabase_realtime add table public.conversations, public.conversation_messages;`

---

## 🔁 Canonical Brand → Creator Collab Flow (DO NOT FORGET)

This was brainstormed end-to-end. **Nothing auto-deducts. Brand pays manually after acceptance.**
The previous "wallet auto-debit on session start" model is dead — don't reintroduce it.

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Brand sends request                                             │
│     POST /api/collab-requests                                       │
│     → Inserts collab_requests row { status: 'pending', expires_at } │
│     → 72h TTL. Brand is NOT charged. No order created.              │
│     → Email creator (sendCreatorCollabRequest)                      │
├─────────────────────────────────────────────────────────────────────┤
│  2. Creator decides (within 72h)                                    │
│     a) Accept: POST /api/collab-requests/[id]/accept                │
│        → status = 'accepted', decided_at = now                      │
│        → Auto-creates conversations row (idempotent)                │
│        → Email brand (sendBrandRequestAccepted) with "Pay" CTA      │
│     b) Decline: POST /api/collab-requests/[id]/decline              │
│        → status = 'declined'. Email brand. Brand never charged.     │
│     c) Silence past 72h: cron flips status = 'expired'              │
├─────────────────────────────────────────────────────────────────────┤
│  3. Brand pays manually (THIS IS A USER ACTION, NOT AUTOMATIC)      │
│     Brand sees Pay button on /brand/collabs/[id]                    │
│     POST /api/collabs/[id]/start-payment                            │
│     → Creates Razorpay order, returns { order_id, key_id, amount }  │
│     Browser opens Razorpay Checkout modal                           │
│     User clicks Pay in Razorpay UI → bank/UPI/card                  │
│     Razorpay redirects + sends webhook                              │
│     POST /api/collabs/[id]/confirm-payment                          │
│     → Verifies HMAC signature                                       │
│     → Creates collab_sessions row (status='active')                 │
│     → Funds enter Faiceoff escrow (escrow_ledger reserved)          │
│     → Generation credits unlocked = final_images × 3                │
├─────────────────────────────────────────────────────────────────────┤
│  4. Brand generates in Studio (per-image cycle)                     │
│     For each generation slot in the package:                        │
│     a) Brand picks product image (main OR same-family variant)      │
│     b) Brand writes optional brief tweak                            │
│     c) Brand clicks Generate → run-generation.ts pipeline           │
│     d) Compliance check, Gemini 3 Pro, Hive safety, R2 upload       │
│     e) Status: ready_for_brand_review                               │
├─────────────────────────────────────────────────────────────────────┤
│  5. Brand review gate (per image)                                   │
│     Send to creator | Retry (1st free, 2nd+ = 1 credit) | Discard   │
├─────────────────────────────────────────────────────────────────────┤
│  6. Creator approval gate (per image)                               │
│     Approve → license PDF issued, escrow credit (70% to creator)    │
│     Reject  → wallet refund + credit rollback                       │
│     48h silence → cron auto-approves                                │
├─────────────────────────────────────────────────────────────────────┤
│  7. Collab completes when all final_images approved                 │
│     → collab_sessions.status = 'completed'                          │
│     → Escrow releases creator's full payout                         │
│     → Email both sides                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### What this means for UI copy
- ✅ "Click **Pay** to settle the package price after acceptance"
- ✅ "Funds held in escrow — released when the collab completes"
- ❌ "You'll be charged when the creator accepts" (sounds auto)
- ❌ "Auto-deduct from wallet" (the wallet-debit model is dead)
- ❌ "Pay upfront when sending" (no — payment happens AFTER acceptance only)

### Studio multi-product workflow
- Request stage: brand uploads **1 main product image** → creator evaluates the brief
- After acceptance + payment: brand can swap in **same-family variants** per generation in Studio (e.g. 5 different shoe colors of the same model). Switching to an unrelated product (shoes → cars) is a contract break and should require a new collab request.

---

## Generation Pipeline (run-generation.ts)

`/api/campaigns/create` → inserts N draft gen rows → fires `after(() => runGenerationsBatch(ids))` → for each gen:

1. **Atomic claim**: `UPDATE generations SET status='generating' WHERE status='draft'`
2. **Billing pre-charge** (currently soft-failing — see Known Issues): deductCredit + reserveWallet
3. **Compliance check** (`runComplianceCheck`) — 3-layer; hard-block on fail with refund
4. **Pick face refs**: primary + 2 random from `creator_reference_photos`
5. **Fetch product image** from `brief.product_image_url`
6. **Assemble prompt** via OpenRouter (Llama 3.1 8B)
7. **Gemini 3 Pro Image** generation with face refs + product + book-end anchor prompt
8. **(Optional) Stage 2 refinement** via `refineProductInImage` (env-gated, OFF by default on Pro)
9. **EXIF metadata embed** via `embedFaiceoffMetadata` (sharp)
10. **R2 upload** to `generations/<id>/raw.<ext>`
11. **Hive safety check** on the public R2 URL
12. **Status flip** → `ready_for_brand_review`

**Then on brand action** (`/api/generations/[id]/send-for-approval`):
- Inserts approval row (48h expiry from now)
- Status: `ready_for_approval`
- **Email creator** via `sendCreatorApprovalRequest` (Resend, fire-and-forget)

**Then on creator approval** (`/api/approvals/[id]/approve`):
- spendWallet (lock → spent)
- Insert escrow_ledger (creator's 70% with 7-day holding)
- Insert platform_revenue_ledger (30% + 18% GST)
- issueLicense (PDF gen + R2 upload + cert URL)
- **Auto-create chat conversation** (idempotent upsert on unique pair)
- Email brand via `sendBrandApproved`
- track('generation_approved') in PostHog

**On creator reject** (`/api/approvals/[id]/reject`):
- releaseReserve (refund wallet)
- Refund credit via rollback_credit_for_generation RPC
- Email brand via `sendBrandRejected` with feedback + refund amount
- track('generation_rejected')

**48h auto-approve cron** (`/api/cron/auto-approve`, daily at 3am UTC):
- Finds approvals expired past 48h
- Runs same approval flow as creator click
- Vercel Hobby tier limits cron to once-per-day (was hourly originally)

---

## Brand Review Gate

After image generates (status `ready_for_brand_review`), brand has 3 actions:

| Action | API | Effect |
|---|---|---|
| **Send to creator** | `POST /api/generations/[id]/send-for-approval` | Creates approval row, status → `ready_for_approval`, emails creator |
| **Retry** | `POST /api/generations/[id]/retry` | Old gen → `discarded`. New gen created with retry_count + 1. **Pricing model: 1st retry FREE, 2nd+ deducts 1 credit, never deducts wallet** |
| **Discard** | `POST /api/generations/[id]/discard` | Status → `discarded`, refunds via releaseReserve + rollback_credit |

24h auto-send fallback in GET `/api/generations/[id]`: if `ready_for_brand_review` and updated_at > 24h ago, auto-promotes to `ready_for_approval` so brands can't hang the pipeline forever.

---

## Auth Flow

1. Sign up → Supabase creates user + sends 8-digit OTP via Resend (Supabase admin generateLink)
2. Verify OTP (rate-limited 10/5min per email) → upserts `public.users` + `creators`/`brands` row
3. Session managed via `proxy.ts` middleware (token refresh on every request)
4. Admin client (`createAdminClient()`) bypasses RLS for server-side ops

**⚠️ CRITICAL**: `src/lib/supabase/client.ts` MUST use STATIC env access:
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;  // ✅ static — webpack inlines
// const url = process.env[name];  // ❌ dynamic — undefined in browser bundle
```
Next.js webpack DefinePlugin only inlines `NEXT_PUBLIC_*` when accessed statically. Was a 2-hour debugging session.

---

## Routing & Role-Based Pages

- **Three role spaces**: `/admin/*`, `/brand/*`, `/creator/*` — each with own sidebar nav
- **Single layout**: `(dashboard)/layout.tsx` switches NAV by `useAuth().role`
- **Role resolution priority** (in `auth-provider.tsx`): `users.role === 'admin'` → admin; else has_brand_row → brand; else has_creator_row → creator. **Never trust session metadata** (goes stale).
- **Role-aware page reuse**: Pages like Settings live ONCE under `/dashboard/` and re-export at role-prefixed URLs:
  ```tsx
  // /creator/settings/page.tsx
  export { default } from "../../dashboard/settings/page";
  ```
- **Sidebar nav rule**: Every `href` in NAV configs MUST point to a real page file
- **Legacy redirects**: `src/config/legacy-redirects.ts` maps `/dashboard/*` → role-prefixed URLs via middleware
- **`ROLE_HOME` map**: `{ admin: "/admin", brand: "/brand/dashboard", creator: "/creator/dashboard" }`

---

## Key Patterns

- **RLS Bypass**: All DB writes from client pages route through API routes using admin client (`createAdminClient() as any` — types are stale, see Known Issues)
- **Supabase queries**: Use `.maybeSingle()` not `.single()` for queries that may return 0 rows
- **Currency**: All money stored in **paise** (1 INR = 100 paise)
- **Background work**: Use Next.js `after()` for fire-and-forget tasks (replaces Inngest)
- **Email**: Wrap `send*` calls in `after()` so the response returns immediately
- **Em-dash literals**: Use actual `—` / `–` chars in JSX, NOT `—` escapes
- **Lucide icons**: `lucide-react` does NOT export `Instagram` — use `AtSign`
- **Framer Motion**: `ease` arrays need `as const` for TypeScript
- **Realtime**: Supabase channel `.on('postgres_changes', { event: 'INSERT', ... })` — don't poll if you have realtime
- **Image upload**: Client-side compress with `compressImageForUpload` before POST (Vercel 4.5MB serverless limit)

---

## Anti-Patterns (DO NOT DO)

1. ❌ **Don't recreate Inngest** — it's dead, deleted in this session. Use `after()`.
2. ❌ **Don't use `.from("campaigns")`** — table renamed to `collab_sessions` in migration 00025
3. ❌ **Don't use `campaign_id`** — column renamed to `collab_session_id`
4. ❌ **Don't use `process.env[name]`** in client code — webpack won't inline it. Use static `process.env.NEXT_PUBLIC_X`.
5. ❌ **Don't add hourly crons** on Vercel Hobby — once per day max, build will fail with "Hobby accounts are limited to daily cron jobs"
6. ❌ **Don't hardcode `bg-white` / `text-[var(--color-ink)]`** — break dark mode. Use canonical tokens (see Design System).
7. ❌ **Don't import from `@/inngest/`** — module deleted
8. ❌ **Don't use Cashfree for new payment work** — being replaced by Razorpay
9. ❌ **Don't skip `as any` cast on `createAdminClient()`** if you query renamed/new tables — Supabase types are stale, build will fail. Pattern:
   ```ts
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const admin = createAdminClient() as any;
   ```
10. ❌ **Don't show Gemini provider name to users** — replace with "Faiceoff AI" in user-facing copy
11. ❌ **Don't show real big-brand names on landing** (Nike, OnePlus, etc.) — use placeholders like "Athleisure Co.", "Tech Co."

---

## Environment Variables

### Currently set in Vercel (verify before launch)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred over ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY

# Gemini (image generation)
GEMINI_API_KEY (or GOOGLE_AI_API_KEY)
NANO_BANANA_MODEL=gemini-3-pro-image-preview  (default in code)
ENABLE_PRODUCT_REFINEMENT=false  (default — flip to true for stage 2)
PROMPT_ASSEMBLER_MODEL=meta-llama/llama-3.1-8b-instruct  (default)
ENABLE_FACE_SIMILARITY=false  (default — flip to true once Replicate model verified)
FACE_EMBED_MODEL_VERSION=<replicate-version-hash>  (needed for face similarity)

# Other AI
OPENROUTER_API_KEY
HIVE_API_KEY
REPLICATE_API_TOKEN

# Storage
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME=faiceoff
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev  (NOT the S3 endpoint)

# Cron
CRON_SECRET=<random>  (for /api/cron/* auth)

# Email
RESEND_API_KEY
EMAIL_FROM=Faiceoff <notifications@faiceoff.com>  (DNS must be verified)

# Cashfree (CURRENT, will swap to Razorpay)
CASHFREE_MODE, CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_WEBHOOK_SECRET, CASHFREE_NODAL_ACCOUNT_ID
KYC_ENCRYPTION_KEY  (hex 32-byte)

# Rate limiter (currently STALE)
UPSTASH_REDIS_REST_URL  ← BROKEN, needs rotation
UPSTASH_REDIS_REST_TOKEN

# Observability (probably not set in prod yet)
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# General
NEXT_PUBLIC_APP_URL=https://faiceoff.com
NEXT_PUBLIC_BASE_URL=https://faiceoff.com  (used for callback URLs + sitemap)
PLATFORM_COMMISSION=0.30  (optional override; default 0.30 = 30%)
```

### Will be added (when user provides)
```
# Razorpay Standard
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET

# RazorpayX (payouts)
RAZORPAYX_KEY_ID
RAZORPAYX_KEY_SECRET
RAZORPAYX_ACCOUNT_NUMBER  (16-digit virtual account)
RAZORPAYX_WEBHOOK_SECRET
```

---

## Build Configuration Notes

### `next.config.ts` has these escape hatches enabled:
```ts
typescript: { ignoreBuildErrors: true }  // stale Supabase types
eslint: { ignoreDuringBuilds: true }
experimental: { serverActions: { bodySizeLimit: "100mb" } }
```

**Remove these** once Supabase types are regenerated. Run:
```bash
npx supabase gen types typescript --project-id jgmhronskdnzqkkimffp > src/types/supabase.ts
```

### `vercel.json` cron schedule
- `/api/cron/auto-approve` runs **daily at 3am UTC** (Hobby tier limit). Switch to hourly (`0 * * * *`) when on Pro.

---

## Pending Work — Detailed Roadmap

### 🔴 TIER 0 — Cannot launch without

#### 1. Razorpay payment swap (4h, blocked on user keys)
**User provides:** 7 keys (see Env Variables section)
**Agent does:**
- Delete `/src/lib/payments/cashfree/`
- Create `/src/lib/payments/razorpay/` with: client.ts, orders.ts, payouts.ts (RazorpayX), webhook.ts
- Replace `/api/credits/top-up/route.ts` to call Razorpay Orders API + return order_id
- Frontend top-up: integrate Razorpay Checkout JS modal (`<script src="https://checkout.razorpay.com/v1/checkout.js">`)
- New `/api/razorpay/webhook/route.ts` — verify HMAC-SHA256 signature with `RAZORPAY_WEBHOOK_SECRET`
- New `/api/razorpay/payout-webhook/route.ts` for RazorpayX
- Wire `/api/withdrawals/[id]` to call RazorpayX payouts API
- Test with ₹10 real transaction

#### 2. Fix `deduct_credit` Postgres RPC
**Issue:** `column "credits" of relation "credit_transactions" does not exist`
**Either:** add the missing column via migration, OR rewrite RPC to match actual schema
**Then:** remove the soft-fail try/catch around `deductCredit` in `run-generation.ts`

#### 3. Rotate Upstash Redis credentials
**User does:** console.upstash.com → rotate REST URL + Token → update Vercel env
**Then:** rate limits become real again (currently fail-open)

### 🟡 TIER 1 — Important

#### 4. Regenerate Supabase types
```bash
npx supabase gen types typescript --project-id jgmhronskdnzqkkimffp > src/types/supabase.ts
```
Then remove `ignoreBuildErrors: true` from `next.config.ts`. Strict TS will catch real bugs going forward.

#### 5. Mobile QA + fixes (3h after user tests)
User tests on phone, screenshots issues. Agent fixes overflow / scroll / touch on:
- Landing page hero
- Brand dashboard sidebar collapse
- Sessions page split layout
- Inbox chat thread

#### 6. Activate face similarity gate (1h)
- Confirm Replicate ArcFace model version hash
- Set `FACE_EMBED_MODEL_VERSION` env var
- Set `ENABLE_FACE_SIMILARITY=true`
- Run 5-10 test gens to calibrate threshold (default 0.55)

#### 7. Email transactional templates — verify DNS
User needs to add 3 DNS records (SPF, DKIM, DMARC) at faiceoff.com DNS provider so Resend can send from `notifications@faiceoff.com`.

### 🟢 TIER 2 — Polish

#### 8. Real analytics dashboards
- Brand: spend/month, top creators, approval rate
- Creator: earnings, gens count, approval-vs-reject ratio
- Use existing `escrow_ledger`, `platform_revenue_ledger`, `generations` for queries

#### 9. KYC verification flow
**User decides:** Manual (free, slow) OR API (Signzy/Karza, ~₹15-50/verify)
Agent wires either path.

#### 10. Legal pages
**User provides:** content via Termly/lawyer
Agent embeds in `/terms`, `/privacy`, `/refund` routes + cookie banner

#### 11. SEO OG image
**User provides:** 1200×630px image
Agent wires into `metadata.openGraph.images`

---

## Common Workflow Recipes

### Add a new role-prefixed page
1. Create the page logic ONCE in `/dashboard/<x>/page.tsx`
2. Wrapper at `/creator/<x>/page.tsx` (or brand): `export { default } from "../../dashboard/<x>/page";`
3. Add to sidebar nav in `config/nav-items.<role>.ts`
4. Update `config/legacy-redirects.ts` if old `/dashboard/<x>` URL needs to redirect

### Add a new API route that touches renamed/new tables
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;  // cast at boundary, types are stale
```

### Add a new transactional email
1. Add template function to `/lib/email/transactional.ts`
2. Wrap call in `after(async () => { await sendXxx(...) })` so response isn't blocked
3. Use static `EMAIL_FROM` env, fall back to default

### Wire a new cron job (Vercel Hobby tier!)
1. Create route at `/api/cron/<name>/route.ts`
2. Add to `vercel.json` `crons` array — schedule MUST be daily-or-less-frequent (e.g. `"0 3 * * *"`)
3. Auth: check `Authorization: Bearer ${process.env.CRON_SECRET}` header
4. Hourly schedules (`0 * * * *`) BREAK BUILDS on Hobby tier

### Track a PostHog event
```ts
import { track } from "@/lib/observability/analytics";
track('event_name', { prop1, prop2 }, user.id);  // fire-and-forget, never blocks
```

---

## Critical Files to Read First (for next agent)

1. `src/lib/ai/run-generation.ts` — generation pipeline orchestrator
2. `src/lib/ai/gemini-client.ts` — Gemini wrapper + book-end anchor prompt
3. `src/lib/ai/prompt-assembler.ts` — system prompt for brief assembly
4. `src/app/api/campaigns/create/route.ts` — campaign creation entry point
5. `src/app/api/approvals/[id]/approve/route.ts` — canonical creator approval (with license + emails)
6. `src/components/chat/chat-inbox.tsx` — chat UI (realtime via Supabase channels)
7. `src/lib/email/transactional.ts` — all email templates
8. `next.config.ts` — knows about TS escape hatch
9. `vercel.json` — cron config (Hobby tier limits!)
10. `supabase/migrations/00039_brand_review_gate.sql` + `00040_brand_creator_chat.sql` — most recent migrations

---

## Recent Git History (last session, ~30 commits)

Major themes:
- Money flow (deductCredit, reserveWallet, spendWallet, escrow, refund)
- Brand review gate (status: ready_for_brand_review)
- Brand-creator chat (realtime, optimistic, read receipts)
- Email transactional templates (4 wired)
- 48h auto-approve cron
- Compliance vector check actually wired in pipeline
- Gemini 3 Pro single-stage default
- EXIF metadata embed
- Face similarity skeleton
- Vault bulk download
- Image upload compression
- Inngest dead code removal
- Stale `campaign_id` cleanup (6 routes)
- Rate limiter fail-open
- Realism upgrade (anti-snapshot → ultra-realistic 8K)
- TypeScript build escape hatch (stale Supabase types)
- Static env access fix in supabase/client.ts (was breaking client bundles)
- Hobby tier cron schedule fix (daily not hourly)

Latest commit at session end: `0ffd50f` (billing soft-fail) — see `git log --oneline -30`.

---

## Final Notes for Incoming Agent

- The user (Pranav) speaks **Hinglish** — match the register, be terse, no fluff
- He moves fast — don't over-explain; ship code, then explain in 2 sentences
- He gets frustrated with status-only responses — always do the actual work, then summarize
- He's currently on Vercel **Hobby tier** — keep this in mind for cron schedules + build limits
- Email: marketing@rectangled.io / pranavchhipa01@gmail.com
- Test creator account being used: "Burfirani Benya" (visible in some screenshots)
- Test brand account: rectangled.io
- Test funds seeded: ₹10L wallet + 1000 credits (via `scripts/seed-test-funds.sql`)
- `.claude/`, `.superpowers/`, `docs/superpowers/` — past brainstorm + plan documents, useful for context
