@AGENTS.md

# Faiceoff — AI Likeness Licensing Marketplace (India)

## What is Faiceoff?
Two-sided marketplace where **creators/influencers license their face** and **brands generate AI content** using that licensed likeness. Every generation is tracked, consented, and paid fairly. Built for India (INR, DPDP Act compliance, Cashfree credits + payouts).

## Tech Stack
- **Framework**: Next.js 16 App Router (React 19)
- **Database**: Supabase PostgreSQL + pgvector (1536-dim embeddings)
- **Auth**: Supabase Auth with email OTP (8-digit, via Resend SMTP)
- **Payments**: Cashfree (Collect for brand credit top-ups, Payouts for creator settlements, INR)
- **AI Pipeline**: Replicate (LoRA training + image gen), OpenRouter (LLM prompt assembly), Hive (content moderation)
- **Storage**: Cloudflare R2 (S3-compatible CDN)
- **Task Orchestration**: Inngest v4 (event-driven pipeline)
- **Rate Limiting**: Upstash Redis
- **Observability**: Sentry (errors), PostHog (analytics)
- **Email**: Resend (SMTP provider for Supabase Auth)
- **Styling**: Tailwind CSS v4, Framer Motion 12, shadcn/ui components
- **Testing**: Vitest, Playwright, MSW

## Design System — "Hybrid Soft Luxe v2"
- **Fonts**: Outfit (display, 500-800 weight), Plus Jakarta Sans (body, 400-600), JetBrains Mono (code)
- **NEVER use italic fonts** — bold geometric sans only
- **Colors**:
  - Paper (bg): `#fdfbf7` | Ink (text): `#1a1513` | Gold (accent): `#c9a96e`
  - Blush (creator): `#f6dfe0` | Ocean (brand): `#d9e5f0`
  - Lilac (generation): `#e2dcef` | Mint (approval): `#daece0`
- **Radius**: card `1rem`, button `0.625rem`, pill `9999px`, input `0.5rem`
- **Shadows**: soft, card, elevated (see globals.css for exact values)
- **CSS vars**: All colors/spacing/radius available as `var(--color-*)`, `var(--radius-*)`, `var(--shadow-*)`

## Project Structure
```
src/
├── app/
│   ├── (auth)/                # Login, signup (creator/brand), OTP verify, forgot/reset
│   ├── (dashboard)/           # All authenticated pages — single sidebar layout in layout.tsx
│   │   ├── layout.tsx         # Sidebar + topbar + role-based nav (CREATOR_NAV / BRAND_NAV / ADMIN_NAV)
│   │   ├── dashboard/         # LEGACY role-aware pages — kept because the underlying components
│   │   │   │                  # are still role-aware (settings, approvals, likeness, analytics,
│   │   │   │                  # campaigns). Role-prefixed wrappers under /creator and /brand
│   │   │   │                  # re-export these. Onboarding still lives here untouched.
│   │   │   ├── approvals/     # Creator approval queue (48h window)
│   │   │   ├── analytics/     # Creator analytics
│   │   │   ├── campaigns/     # Brand campaigns / creator collaborations (role-aware)
│   │   │   ├── creators/      # Discover creators (brand view) — superseded by /brand/discover
│   │   │   ├── generations/   # Generation detail view
│   │   │   ├── likeness/      # Creator reference photos / likeness mgmt
│   │   │   ├── onboarding/    # 9-step creator onboarding (still active here)
│   │   │   ├── settings/      # Role-aware profile settings (creator + brand fields)
│   │   │   ├── wallet/        # Legacy wallet view
│   │   │   └── brand-setup/   # Brand verification (still active here)
│   │   ├── admin/             # Admin section
│   │   │   ├── page.tsx       # Overview hub (8 tiles, 3 live)
│   │   │   ├── dashboard/     # Alias → redirects to /admin
│   │   │   ├── packs/         # Credit pack mgmt
│   │   │   ├── safety/        # Content safety review
│   │   │   └── stuck-gens/    # Stuck generation triage
│   │   ├── brand/             # Brand-specific pages
│   │   │   ├── dashboard/     # Wraps /dashboard/page (role-aware home)
│   │   │   ├── billing/       # Billing & invoices
│   │   │   ├── credits/       # Top-up wallet (Cashfree Collect)
│   │   │   ├── discover/      # Discover creators (+ [creatorId] detail)
│   │   │   ├── licenses/      # Licenses (+ [id] detail)
│   │   │   ├── sessions/      # Brand campaigns/sessions (+ [id] detail)
│   │   │   ├── settings/      # Wraps /dashboard/settings
│   │   │   ├── vault/         # Vault grid (delivered creatives)
│   │   │   └── wallet/        # Brand wallet
│   │   └── creator/           # Creator-specific pages
│   │       ├── dashboard/     # Wraps /dashboard/page
│   │       ├── analytics/     # Wraps /dashboard/analytics
│   │       ├── approvals/     # Wraps /dashboard/approvals
│   │       ├── blocked-categories/
│   │       ├── collaborations/# Wraps /dashboard/campaigns (creator side)
│   │       ├── earnings/      # Earnings cards
│   │       ├── licenses/      # Creator licenses view
│   │       ├── likeness/      # Wraps /dashboard/likeness
│   │       ├── payouts/       # Payout history
│   │       ├── settings/      # Wraps /dashboard/settings
│   │       └── withdraw/      # Withdraw wizard
│   ├── (marketing)/           # Landing, /for-brands, /for-creators, /pricing, /verify/[license_id]
│   └── api/                   # API routes
│       ├── auth/              # sign-up, sign-in, verify-otp, sign-out, delete-account
│       ├── credits/           # top-up (Cashfree Collect), balance
│       ├── cashfree/          # webhook receiver
│       ├── creator/           # likeness-data, approvals (admin-client RLS bypass)
│       ├── generations/       # create, [id]/approve
│       ├── onboarding/        # 8 routes (save-*, get-*, update-step, complete)
│       ├── settings/          # GET/PUT profile, avatar upload
│       ├── vault/             # vault list, [id], [id]/download
│       ├── wallet/            # transactions (historical archive reader)
│       ├── webhooks/          # Cashfree + Replicate
│       ├── whoami/            # Role/profile resolver used by auth-provider
│       ├── withdrawals/       # create, list, [id]
│       ├── health/            # Health check
│       └── inngest/           # Inngest webhook handler
├── components/
│   ├── providers/             # Auth, theme, root providers
│   └── ui/                    # shadcn/ui components (button, card, input, etc.)
├── config/
│   ├── navigation.ts
│   ├── routes.ts              # Role type + ROLE_HOME map
│   ├── site.ts
│   └── legacy-redirects.ts    # Maps /dashboard/* legacy paths → role-prefixed routes
├── domains/                   # Business logic types & Zod schemas
│   ├── approval/              # Approval status, workflow types
│   ├── audit/                 # Audit log event types
│   ├── catalog/               # Categories, subcategories
│   ├── compliance/            # 4-layer compliance check types
│   ├── generation/            # Generation status, structured brief
│   ├── identity/              # User, Creator, Brand, KYC, OnboardingStep
│   └── wallet/                # Transaction types, dispute status
├── inngest/                   # Event-driven pipeline
│   ├── client.ts
│   ├── index.ts               # Function registry
│   └── functions/generation/generation-pipeline.ts
├── lib/
│   ├── ai/                    # replicate, openrouter, hive, pipeline-router
│   ├── payments/              # cashfree/ (client, collect, payouts, kyc, nodal, webhook)
│   ├── storage/               # Cloudflare R2 client
│   ├── redis/                 # Upstash client, rate limiter
│   ├── supabase/              # client.ts, server.ts, admin.ts, middleware.ts
│   ├── observability/         # sentry.ts, posthog.ts
│   └── utils/                 # cn, errors, format-currency, invariant, result
├── proxy.ts                   # Middleware (session refresh, route guards, legacy redirects)
└── types/supabase.ts          # Database types

supabase/migrations/           # Migration files (users → audit_log → money ledgers)
scripts/                       # Migration runner
```

## Database Tables (12)
1. `users` — id, email, phone, role (creator/brand/admin), display_name, avatar_url
2. `creators` — user_id, instagram_handle, bio, kyc_status, onboarding_step (9 steps), is_active, dpdp_consent
3. `brands` — user_id, company_name, gst_number, website_url, industry, is_verified
4. `categories` — creator_id, category, subcategories[], price_per_generation_paise
5. `compliance_vectors` — creator_id, blocked_concept, embedding (1536-dim pgvector)
6. `reference_photos` — creator_id, storage_path, face_embedding (512-dim)
7. `lora_models` — creator_id, replicate_model_id, training_status, creator_approved
8. `campaigns` — brand_id, creator_id, budget_paise, spent_paise, status
9. `generations` — campaign_id, structured_brief (JSONB), status (7 states), image_url, delivery_url
10. `approvals` — generation_id, status, feedback, expires_at (48h)
11. `wallet_transactions_archive` — legacy ledger (renamed + sealed in migration 00027). Read-only historical data.
12. `disputes` — generation_id, raised_by, status, resolution_notes

**New money ledgers (post Chunk C, migrations 00020-00023):**
- `credit_top_ups` — Cashfree top-up order lifecycle (initiated/processing/success/failed)
- `credit_transactions` — brand credit movements (topup/escrow_lock/escrow_release/refund)
- `brands.credits_balance_paise` + `credits_reserved_paise` — running brand credit balance
- `escrow_ledger` — creator-held escrow pending payout
- `platform_revenue_ledger` — commission + GST recognition
- `gst_output_ledger` / `tcs_ledger` / `tds_ledger` — statutory tax ledgers
- `webhook_events` — idempotent Cashfree webhook audit log

## Generation Pipeline (Inngest)
`generation/created` event triggers 5-step pipeline:
1. **Compliance Check** — pgvector similarity against creator's blocked concepts
2. **Prompt Assembly** — OpenRouter LLM builds natural language from structured_brief
3. **Image Generation** — Replicate with creator's LoRA model
4. **Output Safety** — Hive content moderation
5. **Create Approval** — 48-hour expiry for creator review

`generation/approved` → credit creator wallet, debit brand wallet, upload to R2
`generation/rejected` → audit log entry

## Auth Flow
1. Sign up → Supabase creates user + sends 8-digit OTP via Resend SMTP
2. Verify OTP → upserts public.users + creators/brands table row
3. Session managed via proxy.ts middleware (token refresh on every request)
4. Admin client (`createAdminClient()`) bypasses RLS for server-side operations

## Routing & Role-Based Pages
- **Three role spaces**: `/admin/*`, `/brand/*`, `/creator/*` — each with its own sidebar.
  Single `(dashboard)/layout.tsx` switches `CREATOR_NAV / BRAND_NAV / ADMIN_NAV` based
  on the DB-resolved role from `useAuth()`.
- **Role resolution priority** (in `auth-provider.tsx`): `public_users_row.role === "admin"`
  → admin; else `has_brand_row` → brand; else `has_creator_row` → creator. Never trust
  session metadata — it goes stale and causes role-flash.
- **Role-aware page reuse**: Several pages (Settings, Approvals, Likeness, Analytics,
  Collaborations) are role-aware and live ONCE under `/dashboard/*`. They're mounted
  at role-prefixed URLs via thin **re-export wrappers**:
  ```tsx
  // src/app/(dashboard)/creator/settings/page.tsx
  export { default } from "../../dashboard/settings/page";
  ```
  This keeps URLs role-prefixed (clean sidebar links) without duplicating page logic.
- **Sidebar nav rule**: Every `href` in `CREATOR_NAV / BRAND_NAV / ADMIN_NAV` MUST point
  to a page file that actually exists. Add a wrapper before adding a sidebar entry.
- **Legacy redirects**: `src/config/legacy-redirects.ts` maps old `/dashboard/*` URLs
  (bookmarks, external links) to new role-prefixed routes. Middleware (`proxy.ts`)
  applies these. Update this map whenever you add or rename a role-prefixed page.
- **`ROLE_HOME` map** (in `config/routes.ts`):
  `{ admin: "/admin", brand: "/brand/dashboard", creator: "/creator/dashboard" }` —
  used by login redirect + sidebar logo link.

## Key Patterns
- **RLS Bypass**: All DB writes from client pages go through API routes using admin client
- **Supabase queries**: Use `.maybeSingle()` not `.single()` for queries that may return 0 rows
- **Inngest v4**: `createFunction` takes 2 args, uses `triggers: [{ event: "..." }]`
- **Framer Motion**: `ease` arrays need `as const` for TypeScript
- **Icons**: `lucide-react` does NOT export `Instagram` — use `AtSign` instead
- **Currency**: All money stored in paise (1 INR = 100 paise)
- **Role-prefixed wrappers**: When a `/dashboard/<x>` page is role-aware, mount it at
  `/creator/<x>` and/or `/brand/<x>` via `export { default } from "../../dashboard/<x>/page"`
  — don't fork the page. Wire the new URL into the sidebar nav AND the legacy redirect map.
- **Em-dash literals**: Use the actual `—` / `–` characters in JSX strings, NOT `\u2014`
  escapes — the escapes don't get interpreted in some build configs and render literally.

## Environment Variables
See `.env.example` for full list. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CASHFREE_MODE`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_NODAL_ACCOUNT_ID`
- `KYC_ENCRYPTION_KEY` (hex-encoded 32-byte key for PAN/Aadhaar/bank account encryption)
- `REPLICATE_API_TOKEN`, `OPENROUTER_API_KEY`, `HIVE_API_KEY`
- `R2_*` (Cloudflare), `UPSTASH_REDIS_*`, `RESEND_API_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`
