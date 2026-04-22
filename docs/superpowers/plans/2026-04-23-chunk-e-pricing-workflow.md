# Chunk E: Pricing & Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build the two-layer billing system (credits + wallet ₹), license certificate system, on-demand creator payouts, brand vault with multi-format downloads, and replace Inngest with direct Replicate webhooks + pg_cron + Vercel Cron.

**Architecture:** Three-layer money model (credits → wallet → escrow). New `BillingService`, `LicenseService`, `PayoutService` libraries. New screens under `/brand/{credits,wallet,vault,licenses,billing}` and `/creator/{earnings,withdraw,payouts,blocked-categories}` and `/admin/{packs,safety,stuck-gens}` and `/pricing` (public) and `/verify/[id]` (public).

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + pgvector, Cashfree (Collect + Payouts), Replicate webhooks, Hive moderation, Cloudflare R2, Upstash Redis, `@react-pdf/renderer`, `qrcode`, Framer Motion, Tailwind v4, shadcn/ui (already installed in Chunk B).

**Spec reference:** `docs/superpowers/specs/2026-04-23-pricing-workflow-redesign-design.md` — read for any decisions/details not in this plan.

---

## Phase 1 — Database Foundation (must complete before any other phase)

### Task E1: Migration 00032 — schema for two-layer billing

**Files:**
- Create: `supabase/migrations/00032_two_layer_billing.sql`

- [ ] **Step 1: Write migration**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Chunk E: Two-layer billing (credits + wallet INR), licenses, payouts
-- Ref spec: docs/superpowers/specs/2026-04-23-pricing-workflow-redesign-design.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Modify brands: add credits layer, rename wallet fields ────────────
ALTER TABLE public.brands
  ADD COLUMN credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN credits_lifetime_purchased integer NOT NULL DEFAULT 0;

ALTER TABLE public.brands
  RENAME COLUMN credits_balance_paise TO wallet_balance_paise;
ALTER TABLE public.brands
  RENAME COLUMN credits_reserved_paise TO wallet_reserved_paise;

-- ── 2. Modify credit_top_ups: new pack enum + bonus tracking ──────────────
ALTER TABLE public.credit_top_ups DROP CONSTRAINT IF EXISTS credit_top_ups_pack_check;
ALTER TABLE public.credit_top_ups
  ADD CONSTRAINT credit_top_ups_pack_check
  CHECK (pack IN ('free_signup','spark','flow','pro','studio','enterprise','small','medium','large'));
-- (legacy pack names kept in CHECK for backfill compatibility — drop later in 00034)

ALTER TABLE public.credit_top_ups
  ADD COLUMN credits_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN bonus_credits integer NOT NULL DEFAULT 0;

-- ── 3. credit_packs_catalog ──────────────────────────────────────────────
CREATE TABLE public.credit_packs_catalog (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text UNIQUE NOT NULL CHECK (code IN ('free_signup','spark','flow','pro','studio','enterprise')),
  display_name text NOT NULL,
  credits integer NOT NULL,
  bonus_credits integer NOT NULL DEFAULT 0,
  price_paise integer NOT NULL,
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  marketing_tagline text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_packs_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active packs" ON public.credit_packs_catalog
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins write packs" ON public.credit_packs_catalog
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ── 4. wallet_top_ups ────────────────────────────────────────────────────
CREATE TABLE public.wallet_top_ups (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL,
  bonus_paise integer NOT NULL DEFAULT 0,
  cf_order_id text UNIQUE,
  cf_payment_id text,
  status text NOT NULL CHECK (status IN ('initiated','processing','success','failed','expired')) DEFAULT 'initiated',
  failure_reason text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wtu_brand_created ON public.wallet_top_ups(brand_id, created_at DESC);

ALTER TABLE public.wallet_top_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands read own wallet topups" ON public.wallet_top_ups
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));
CREATE POLICY "Admins read all wallet topups" ON public.wallet_top_ups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ── 5. wallet_transactions ───────────────────────────────────────────────
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup','reserve','release_reserve','spend','refund','bonus','adjustment','withdraw')),
  amount_paise integer NOT NULL,
  balance_after_paise integer NOT NULL,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_walltx_brand_created ON public.wallet_transactions(brand_id, created_at DESC);
CREATE INDEX idx_walltx_ref ON public.wallet_transactions(reference_type, reference_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands read own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));
CREATE POLICY "Admins read all wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ── 6. licenses ──────────────────────────────────────────────────────────
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  generation_id uuid NOT NULL UNIQUE REFERENCES public.generations(id),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  scope text NOT NULL CHECK (scope IN ('digital','digital_print','digital_print_packaging')),
  is_category_exclusive boolean NOT NULL DEFAULT false,
  exclusive_category text,
  exclusive_until timestamptz,
  amount_paid_paise integer NOT NULL,
  creator_share_paise integer NOT NULL,
  platform_share_paise integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true,
  renewed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('active','expired','revoked')) DEFAULT 'active',
  revoked_at timestamptz,
  revocation_reason text,
  cert_url text,
  cert_signature_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_licenses_brand ON public.licenses(brand_id, expires_at);
CREATE INDEX idx_licenses_creator ON public.licenses(creator_id, expires_at);
CREATE INDEX idx_licenses_status_expiry ON public.licenses(status, expires_at);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands read own licenses" ON public.licenses
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));
CREATE POLICY "Creators read own licenses" ON public.licenses
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));
CREATE POLICY "Public read for verify (limited cols)" ON public.licenses
  FOR SELECT USING (true);  -- restrict columns at API layer
CREATE POLICY "Admins all licenses" ON public.licenses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ── 7. creator_blocked_categories ────────────────────────────────────────
CREATE TABLE public.creator_blocked_categories (
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('alcohol','tobacco','gambling','political','religious','adult','gun','crypto','drugs')),
  blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, category)
);
ALTER TABLE public.creator_blocked_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators manage own blocks" ON public.creator_blocked_categories
  FOR ALL USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));
CREATE POLICY "Public reads blocks (for compliance check)" ON public.creator_blocked_categories
  FOR SELECT USING (true);

-- ── 8. creator_payouts ───────────────────────────────────────────────────
CREATE TABLE public.creator_payouts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  gross_amount_paise integer NOT NULL,
  tds_amount_paise integer NOT NULL,
  processing_fee_paise integer NOT NULL,
  net_amount_paise integer NOT NULL,
  status text NOT NULL CHECK (status IN ('requested','processing','success','failed','reversed')) DEFAULT 'requested',
  cf_transfer_id text UNIQUE,
  bank_account_last4 text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  escrow_ledger_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);
CREATE INDEX idx_payouts_creator ON public.creator_payouts(creator_id, requested_at DESC);
ALTER TABLE public.creator_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators read own payouts" ON public.creator_payouts
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));
CREATE POLICY "Admins all payouts" ON public.creator_payouts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ── 9. Modify generations: license + cert + download tracking ────────────
ALTER TABLE public.generations
  ADD COLUMN license_id uuid REFERENCES public.licenses(id),
  ADD COLUMN cert_url text,
  ADD COLUMN download_count_jsonb jsonb NOT NULL DEFAULT '{"original":0,"pdf":0,"docx":0}'::jsonb;
```

- [ ] **Step 2: Run migration**

```bash
pnpm migrate:up
```

Expected: migration applies cleanly. Verify with `psql` or Supabase studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00032_two_layer_billing.sql
git commit -m "feat(db): two-layer billing schema (credits + wallet + licenses + payouts)"
```

---

### Task E2: Migration 00033 — seed credit packs catalog

**Files:**
- Create: `supabase/migrations/00033_seed_credit_packs.sql`

- [ ] **Step 1: Write seed**

```sql
INSERT INTO public.credit_packs_catalog (code, display_name, credits, bonus_credits, price_paise, is_popular, sort_order, marketing_tagline)
VALUES
  ('free_signup','Free Signup',5,0,0,false,0,'Sign up bonus, no card required'),
  ('spark','Spark',10,0,30000,false,1,'Get started with Faiceoff'),
  ('flow','Flow',50,10,120000,false,2,'Save 33% — for regular use'),
  ('pro','Pro',200,50,450000,true,3,'MOST POPULAR — save 40%'),
  ('studio','Studio',600,200,1200000,false,4,'Agency-grade — save 50%'),
  ('enterprise','Enterprise',2000,800,5000000,false,5,'Talk to us for custom volume')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      credits = EXCLUDED.credits,
      bonus_credits = EXCLUDED.bonus_credits,
      price_paise = EXCLUDED.price_paise,
      is_popular = EXCLUDED.is_popular,
      sort_order = EXCLUDED.sort_order,
      marketing_tagline = EXCLUDED.marketing_tagline,
      updated_at = now();
```

- [ ] **Step 2: Run + commit**

---

### Task E3: Migration 00034 — backfill legacy packs

**Files:**
- Create: `supabase/migrations/00034_backfill_legacy_packs.sql`

```sql
-- Map legacy pack rows to new equivalents
UPDATE public.credit_top_ups SET pack = 'flow', credits_granted = 50, bonus_credits = 10 WHERE pack = 'small';
UPDATE public.credit_top_ups SET pack = 'pro', credits_granted = 200, bonus_credits = 50 WHERE pack = 'medium';
UPDATE public.credit_top_ups SET pack = 'studio', credits_granted = 600, bonus_credits = 200 WHERE pack = 'large';
-- Drop legacy enum values
ALTER TABLE public.credit_top_ups DROP CONSTRAINT credit_top_ups_pack_check;
ALTER TABLE public.credit_top_ups
  ADD CONSTRAINT credit_top_ups_pack_check
  CHECK (pack IN ('free_signup','spark','flow','pro','studio','enterprise'));
```

---

### Task E4: Migration 00035 — billing views + pg_cron jobs

**Files:**
- Create: `supabase/migrations/00035_create_billing_views_and_cron.sql`

```sql
CREATE OR REPLACE VIEW public.v_creator_dashboard AS
SELECT
  c.id AS creator_id,
  COALESCE(SUM(CASE WHEN e.holding_until <= now() AND e.payout_id IS NULL THEN e.amount_paise END), 0)::bigint AS available_paise,
  COALESCE(SUM(CASE WHEN e.holding_until > now() AND e.payout_id IS NULL THEN e.amount_paise END), 0)::bigint AS holding_paise,
  COALESCE((SELECT COUNT(*) FROM public.approvals a JOIN public.generations g ON g.id = a.generation_id WHERE g.creator_id = c.id AND a.status = 'pending'), 0)::bigint AS pending_count,
  COALESCE(SUM(e.amount_paise), 0)::bigint AS lifetime_earned_paise
FROM public.creators c
LEFT JOIN public.escrow_ledger e ON e.creator_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW public.v_brand_billing AS
SELECT
  b.id AS brand_id,
  b.credits_remaining,
  b.credits_lifetime_purchased,
  b.wallet_balance_paise,
  b.wallet_reserved_paise,
  (b.wallet_balance_paise - b.wallet_reserved_paise) AS wallet_available_paise,
  b.lifetime_topup_paise
FROM public.brands b;

-- pg_cron: auto-reject 48h+ pending approvals
CREATE OR REPLACE FUNCTION public.auto_reject_expired_approvals()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  rejected_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.approvals
    SET status = 'auto_rejected',
        feedback = 'Auto-rejected: creator did not respond within 48 hours',
        responded_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '48 hours'
    RETURNING generation_id
  )
  UPDATE public.generations
  SET status = 'rejected',
      updated_at = now()
  WHERE id IN (SELECT generation_id FROM expired);
  GET DIAGNOSTICS rejected_count = ROW_COUNT;
  -- Refund logic invoked via separate trigger or app-level cron-call to /api/cron/process-rejections
  RETURN rejected_count;
END;
$$;

-- Schedule pg_cron (requires pg_cron extension)
SELECT cron.schedule('auto-reject-expired-approvals', '*/15 * * * *', 'SELECT public.auto_reject_expired_approvals();');
```

---

### Task E5: TypeScript types regeneration

- [ ] Run: `pnpm gen:types` (or equivalent command for `src/types/supabase.ts`)
- [ ] Commit regenerated types: `chore(types): regen Supabase types for Chunk E`

---

## Phase 2 — Service Layer (depends on Phase 1)

### Task E6: BillingService

**Files:**
- Create: `src/lib/billing/credits-service.ts`
- Create: `src/lib/billing/wallet-service.ts`
- Create: `src/lib/billing/pack-catalog.ts`
- Create: `src/lib/billing/pricing-engine.ts`
- Create: `src/lib/billing/__tests__/*.test.ts`

**Acceptance:**
- `addCredits(brandId, packCode, cfPaymentId)` — idempotent insert + atomic update
- `deductCredit(brandId, generationId)` — single credit, throws `INSUFFICIENT_CREDITS`
- `addWallet(brandId, amountPaise, bonusPaise, cfPaymentId)` — idempotent
- `reserveWallet(brandId, amountPaise, generationId)` — `SELECT FOR UPDATE`
- `spendWallet(brandId, amountPaise, generationId)` — converts reserve → spent
- `refundWallet(brandId, amountPaise, generationId)` — releases reserve back
- `getActivePacks()` — reads from `credit_packs_catalog`
- `computeRate(creatorRate, scope, isExclusive)` — returns paise breakdown `{total, creator_share, platform_share, gst_owed}`

All ops in single Postgres transaction. Use `createAdminClient()` from `lib/supabase/admin.ts`.

---

### Task E7: LicenseService + cert PDF generation

**Files:**
- Create: `src/lib/licenses/license-service.ts` — issue/renew/revoke/list
- Create: `src/lib/licenses/cert-pdf.ts` — `@react-pdf/renderer`
- Create: `src/lib/licenses/cert-storage.ts` — R2 upload
- Create: `src/lib/licenses/verify.ts` — public verify shape
- Install dep: `pnpm add @react-pdf/renderer qrcode`
- Install dep: `pnpm add -D @types/qrcode`

**Acceptance:**
- `issueLicense(generation, scope, exclusivity)` — creates row, generates PDF, uploads R2, returns license + cert_url
- `renewLicense(licenseId)` — extends 12mo, charges wallet, increments renewed_count
- `revokeLicense(licenseId, reason)` — sets status=revoked, notifies brand
- `getPublicLicenseStatus(licenseId)` — returns no-PII public response
- PDF includes QR code (qrcode npm) → `https://faiceoff.in/verify/{license_id}`

---

### Task E8: PayoutService + Cashfree adapter

**Files:**
- Create: `src/lib/payouts/payout-service.ts`
- Create: `src/lib/payouts/cashfree-payout-adapter.ts`
- Modify: `src/lib/payments/cashfree/payouts.ts` — extend if needed
- Tests: `src/lib/payouts/__tests__/`

**Acceptance:**
- `requestPayout(creatorId, amountPaise)` — checks min ₹500, KYC done, computes TDS+fee, locks escrow rows, submits Cashfree
- `computeTDS(amountPaise)` — 1% of gross
- `computeProcessingFee()` — flat ₹25 per request
- `handlePayoutWebhook(event)` — updates status, releases/locks escrow on success/fail

---

### Task E9: Compliance + anti-fraud + vault libraries

**Files:**
- Create: `src/lib/compliance/three-layer-check.ts` (extract from inngest pipeline)
- Create: `src/lib/compliance/category-mapping.ts`
- Create: `src/lib/anti-fraud/signals.ts`
- Create: `src/lib/anti-fraud/rate-limiter.ts` (Upstash)
- Create: `src/lib/vault/vault-service.ts`
- Create: `src/lib/vault/download-formats.ts` — PDF + DOCX gen
- Install dep: `pnpm add docx jszip`

---

## Phase 3 — API Routes (depends on Phase 2)

### Task E10: Brand billing APIs

- `POST /api/credits/top-up` — Cashfree order init for credit pack
- `POST /api/wallet/top-up` — Cashfree order init for wallet ₹
- `GET /api/billing/balance` — read v_brand_billing

### Task E11: Generation flow rewrite (CRITICAL)

- `POST /api/generations/create` — full rewrite using two-layer billing, sync compliance, async Replicate
- `POST /api/webhooks/replicate` — signature-verified, runs Hive, creates approval

### Task E12: Approval flow extension

- `POST /api/approvals/[id]/approve` — extend to: spend wallet, escrow insert, issue license, generate cert PDF
- `POST /api/approvals/[id]/reject` — extend to: refund wallet (credit stays gone)

### Task E13: Vault APIs

- `GET /api/vault` — paginated list with status filter
- `GET /api/vault/[id]/download?format=original|pdf|docx` — increments download_count_jsonb
- `GET /api/vault/[id]` — detail

### Task E14: License APIs

- `GET /api/licenses/list` — brand-scoped
- `GET /api/licenses/[id]` — detail
- `GET /api/licenses/[id]/certificate` — stream PDF
- `POST /api/licenses/[id]/auto-renew` — toggle
- `POST /api/licenses/[id]/revoke` — creator-only
- `GET /verify/[license_id]` — public, returns no-PII status

### Task E15: Creator earnings + payout APIs

- `GET /api/earnings/dashboard` — reads v_creator_dashboard
- `POST /api/payouts/request` — withdrawal request
- `GET /api/payouts/list` — history
- `POST /api/cashfree/payout-webhook` — payout status updates

### Task E16: Creator blocked categories APIs

- `GET /api/creator/blocked-categories`
- `POST /api/creator/blocked-categories`
- `DELETE /api/creator/blocked-categories/[category]`

### Task E17: Admin APIs

- `GET/POST/PATCH/DELETE /api/admin/packs` — pack catalog CRUD
- `GET /api/admin/safety/queue`
- `POST /api/admin/safety/[id]/{approve,reject}`
- `GET /api/admin/stuck-gens`
- `POST /api/admin/stuck-gens/[id]/{retry,refund}`

### Task E18: Cron endpoints

- `GET /api/cron/license-renewals` — daily
- `GET /api/cron/tds-quarterly-reminder` — daily
- `GET /api/cron/poll-replicate` — every 15 min (fallback for missed webhooks)
- `GET /api/cron/process-rejections` — process rows marked `auto_rejected` (refund wallet)
- Add `vercel.json` with cron config

### Task E19: Cashfree webhook routing modification

- Modify: `src/app/api/cashfree/webhook/route.ts` — route by reference_type to credit_top_up / wallet_top_up / payout handlers

---

## Phase 4 — Brand UI (depends on Phase 3)

### Task E20: Public pricing page (`/pricing`)
- Marketing-grade, 5 packs side-by-side cards, "MOST POPULAR" badge, FAQ section, CTA → signup

### Task E21: `/brand/credits` — pack selection
- Card grid using `getActivePacks()`, click → Cashfree checkout via `/api/credits/top-up`

### Task E22: `/brand/wallet` — ₹ top-up
- Amount slider with bonus calculator (live), checkout via `/api/wallet/top-up`

### Task E23: `/brand/billing` — overview
- Credits + wallet snapshot, lifetime stats, recent transactions list

### Task E24: `/brand/vault` — image vault
- Grid (masonry), filter pills (All/Approved/Pending/Rejected), search bar
- Click image → modal with 3 download buttons (Original ZIP / PDF / DOCX)
- Hover → quick actions (download default, view license, view brief)

### Task E25: `/brand/licenses` — license dashboard
- List of all licenses with expiry warnings (color-coded: green >90d, yellow 30-90d, red <30d)
- Filters: Active / Expired / Revoked
- Click → `/brand/licenses/[id]` with embedded PDF viewer + auto-renew toggle

### Task E26: `/brand/sessions/[id]` — live status
- Polls `GET /api/sessions/[id]` every 3s
- States: pending_compliance → pending_replicate → pending_safety → pending_approval (with countdown) → approved/rejected
- Animated progress bar via Framer Motion

### Task E27: Generation sheet modal — pill-based brief
- Modal/sheet that opens from creator profile
- Pill inputs: Product / Scene / Mood / Aesthetic
- Scope toggle (digital / +print +₹500 / +packaging +₹1000)
- Exclusivity toggle (+50%)
- Live price calculator (pulses when changed)
- "Generate" CTA with credit + wallet check

---

## Phase 5 — Creator UI (parallel with Phase 4)

### Task E28: `/creator/earnings` — 4-pot dashboard
- 4 stat cards (Available / Holding / Pending / Lifetime) with count-up animation
- "Withdraw Available" CTA → `/creator/withdraw`

### Task E29: `/creator/withdraw` — request flow
- Step 1: amount slider (min ₹500, max = available)
- Step 2: confirm bank account (last4 shown)
- Step 3: review + submit → POST `/api/payouts/request`
- Success: shows "Processing in 24-48h" + redirect to `/creator/payouts`

### Task E30: `/creator/payouts` — history
- Table with status pills (Requested / Processing / Success / Failed)
- TDS breakdown per row

### Task E31: `/creator/blocked-categories` — management
- Checkbox grid for 9 categories
- Save → POST per change
- Note: "Brands cannot generate content matching your blocked categories"

### Task E32: `/creator/licenses` — active licenses + revoke
- List of licenses where this creator is the licensor
- Revoke button → confirmation modal with reason picker → POST `/api/licenses/[id]/revoke`

---

## Phase 6 — Admin + Public (parallel with Phase 4-5)

### Task E33: `/admin/packs` — catalog CRUD
- Table with edit/delete inline, add new pack form

### Task E34: `/admin/safety` — Hive review queue
- Image cards with category scores, approve/reject buttons

### Task E35: `/admin/stuck-gens` — fallback queue
- List of gens stuck >5 min in processing, retry/refund buttons

### Task E36: `/verify/[license_id]` — public verification
- Single page, shows status badge + brand/creator names + scope + dates
- No login, no PII

### Task E37: Landing page hero update
- Add "5 free credits, no card needed" CTA on `/`

---

## Phase 7 — Inngest Removal + Cron Wiring

### Task E38: Delete Inngest infrastructure
- Delete `src/inngest/` directory entirely
- Delete `src/app/api/inngest/route.ts`
- Remove `inngest` from `package.json`
- Run `pnpm install`
- Verify: `pnpm tsc --noEmit` clean
- Verify: `pnpm test` clean (no Inngest test left)

### Task E39: Wire Vercel Cron
- Create/update `vercel.json` with cron entries:
  - `/api/cron/license-renewals` daily at `30 18 * * *` (00:00 IST = 18:30 UTC)
  - `/api/cron/tds-quarterly-reminder` daily at `30 18 * * *`
  - `/api/cron/poll-replicate` every 15 min `*/15 * * * *`
  - `/api/cron/process-rejections` every 15 min `*/15 * * * *`

---

## Phase 8 — Verification + Status Note

### Task E40: Run full test suite + typecheck
- `pnpm tsc --noEmit`
- `pnpm test`
- `pnpm next build`

### Task E41: Write night-run status report
- Create `docs/superpowers/NIGHT_RUN_STATUS.md` with:
  - What's complete (per phase + per task)
  - What's pending
  - Any blockers / open questions
  - Next steps for morning session

---

## Notes for Subagent Dispatching

**Parallel dispatch opportunities:**
- Phase 1 tasks E1-E5 are sequential (DB schema must apply in order)
- Phase 2 tasks E6-E9 can run in parallel (different file paths, all read from new schema)
- Phase 3 tasks E10-E18 — dispatch in groups of 3-4 parallel (different routes, no shared files)
- Phase 4 tasks E20-E27 — all independent files, max parallelism
- Phase 5 tasks E28-E32 — all independent files, max parallelism
- Phase 6 tasks E33-E37 — all independent files, max parallelism
- Phase 7 must be last (depends on all routes existing)

**Model selection:**
- Mechanical migration tasks (E1-E5): cheap model (sonnet)
- Service layer with logic (E6-E9): standard model (sonnet)
- API routes (E10-E18): standard model
- UI screens (E20-E37): standard model with design taste
- Final verify (E38-E41): standard model

**Pre-existing infrastructure to consume:**
- `src/lib/supabase/admin.ts` — use `createAdminClient()` for service-layer DB writes
- `src/lib/payments/cashfree/*` — use existing collect/payouts clients
- `src/lib/storage/*` — R2 client for cert PDFs and image storage
- `src/lib/redis/*` — Upstash for rate limiting
- `src/components/ui/*` — shadcn primitives shipped in Chunk B Task 9
- `src/components/layouts/brand-kit/*` — page-title, balance-chip, role-theme-provider from Chunk B
- `src/config/routes.ts` — role helpers
- Tailwind v4 tokens in `globals.css` (--color-paper, --color-ink, --color-blush, --color-ocean, etc)

**Coding standards:**
- TypeScript strict mode (already enabled)
- Zod schemas for all API inputs
- All money in paise (integer)
- All times UTC in DB, converted to IST in UI
- All API routes wrapped in try/catch with Sentry capture
- All DB writes from API routes use admin client (RLS bypass)
- Tests: Vitest for units, MSW for API mocks, Playwright for e2e (defer to last)
