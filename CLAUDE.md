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
│   ├── (auth)/           # Login, signup (creator/brand), OTP verify
│   ├── (dashboard)/      # All authenticated pages
│   │   └── dashboard/
│   │       ├── approvals/    # Creator approval queue
│   │       ├── campaigns/    # Brand campaigns (list, detail, create)
│   │       ├── creators/     # Discover creators (brand view)
│   │       ├── generations/  # Generation detail view
│   │       ├── onboarding/   # 9-step creator onboarding
│   │       ├── settings/     # Profile settings
│   │       ├── wallet/       # Balance, top-up, transactions
│   │       └── brand-setup/  # Brand verification
│   ├── (marketing)/      # Landing page, public pages
│   └── api/              # API routes
│       ├── auth/         # sign-up, sign-in, verify-otp, sign-out
│       ├── credits/      # top-up (Cashfree Collect), balance
│       ├── cashfree/     # webhook receiver
│       ├── generations/  # create, [id]/approve
│       ├── onboarding/   # 8 routes (save-*, get-*, update-step, complete)
│       ├── wallet/       # transactions (historical archive reader)
│       ├── health/       # Health check
│       └── inngest/      # Inngest webhook handler
├── components/
│   ├── providers/        # Auth, theme, root providers
│   └── ui/               # shadcn/ui components (button, card, input, etc.)
├── config/               # navigation.ts, site.ts
├── domains/              # Business logic types & Zod schemas
│   ├── approval/         # Approval status, workflow types
│   ├── audit/            # Audit log event types
│   ├── catalog/          # Categories, subcategories
│   ├── compliance/       # 4-layer compliance check types
│   ├── generation/       # Generation status, structured brief
│   ├── identity/         # User, Creator, Brand, KYC, OnboardingStep
│   └── wallet/           # Transaction types, dispute status
├── inngest/              # Event-driven pipeline
│   ├── client.ts         # Inngest client config
│   ├── index.ts          # Function registry
│   └── functions/generation/generation-pipeline.ts  # 3 functions
├── lib/
│   ├── ai/               # replicate, openrouter, hive clients
│   ├── payments/         # cashfree/ (client, collect, payouts, kyc, nodal, webhook)
│   ├── storage/          # Cloudflare R2 client
│   ├── redis/            # Upstash client, rate limiter
│   ├── supabase/         # client.ts, server.ts, admin.ts, middleware.ts
│   ├── observability/    # sentry.ts, posthog.ts
│   └── utils/            # cn, errors, format-currency, invariant, result
├── proxy.ts              # Middleware (session refresh, route guards)
└── types/supabase.ts     # Database types

supabase/migrations/      # 12 migration files (users → audit_log)
scripts/                  # Migration runner
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

## Key Patterns
- **RLS Bypass**: All DB writes from client pages go through API routes using admin client
- **Supabase queries**: Use `.maybeSingle()` not `.single()` for queries that may return 0 rows
- **Inngest v4**: `createFunction` takes 2 args, uses `triggers: [{ event: "..." }]`
- **Framer Motion**: `ease` arrays need `as const` for TypeScript
- **Icons**: `lucide-react` does NOT export `Instagram` — use `AtSign` instead
- **Currency**: All money stored in paise (1 INR = 100 paise)

## Environment Variables
See `.env.example` for full list. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CASHFREE_MODE`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_NODAL_ACCOUNT_ID`
- `KYC_ENCRYPTION_KEY` (hex-encoded 32-byte key for PAN/Aadhaar/bank account encryption)
- `REPLICATE_API_TOKEN`, `OPENROUTER_API_KEY`, `HIVE_API_KEY`
- `R2_*` (Cloudflare), `UPSTASH_REDIS_*`, `RESEND_API_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`
