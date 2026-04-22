# Pricing & Workflow Redesign — Design Spec

**Date:** 2026-04-23
**Owner:** Pranav Chhipa
**Status:** Approved by owner (Sections 1-5), execution authorized overnight
**Codename:** Chunk E

---

## Goal

Replace the legacy single-balance credit model (₹50/credit, 4 packs `free_signup`/`small`/`medium`/`large`) with a **two-layer billing system** plus a fully redesigned brand vault, license certificate system, on-demand creator payouts, and the removal of Inngest in favor of direct Replicate webhooks + pg_cron + Vercel Cron.

This spec is one self-contained sub-project. It overlays cleanly on top of in-flight Chunk B (route restructure, Tasks 1-9 already shipped) and Chunk D (onboarding flow, planned). It does not touch the generation pipeline's compliance/prompt/safety primitives — only the orchestration around them.

---

## Non-Goals (explicitly out of scope for this spec)

- No changes to LoRA training pipeline (handled in earlier chunk).
- No changes to creator onboarding's 9-step flow itself (Chunk D handles redesign).
- No changes to Supabase Auth / OTP flow.
- No changes to the `compliance_vectors` / `reference_photos` schema.
- No changes to Cashfree integration *infrastructure* (we keep `lib/payments/cashfree/`); we only add new flows on top.

---

## Why

**Current pain points:**
1. **Credits abstraction confusing** — 1 credit = ₹50 was a hidden conversion. Brand sees "8,500 credits" but doesn't know how many images that buys (creator rates vary ₹500–₹5000).
2. **No image vault** — brands have nowhere to revisit, redownload, or audit past generations.
3. **No download formats** — single web-quality download. Brands need original-quality + branded PDF + DOCX reports.
4. **No license certificate** — brands have no legal proof of usage rights for an AI-generated image of someone's face. Critical for Indian DPDP compliance and court-defensibility (Anil Kapoor v Simply Life precedent).
5. **No license expiry** — current "approved = forever" creates creator-trust nightmare. Top creators won't sign up.
6. **Inngest overkill** — paid service ($20+/mo), proprietary event format, lock-in. Faiceoff at MVP scale doesn't need it. Direct Replicate webhooks + pg_cron achieves same behavior at zero incremental cost.
7. **Creator payout opaque** — current escrow logic exists but no clear UX for available-vs-holding-vs-pending breakdown.
8. **No anti-fraud signals** — repeat-rejection by creators, self-approval rings, top-up-then-refund loops not detected.

---

## What Stays (preserved infrastructure)

- Inngest pipeline's *primitives* (compliance, prompt, safety) extracted as plain functions reused by the new sync handlers.
- Existing tables: `users`, `creators`, `brands`, `categories`, `compliance_vectors`, `reference_photos`, `lora_models`, `sessions` (formerly `campaigns`), `generations`, `approvals`, `escrow_ledger`, `gst_output_ledger`, `tcs_ledger`, `tds_ledger`, `webhook_events`, `audit_log`.
- Cashfree clients (`lib/payments/cashfree/{client,collect,payouts,kyc,nodal,webhook}.ts`).
- Replicate / OpenRouter / Hive clients.
- Supabase SSR auth + role-aware middleware (`src/proxy.ts` + `src/proxy-logic.ts`, shipped in Chunk B Task 5).
- Cloudflare R2 storage client.
- Upstash Redis (rate limiting + simple queues).
- Sentry + PostHog observability.

---

## Architecture Overview

### Three-layer money model

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 1 — CREDITS (generation slots, INT)                      │
│   1 credit = 1 generation. Decrements at generation submit.    │
│   Non-refundable on reject (compute already consumed).         │
│   Top-up via 5 packs: Spark/Flow/Pro/Studio/Enterprise.        │
│   ₹30/credit base. Packs include bonus credits.                │
│   12-month expiry from purchase date.                          │
├────────────────────────────────────────────────────────────────┤
│ LAYER 2 — WALLET ₹ (creator-fee balance, paise)                │
│   Reserved at generation submit, spent on approval, refunded   │
│   on reject. Top-up via flexible amounts + bonus tiers.        │
│   No expiry. Withdrawable on account close (minus 2% fee).     │
├────────────────────────────────────────────────────────────────┤
│ LAYER 3 — CREATOR ESCROW (paise, per creator)                  │
│   Filled on brand-side approval. 7-day dispute hold.           │
│   On-demand withdrawal via Cashfree Payouts (UPI/bank).        │
│   Min withdraw ₹500. 1% TDS auto-cut. ₹25 processing fee.      │
└────────────────────────────────────────────────────────────────┘
```

### Replace Inngest with direct webhooks + cron

```
POST /api/generations/create
  (sync) Compliance check (3-layer: blocked-cat → vector → LLM) — ~50-200ms
  (sync) Prompt assembly via OpenRouter — ~1-2s
  (async) Submit to Replicate WITH webhook URL — instant return → 202
  ↓
Replicate finishes (30-90s) → POST /api/webhooks/replicate
  Verify signature
  Run Hive output safety
  Pass → create approval (48h timer starts)
  Fail → admin queue (manual review, never silent reject)
  ↓
Creator approves → POST /api/approvals/[id]/approve
  Issue license + generate cert PDF + R2 upload
  Wallet reserve → spend; escrow_ledger insert; revenue split
  ↓
pg_cron every 15 min → auto-reject 48h+ pending approvals
pg_cron every 15 min → poll stuck Replicate gens (>5min in `processing`)
Vercel Cron daily → license renewals + TDS quarterly reminders
```

### License lifecycle

```
ISSUED at approval
  ↓
ACTIVE (12 months from issue_date)
  ↓
30 DAYS BEFORE EXPIRY → notify both parties
  ↓
ON EXPIRY:
  auto_renew=true + wallet sufficient → renew (+12mo, charge wallet)
  auto_renew=true + wallet insufficient → notify, expire
  auto_renew=false → expire (status='expired')
  Creator-revoked → status='revoked' (30-day brand grace period)
  Admin-revoked → status='revoked' (instant, refund if <7d old)
```

---

## Data Model Changes

### Modified tables

**`brands`**
```sql
ALTER TABLE brands
  -- Layer 1: credit slots
  ADD COLUMN credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN credits_lifetime_purchased integer NOT NULL DEFAULT 0,
  -- Layer 2: rename existing wallet fields for clarity
  RENAME COLUMN credits_balance_paise TO wallet_balance_paise,
  RENAME COLUMN credits_reserved_paise TO wallet_reserved_paise;
  -- lifetime_topup_paise stays as-is (renamed semantically to "wallet lifetime")
```

**`credit_top_ups`**
```sql
ALTER TABLE credit_top_ups
  DROP CONSTRAINT credit_top_ups_pack_check,
  ADD CONSTRAINT credit_top_ups_pack_check CHECK (pack IN (
    'free_signup', 'spark', 'flow', 'pro', 'studio', 'enterprise'
  )),
  ADD COLUMN credits_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN bonus_credits integer NOT NULL DEFAULT 0;
-- Existing 'small'/'medium'/'large' rows: backfill to 'flow'/'pro'/'studio' via mapping migration.
```

**`generations`**
```sql
ALTER TABLE generations
  ADD COLUMN license_id uuid REFERENCES licenses(id),
  ADD COLUMN cert_url text,
  ADD COLUMN download_count_jsonb jsonb NOT NULL DEFAULT '{"original":0,"pdf":0,"docx":0}'::jsonb;
```

### New tables (6)

**1. `credit_packs_catalog`** — admin-editable pack definitions
```sql
CREATE TABLE credit_packs_catalog (
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
```
Seed values:
| code | name | credits | bonus | price_paise | popular |
|------|------|---------|-------|-------------|---------|
| free_signup | Free Signup | 5 | 0 | 0 | false |
| spark | Spark | 10 | 0 | 30000 | false |
| flow | Flow | 50 | 10 | 120000 | false |
| pro | Pro | 200 | 50 | 450000 | **true** |
| studio | Studio | 600 | 200 | 1200000 | false |
| enterprise | Enterprise | 2000 | 800 | 5000000 | false |

**2. `wallet_top_ups`** — separate from `credit_top_ups`
```sql
CREATE TABLE wallet_top_ups (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
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
CREATE INDEX idx_wt_brand_created ON wallet_top_ups(brand_id, created_at DESC);
```

**3. `wallet_transactions`** — separate ledger
```sql
CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'topup','reserve','release_reserve','spend','refund','bonus','adjustment','withdraw'
  )),
  amount_paise integer NOT NULL,
  balance_after_paise integer NOT NULL,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wt_brand_created ON wallet_transactions(brand_id, created_at DESC);
CREATE INDEX idx_wt_ref ON wallet_transactions(reference_type, reference_id);
```

**4. `licenses`** — per-approved-image
```sql
CREATE TABLE licenses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  generation_id uuid NOT NULL REFERENCES generations(id) UNIQUE,
  brand_id uuid NOT NULL REFERENCES brands(id),
  creator_id uuid NOT NULL REFERENCES creators(id),
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
CREATE INDEX idx_licenses_brand ON licenses(brand_id, expires_at);
CREATE INDEX idx_licenses_creator ON licenses(creator_id, expires_at);
CREATE INDEX idx_licenses_status_expiry ON licenses(status, expires_at);
```

**5. `creator_blocked_categories`** — pre-declared "no" list
```sql
CREATE TABLE creator_blocked_categories (
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'alcohol','tobacco','gambling','political','religious','adult','gun','crypto','drugs'
  )),
  blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, category)
);
```

**6. `creator_payouts`** — withdrawal tracking
```sql
CREATE TABLE creator_payouts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES creators(id),
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
CREATE INDEX idx_payouts_creator ON creator_payouts(creator_id, requested_at DESC);
```

### New views (2)

**`v_creator_dashboard`** — aggregate live earnings
```sql
CREATE OR REPLACE VIEW v_creator_dashboard AS
SELECT
  c.id AS creator_id,
  COALESCE(SUM(CASE WHEN e.holding_until <= now() AND e.payout_id IS NULL THEN e.amount_paise END), 0) AS available_paise,
  COALESCE(SUM(CASE WHEN e.holding_until > now() THEN e.amount_paise END), 0) AS holding_paise,
  COALESCE((SELECT COUNT(*) FROM approvals a JOIN generations g ON g.id = a.generation_id WHERE g.creator_id = c.id AND a.status = 'pending'), 0) AS pending_count,
  COALESCE(SUM(e.amount_paise), 0) AS lifetime_earned_paise
FROM creators c
LEFT JOIN escrow_ledger e ON e.creator_id = c.id
GROUP BY c.id;
```

**`v_brand_billing`** — brand balance overview
```sql
CREATE OR REPLACE VIEW v_brand_billing AS
SELECT
  b.id AS brand_id,
  b.credits_remaining,
  b.credits_lifetime_purchased,
  b.wallet_balance_paise,
  b.wallet_reserved_paise,
  (b.wallet_balance_paise - b.wallet_reserved_paise) AS wallet_available_paise,
  b.lifetime_topup_paise
FROM brands b;
```

### Migration files

- `00032_two_layer_billing.sql` — schema (all ALTERs + CREATEs)
- `00033_seed_credit_packs.sql` — pack catalog seed data
- `00034_backfill_legacy_packs.sql` — map old `small/medium/large` pack rows to nearest new equivalents
- `00035_create_billing_views.sql` — `v_creator_dashboard`, `v_brand_billing`

---

## Pricing Model (Locked-In Decisions)

### Credit Packs

| Pack | Credits | Bonus | Total | Price | Per-credit | Tagline |
|------|---------|-------|-------|-------|------------|---------|
| **Free Signup** | 5 | 0 | 5 | ₹0 | — | "Try Faiceoff" |
| **Spark** ⚡ | 10 | 0 | 10 | ₹300 | ₹30 | "Get started" |
| **Flow** 🌊 | 50 | 10 | 60 | ₹1,200 | ₹20 | "Save 33%" |
| **Pro** ⭐ MOST POPULAR | 200 | 50 | 250 | ₹4,500 | ₹18 | "Save 40%" |
| **Studio** 🎬 | 600 | 200 | 800 | ₹12,000 | ₹15 | "Agency-grade" |
| **Enterprise** 🏢 | 2,000+ | 800 | 2,800 | ₹50,000 (custom) | ₹17.85 | "Talk to us" |

> Math note: per-credit shown after bonus credits factored in. Pricing engine stores raw credits + bonus + price_paise; display layer derives effective price.

### Wallet ₹ Top-up Tiers

| Pay | Bonus | Total Wallet |
|-----|-------|--------------|
| ₹5,000 | — | ₹5,000 |
| ₹15,000 | +₹1,000 (~7%) | ₹16,000 |
| ₹50,000 | +₹5,000 (10%) | ₹55,000 |
| ₹1,00,000+ | +₹15,000 (15%) | ₹1,15,000+ |

### Commission split (flat 20%)

Brand pays creator-set rate × scope_multiplier × exclusivity_multiplier:
- **Creator share**: 80% of brand-paid amount
- **Platform share**: 20% of brand-paid amount
- **GST on platform**: 18% of platform share (paid by platform, logged in `gst_output_ledger`)

Example: Creator rate ₹1,500 + digital_print scope (+₹500) + non-exclusive = ₹2,000.
- Creator gets ₹1,600
- Platform gets ₹400
- Platform GST owed: ₹72

### Scope Multipliers

| Scope | Multiplier | Use Cases |
|-------|------------|-----------|
| `digital` | base (1.0×) | Social, web, email, performance ads |
| `digital_print` | +₹500 flat | Print ads, OOH, hoardings |
| `digital_print_packaging` | +₹1,000 flat | Product packaging, retail |

### Exclusivity Add-on

- **Non-exclusive** (default): no premium
- **Category-exclusive 90 days**: +50% on total amount, blocks creator from working with same-category competitors

### Re-generation Policy

- No free re-gens. Each re-gen = full price. Brand has incentive to write briefs carefully.

### Approval SLA

- 48-hour creator response window
- Auto-reject after 48h via pg_cron job → wallet refund + audit log entry
- Repeat slow-responder creators get response_rate metric tracked, low responders flagged

---

## Workflow (End-to-End)

### Brand Journey

1. **Sign up** — email OTP → role pick: brand → setup form (company, GST, industry) → 5 free credits granted on success.
2. **Discover** — `/brand/creators` photo-grid (existing simplified-campaign-flow spec applies).
3. **Creator profile** — bio, samples, per-scope pricing breakdown, blocked categories visible upfront, "Start Generation" CTA.
4. **Generation sheet** (modal) — pill-based brief input (product / scene / mood / aesthetic), scope toggle (digital / +print / +packaging), exclusivity toggle, **live price calculator**, "Generate" button.
5. **Processing** — `/brand/sessions/[id]` page polls status. States: `pending_compliance` → `pending_replicate` → `pending_safety` → `pending_approval` (with 48h countdown) → `approved` / `rejected`.
6. **Notification** — email + in-app toast: "Approved ✅" or "Rejected (₹X refunded)".
7. **Vault** — `/brand/vault` grid view, filter pills (All / Approved / Pending / Rejected), search by brief.
8. **Download modal** — 3 buttons: **Original ZIP** / **PDF Doc** / **DOCX Report**. Click increments `download_count_jsonb`.
9. **Licenses** — `/brand/licenses` lists active/expiring/expired licenses with PDF cert viewer.
10. **Top-up anytime** — `/brand/credits` (5 packs) OR `/brand/wallet` (₹ amount with bonus calculator).

### Creator Journey

1. **Sign up** — email OTP → role: creator → 9-step onboarding (existing in Chunk D) including bio, IG, reference photos, KYC, rates, **blocked categories**, DPDP consent.
2. **LoRA trains** (existing) → dashboard shows "Ready to receive bookings".
3. **Approval queue** — `/creator/approvals` cards with brand, image preview, scope info, 48h countdown timer per item.
4. **Review** — full-screen image + brand details + scope info + reject reason picker → Approve/Reject.
5. **Earnings dashboard** — `/creator/earnings`:
   - 🟢 **Available** (₹X) — withdrawable now
   - 🟡 **Holding** (₹Y) — clears in N days
   - 🔴 **Pending approval** (₹Z) — awaiting your action
   - 💰 **Lifetime earned** (₹A)
6. **Withdraw** — click "Withdraw" → amount slider (min ₹500) → confirm bank account → Cashfree payout → 24-48h status updates via webhook.
7. **License management** — `/creator/licenses` lists active brand licenses, one-click revoke (with reason form). Revocation triggers 30-day brand grace.

### Admin Journey

1. **Pack catalog** — `/admin/packs` CRUD on `credit_packs_catalog`.
2. **Manual safety review** — `/admin/safety` Hive-flagged images for human review.
3. **Stuck generations** — `/admin/stuck-gens` Replicate timeout fallbacks (manual retry / refund).
4. **Disputes** (existing endpoint, wired to license issues).

---

## License Certificate (PDF)

### Layout (single A4 page)

```
┌────────────────────────────────────────────────┐
│  [Faiceoff watermark]   LIKENESS LICENSE       │
│                                                │
│  License ID:  L-7K9X-2B3M-PQ8R                 │
│  Issued:      2026-04-23   Expires: 2027-04-23 │
│                                                │
│  ╔══════════════════════════════════════════╗  │
│  ║ PARTIES                                  ║  │
│  ║   Brand: ACME Beauty Pvt Ltd             ║  │
│  ║          GST: 27AAACA1234A1Z5            ║  │
│  ║   Creator: Priya Sharma (@priyasharma)   ║  │
│  ║          KYC ID: 7e5f...a3c2 (hash)      ║  │
│  ╚══════════════════════════════════════════╝  │
│                                                │
│  ASSET                                         │
│   Image ID: G-A8F2-9K1M    [thumbnail 80×80]   │
│   LoRA Model: replicate.com/.../faiceoff-priya │
│                                                │
│  TERMS                                         │
│   Scope:        Digital + Print + Packaging    │
│   Exclusivity:  Category-exclusive (Beauty)    │
│                 until 2026-07-23               │
│   Auto-renew:   ON                             │
│                                                │
│  USE RIGHTS                                    │
│   1. Use within declared scope (above)         │
│   2. India + Global digital distribution       │
│   3. No misleading or defamatory portrayal     │
│   4. Subject to creator's blocked categories   │
│   5. Governed by Indian law (DPDP Act 2023)    │
│   6. Disputes: Bengaluru jurisdiction          │
│   7. Takedown on creator's revocation request  │
│      with 30-day grace period                  │
│                                                │
│  Verify: faiceoff.in/verify/L-7K9X-2B3M-PQ8R   │
│                                                │
│  SHA-256: 7a3f5e8b2c4d... (signature hash)     │
│  Generated: 2026-04-23 14:32:18 IST            │
└────────────────────────────────────────────────┘
```

### Tech

- `@react-pdf/renderer` server-side
- Renders into Cloudflare R2 at `licenses/{license_id}.pdf`
- SHA-256 of canonical JSON payload (excluding signature) → stored in `cert_signature_sha256`
- QR code generation via `qrcode` npm package

### Public verify endpoint

`GET /verify/[license_id]` (no auth) returns JSON:
```json
{
  "license_id": "L-7K9X-2B3M-PQ8R",
  "status": "active",
  "issued_at": "2026-04-23T09:02:18Z",
  "expires_at": "2027-04-23T09:02:18Z",
  "brand_name": "ACME Beauty Pvt Ltd",
  "creator_display_name": "Priya Sharma",
  "scope": "digital_print_packaging",
  "exclusivity": "category_exclusive",
  "verification_url": "https://faiceoff.in/verify/L-7K9X-2B3M-PQ8R"
}
```
- No PII (no PAN, no Aadhaar, no email, no phone)
- Public-shareable proof
- Rate limited (10 req/min per IP)

---

## Compliance — 3-Layer Pre-Generation Check

```
POST /api/generations/create
  ↓
Layer 1: Brand declares product category at brief submission
  → Lookup `category_to_blocked_mapping` (e.g. "wine" → "alcohol")
  → Check `creator_blocked_categories`
  → If match: REJECT immediately, return user-readable reason
  ↓
Layer 2: Embed brief text via OpenAI text-embedding-3-small (1536-dim)
  → Cosine similarity vs `compliance_vectors` (creator's blocked concepts)
  → Threshold 0.75 → REJECT
  ↓
Layer 3: OpenRouter LLM (Llama 3.1 70B) classifies brief intent
  → Returns category + confidence
  → Cross-check vs blocked list → REJECT if breach
  ↓
PASS → proceed to prompt assembly + Replicate submission
```

All compliance failures logged to `audit_log` with full context (creator_id, brand_id, brief, layer, reason).

### Output Safety (Hive)

After Replicate webhook fires:
- Submit image URL to Hive moderation API
- Categories: `nsfw` / `violence` / `drugs` / `weapons` / `hate_symbols`
- Threshold: any category > 0.7 → **flag for admin review** (NOT auto-reject)
- Admin queue at `/admin/safety` for human override
- Both parties notified on final rejection (full wallet refund to brand)

---

## DPDP Compliance

### At onboarding
- Creator signs DPDP consent (version-tracked: `dpdp_consent_version`, `dpdp_consent_at` columns on `creators`)
- Brand signs T&Cs covering indemnity + acceptable use

### At each generation
- Brand re-confirms scope + use intent (1-click checkbox)
- Logged to `audit_log` with current T&C version snapshot

### Right to erasure (creator)
- One-click in `/creator/settings` → 30-day grace window
- After grace: all generations + LoRA model + reference photos deleted
- Encrypted PAN/Aadhaar (existing `KYC_ENCRYPTION_KEY`) zeroed
- Brands notified, given grace period to phase out content

### Right to withdraw consent (creator)
- One-click in `/creator/settings`
- No new generations possible
- Existing approved licenses sticky till expiry (industry standard)
- Brands notified 30 days in advance via email + in-app

---

## Anti-Fraud Signals

| Signal | Threshold | Action |
|--------|-----------|--------|
| Creator reject rate | >15% (rolling 30d) | Auto-flag account, 30-day admin review |
| Same brand → same creator gen rate | >100/day | Rate limit 10/hr enforced via Upstash |
| Brand top-up + immediate refund | <24h between events | Flag for ML review |
| Self-approval (creator KYC matches brand owner KYC) | Any match | Hard block, admin alert |
| Identical brief text reused | >5x per brand | Rate limit |
| Repeated failed payments | 3+ in 24h | Lock card, require fresh add |

All signals logged to `audit_log` with `alert_severity` ∈ {`info`,`warn`,`critical`}.

---

## Indemnity Stack (T&Cs version-tracked)

1. **Brand T&Cs at signup** — "indemnify platform from misuse, accept Cashfree T&Cs, accept license terms"
2. **Creator T&Cs at signup** — "consent for AI generation, blocked categories binding, accept payout terms"
3. **Per-generation acceptance** — checkbox at brief submit (audit-logged with T&C version)
4. **License certificate footer** — re-states scope + restrictions for legal reference

---

## API Surface (New + Modified)

### Brand-facing

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/credits/top-up` | Init Cashfree order for credit pack (input: `{pack: 'pro'}`) |
| POST | `/api/wallet/top-up` | Init Cashfree order for wallet ₹ (input: `{amount_paise: 1500000}`) |
| POST | `/api/generations/create` | **MODIFIED** — two-layer billing checks, sync compliance+prompt, async Replicate submit |
| GET | `/api/vault` | Paginated list, filters: `?status=approved&q=search` |
| GET | `/api/vault/[id]/download?format=original\|pdf\|docx` | Multi-format download |
| GET | `/api/licenses/list` | Brand's licenses + expiry status |
| GET | `/api/licenses/[id]` | License detail JSON |
| GET | `/api/licenses/[id]/certificate` | Stream cert PDF from R2 |
| POST | `/api/licenses/[id]/auto-renew` | Toggle auto-renew |
| GET | `/api/billing/balance` | Combined credits + wallet snapshot |

### Creator-facing

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/payouts/request` | Withdraw available escrow → Cashfree Payouts |
| GET | `/api/payouts/list` | Withdrawal history + statuses |
| GET | `/api/earnings/dashboard` | 4-pot summary (available/holding/pending/lifetime) |
| POST | `/api/licenses/[id]/revoke` | Revoke (with reason) |
| GET | `/api/creator/blocked-categories` | List current blocks |
| POST | `/api/creator/blocked-categories` | Add/remove block |

### Webhooks (replace Inngest)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/webhooks/replicate` | Replicate gen-complete callback → Hive safety + create approval |
| POST | `/api/cashfree/webhook` | **MODIFIED** — routes by reference_type (credit_top_up / wallet_top_up / payout) |

### Admin

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST/PATCH/DELETE | `/api/admin/packs` | CRUD on credit_packs_catalog |
| GET | `/api/admin/safety/queue` | Hive-flagged images |
| POST | `/api/admin/safety/[id]/approve` | Override Hive |
| POST | `/api/admin/safety/[id]/reject` | Final reject + refund |
| GET | `/api/admin/stuck-gens` | Replicate timeout fallback queue |
| POST | `/api/admin/stuck-gens/[id]/retry` | Manual retry |
| POST | `/api/admin/stuck-gens/[id]/refund` | Manual refund |

### Cron jobs

| Cron | Frequency | Endpoint | Purpose |
|------|-----------|----------|---------|
| pg_cron | every 15 min | (DB function `auto_reject_expired_approvals()`) | Mark 48h+ pending as rejected, trigger refund |
| pg_cron | every 15 min | (DB function `poll_stuck_generations()`) | Find gens stuck >5min in `processing`, set `needs_admin_review` |
| Vercel Cron | daily 00:00 IST | `/api/cron/license-renewals` | Charge wallet for expiring auto-renew licenses |
| Vercel Cron | daily 00:00 IST | `/api/cron/tds-quarterly-reminder` | Email creators on Form 16A reminders |

---

## Key Services (Library Layer)

```
src/lib/billing/
  credits-service.ts         — addCredits, deductCredit, listTopUps
  wallet-service.ts          — addWallet, reserveWallet, spendWallet, refundWallet
  pack-catalog.ts            — getActivePacks, getPack, computeEffectivePrice
  pricing-engine.ts          — computeRate(creator, scope, exclusivity)

src/lib/licenses/
  license-service.ts         — issueLicense, renewLicense, revokeLicense, listForBrand, listForCreator
  cert-pdf.ts                — generateCertificate (returns Uint8Array)
  cert-storage.ts            — uploadCertToR2, getCertSignedUrl
  verify.ts                  — getPublicLicenseStatus

src/lib/payouts/
  payout-service.ts          — requestPayout, computeTDS, computeFee
  cashfree-payout-adapter.ts — submitToCashfree, handleWebhook

src/lib/compliance/
  three-layer-check.ts       — runComplianceCheck (extracted from Inngest)
  category-mapping.ts        — productCategoryToBlocked

src/lib/anti-fraud/
  signals.ts                 — emitSignal, evaluateRiskScore
  rate-limiter.ts            — Upstash-backed per-brand-per-creator limits

src/lib/vault/
  vault-service.ts           — listGenerations (filtered/paginated)
  download-formats.ts        — generateDocxReport, generatePdfDoc, originalZip
```

---

## Screens (Build List)

### Brand (8 new + 4 redesign)

**New:**
- `/pricing` — public marketing page, 5 packs side-by-side
- `/brand/credits` — top-up packs grid + checkout
- `/brand/wallet` — ₹ top-up with bonus calculator
- `/brand/vault` — grid + filters + download modal
- `/brand/licenses` — list + expiry alerts
- `/brand/licenses/[id]` — cert PDF embedded viewer
- `/brand/billing` — credits + wallet overview, lifetime stats
- `/brand/sessions/[id]` — live status polling page

**Redesigns/polish:**
- `/brand/creators` (per simplified-campaign-flow spec)
- `/brand/creators/[id]` (per same spec)
- Generation sheet modal (NEW pill-based brief)
- Brand setup wizard (existing, polish)

### Creator (4 new + 2 polish)

**New:**
- `/creator/earnings` — 4-pot dashboard
- `/creator/withdraw` — request flow (amount → bank → submit)
- `/creator/payouts` — history with statuses
- `/creator/blocked-categories` — checkbox management

**Polish:**
- `/creator/approvals` (existing, polish)
- `/creator/licenses` — revoke flow + active license list

### Admin (3 new)

- `/admin/packs` — pack catalog CRUD
- `/admin/safety` — Hive review queue
- `/admin/stuck-gens` — Replicate timeout fallbacks

### Marketing/Public

- `/pricing` (public, marketing-grade)
- `/verify/[license_id]` (public license verification — no auth)
- `/` landing page hero update — "5 free credits, no card"

---

## Inngest Removal

### What gets removed

```
src/inngest/                            DELETE entire directory
  client.ts                             DELETE
  index.ts                              DELETE
  functions/generation/
    generation-pipeline.ts              DELETE (3 functions)

package.json                            REMOVE inngest dependency

src/app/api/inngest/route.ts            DELETE
```

### What replaces it

| Old Inngest function | Replacement |
|----------------------|-------------|
| `generation/created` event handler | `POST /api/generations/create` runs sync compliance + prompt, async Replicate submit |
| `generation/replicate-complete` step | `POST /api/webhooks/replicate` (signature-verified) |
| `generation/approved` event handler | `POST /api/approvals/[id]/approve` (already wired to existing endpoint, extend with license issue) |
| `generation/rejected` event handler | `POST /api/approvals/[id]/reject` (extend with refund logic) |
| 48h expiry timer | pg_cron job `auto_reject_expired_approvals()` every 15 min |

### Safety net for missed Replicate webhooks

pg_cron job `poll_stuck_generations()` runs every 15 min:
```sql
-- Pseudo-SQL
WITH stuck AS (
  SELECT id, replicate_prediction_id
  FROM generations
  WHERE status = 'pending_replicate'
    AND created_at < now() - interval '5 minutes'
    AND created_at > now() - interval '24 hours'
)
-- Per row: HTTP call to Replicate `GET /predictions/{id}` (via DB extension or via API /api/cron/poll-replicate)
-- If complete: trigger same handler as webhook would
-- If stuck >24h: mark `needs_admin_review`
```

This is implemented as:
- pg_cron triggers `/api/cron/poll-replicate` daily
- A small Vercel cron (every 15 min) hits same endpoint for shorter intervals

---

## Migration & Cutover Plan

### Phase 1 — Foundation (Day 1)
- Run migrations 00032-00035
- Seed credit_packs_catalog
- Build BillingService + LicenseService + PayoutService
- Unit tests for all service methods (Vitest)

### Phase 2 — APIs (Day 2-3)
- Implement all new API routes
- Modify existing `/api/generations/create` for two-layer billing
- Modify Cashfree webhook to route by reference_type
- Replicate webhook handler with signature verification
- pg_cron jobs for auto-reject + stuck-gen polling
- Vercel Cron configs in `vercel.json` for license renewals + TDS reminders
- Integration tests via MSW

### Phase 3 — Brand UI (Day 4-5)
- `/pricing` public page
- `/brand/credits` top-up flow
- `/brand/wallet` top-up flow
- `/brand/vault` grid + download modal
- `/brand/licenses` list + cert viewer
- `/brand/billing` overview
- Generation sheet modal redesign (pill-based)

### Phase 4 — Creator UI (Day 6)
- `/creator/earnings` 4-pot dashboard
- `/creator/withdraw` request flow
- `/creator/payouts` history
- `/creator/blocked-categories` management
- `/creator/licenses` revoke flow

### Phase 5 — Admin + Public (Day 7)
- `/admin/packs` CRUD
- `/admin/safety` review queue
- `/admin/stuck-gens` fallback queue
- `/verify/[license_id]` public verification

### Phase 6 — Inngest removal (Day 8)
- Delete `src/inngest/` directory
- Remove dep from package.json
- Run full test suite + manual smoke test
- Tag release `v0.5.0-billing-redesign`

### Phase 7 — Backfill & rollout (Day 9-10)
- Run `00034_backfill_legacy_packs.sql` in production
- Email existing brands explaining new system + giving them ₹500 wallet bonus as goodwill
- Monitor Sentry for first 48 hours
- Hotfix queue ready

---

## Testing Strategy

- **Vitest unit tests** for all service methods (billing, licenses, payouts, compliance)
- **Vitest integration tests** for API routes via MSW (mock Cashfree, Replicate, Hive)
- **Playwright e2e** for critical paths:
  - Brand: signup → top-up → generate → approve → vault → download
  - Creator: signup → onboarding → approve → withdraw
  - Admin: pack CRUD, safety override
- **Cron job tests** as scheduled functions (mock time forward)
- **Replicate webhook signature** verified via HMAC test vectors
- **PDF generation snapshot test** for license cert layout

Coverage target: 80% on services, 60% on routes.

---

## Observability

- **Sentry** — all transaction rollbacks, webhook signature failures, Replicate timeouts
- **PostHog** — funnel events: `top_up_started`, `top_up_completed`, `generation_started`, `generation_approved`, `vault_download`, `license_renewed`, `withdraw_requested`, `withdraw_completed`
- **Audit log** — every billing mutation, every license event, every consent action

---

## Success Metrics

- **Brand activation**: % brands who buy credits within 7 days of signup → target 30%
- **Generation success rate**: gens approved / gens started → target 85%
- **Creator withdrawal rate**: creators who withdraw within 30 days of first earning → target 80%
- **License auto-renew rate**: target 60% (signals brands actively use creator)
- **Cost per generation**: Replicate + storage + Hive — target <₹15/gen
- **Margin**: platform_share - cost_per_gen → target >₹250/gen at average rate

---

## Open Questions / Future Work

- **Brand wallet refund on close** — flow exists in design (₹ minus 2%), not implementing in v1
- **Creator response_rate metric** — track but no penalty in v1, add in v2
- **Tier-based creator promotion** — manual admin override in v1, automated in v2
- **Brief-first marketplace** (creators apply to brand briefs) — v2 feature
- **Bulk batch mode** — marked optional/Pro-tier-only, deferred to post-launch
- **Creator-side blocked brands list** — defer to v2 (currently only category blocking)
- **Indemnity insurance** — talk to insurer once volume justifies (>₹1Cr GMV/mo)

---

## Decisions Reference (locked-in by owner)

1. ✅ Per-image pricing (not subscription/package/auction)
2. ✅ Creator-set rates (not platform slabs)
3. ✅ Pay-on-approval timing (credit cut at gen + wallet reserve, both refund logic)
4. ✅ 20% flat platform commission
5. ✅ Platform absorbs reject compute cost (no brand reject fee)
6. ✅ 12-month license + auto-renew (with creator opt-out)
7. ✅ Digital scope default + paid upgrades for print/packaging
8. ✅ Non-exclusive default + 90-day category exclusivity (+50% premium)
9. ✅ Creator pre-declared blocked categories (9 categories enum)
10. ✅ DPDP revocation: stops new gens, existing licenses sticky until expiry
11. ✅ Auto License Certificate PDF per approved image
12. ✅ 7-day post-approval escrow hold
13. ✅ Hybrid generation: single default, batch optional for Pro+
14. ✅ No free re-gens (full price for re-generation)
15. ✅ Auto-reject after 48h creator inactivity
16. ✅ Two-layer billing: credits (slots) + wallet (₹)
17. ✅ ₹30/credit base, 5 packs (Spark/Flow/Pro/Studio/Enterprise) + 5 free signup credits
18. ✅ On-demand creator withdrawal only (no auto weekly), min ₹500, ₹25 fee
19. ✅ 1% TDS auto-cut on payouts
20. ✅ KYC hard gate (no KYC = no withdraw)
21. ✅ Drop Inngest, use direct Replicate webhooks + pg_cron + Vercel Cron
22. ✅ All-generations vault with status filters
23. ✅ Three download formats: Original ZIP, PDF Doc, DOCX Report
