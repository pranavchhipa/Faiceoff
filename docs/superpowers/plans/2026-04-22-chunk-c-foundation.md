# Chunk C — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Razorpay with Cashfree (Collect + Nodal + Payouts + KYC), introduce creator-driven license marketplace with brand-side credit system, click-to-accept contracts, and append-only ledger tables for escrow + GST/TCS/TDS compliance.

**Architecture:** Backend-heavy migration. 7 new migrations add ledger tables, license entities, contract storage, and payout infrastructure. Cashfree integration wraps all 4 products. Razorpay code removed. All money flows through Cashfree Nodal — platform balance sheet stays clean.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (pgcrypto), Inngest v4, Cashfree (Collect/Nodal/Payouts/KYC), R2 for contract PDFs, Resend for email receipts, Vitest + MSW for tests.

**Spec reference:** `docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md`

**Prerequisites before starting:**
1. Cashfree merchant account created (prod + test), app_id + secret in Vercel env
2. Cashfree Nodal product activated (virtual account ID assigned)
3. Cashfree Payouts product activated (IMPS mode enabled)
4. Cashfree KYC product activated (PAN + Aadhaar + penny-drop APIs accessible)
5. R2 bucket `faiceoff-contracts` created (private, signed-URL access)

---

## File Structure

New migrations (migrations 00020-00027):

| Migration | Creates |
|---|---|
| `00020_create_credit_system.sql` | `credit_transactions`, `credit_top_ups`, brand column additions |
| `00021_create_license_system.sql` | `creator_license_listings`, `license_requests`, `license_contracts` |
| `00022_create_escrow_ledger.sql` | `escrow_ledger`, `platform_revenue_ledger` |
| `00023_create_tax_ledgers.sql` | `gst_output_ledger`, `tcs_ledger`, `tds_ledger` |
| `00024_create_withdrawal_system.sql` | `withdrawal_requests`, `creator_kyc`, `creator_bank_accounts`, creator column additions |
| `00025_rename_campaigns_to_sessions.sql` | Renames `campaigns` → `collab_sessions`, FK cleanup |
| `00026_retire_lora_models.sql` | Drops `lora_models` + `lora_training_bucket` references |
| `00027_archive_wallet_transactions.sql` | Renames `wallet_transactions` → `_archive`, seals writes |

New code:

| Path | Responsibility |
|---|---|
| `src/lib/payments/cashfree/client.ts` | HTTP client + signature verification |
| `src/lib/payments/cashfree/collect.ts` | Create/verify top-up orders |
| `src/lib/payments/cashfree/nodal.ts` | Escrow lock/release instructions |
| `src/lib/payments/cashfree/payouts.ts` | Creator bank transfers |
| `src/lib/payments/cashfree/kyc.ts` | PAN/Aadhaar/penny-drop |
| `src/lib/payments/cashfree/webhook.ts` | Event parsing + signature verify |
| `src/lib/payments/cashfree/types.ts` | Request/response TS types |
| `src/lib/contracts/template.ts` | Contract markdown generation |
| `src/lib/contracts/pdf-render.ts` | Markdown → PDF via `@react-pdf/renderer` |
| `src/lib/contracts/storage.ts` | R2 upload + signed URL helpers |
| `src/lib/ledger/math.ts` | All paise calculations (commission, GST, TCS, TDS, release, refund) |
| `src/lib/ledger/commit.ts` | Typed insert helpers for each ledger table |
| `src/domains/license/types.ts` | License request status enum + Zod schemas |
| `src/domains/license/workflow.ts` | State machine transitions |
| `src/domains/credit/types.ts` | Credit pack enum + pricing table |
| `src/domains/withdrawal/types.ts` | Withdrawal status enum + request schema |
| `src/app/api/cashfree/webhook/route.ts` | Cashfree webhook receiver |
| `src/app/api/credits/top-up/route.ts` | Initiate top-up order |
| `src/app/api/credits/balance/route.ts` | Get current balance |
| `src/app/api/licenses/listings/route.ts` | CRUD for creator listings |
| `src/app/api/licenses/request/route.ts` | Brand requests a license |
| `src/app/api/licenses/[id]/accept/route.ts` | Creator accepts + signs contract |
| `src/app/api/licenses/[id]/reject/route.ts` | Creator rejects request |
| `src/app/api/licenses/[id]/contract/route.ts` | Fetch contract PDF signed URL |
| `src/app/api/withdrawals/create/route.ts` | Creator initiates withdrawal |
| `src/app/api/withdrawals/[id]/route.ts` | Withdrawal detail |
| `src/app/api/kyc/pan/route.ts` | PAN submission + Cashfree verify |
| `src/app/api/kyc/aadhaar/route.ts` | Aadhaar submission |
| `src/app/api/kyc/bank/route.ts` | Bank + penny-drop |
| `src/app/api/kyc/status/route.ts` | Get consolidated KYC state |
| `src/inngest/functions/reconcile/cashfree-reconcile.ts` | Nightly reconciliation cron |
| `src/inngest/functions/license/expire-licenses.ts` | Daily expiry refund job |

Files to DELETE (after successful cutover):

| Path | Reason |
|---|---|
| `src/lib/payments/razorpay/` (entire dir) | Replaced by Cashfree |
| `src/app/api/wallet/create-order/route.ts` | Replaced by credits/top-up |
| `src/app/api/wallet/verify-payment/route.ts` | Replaced by Cashfree webhook |

---

## PHASE 1: Database migrations

### Task 1: Credit system schema

**Files:**
- Create: `supabase/migrations/00020_create_credit_system.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Brand credit balance (denormalized, derived from credit_transactions)
alter table public.brands 
  add column credits_balance_paise integer not null default 0,
  add column credits_reserved_paise integer not null default 0,
  add column lifetime_topup_paise integer not null default 0;

-- Credit transactions ledger (append-only)
create table public.credit_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null check (type in (
    'topup','reserve','release_reserve','spend','refund','bonus','adjustment'
  )),
  amount_paise integer not null,
  balance_after_paise integer not null,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index idx_ct_brand_created on public.credit_transactions(brand_id, created_at desc);
create index idx_ct_ref on public.credit_transactions(reference_type, reference_id);

alter table public.credit_transactions enable row level security;
create policy "Brands read own credit transactions" on public.credit_transactions
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));

-- Credit top-up orders (Cashfree Collect)
create table public.credit_top_ups (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  pack text not null check (pack in ('free_signup','small','medium','large')),
  credits integer not null,
  amount_paise integer not null,
  cf_order_id text unique,
  cf_payment_id text,
  status text not null check (status in (
    'initiated','processing','success','failed','expired'
  )) default 'initiated',
  failure_reason text,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ctu_brand on public.credit_top_ups(brand_id, created_at desc);
create index idx_ctu_cf on public.credit_top_ups(cf_order_id);

alter table public.credit_top_ups enable row level security;
create policy "Brands read own top-ups" on public.credit_top_ups
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));

create trigger on_credit_top_ups_updated
  before update on public.credit_top_ups
  for each row execute function public.handle_updated_at();
```

- [ ] **Step 2: Run migration against local Supabase**

```bash
pnpm supabase db reset  # if testing local
# OR apply to dev project:
pnpm dlx supabase db push
```

Expected: No errors, 2 new tables + 3 column additions to brands.

- [ ] **Step 3: Regenerate types**

```bash
pnpm dlx supabase gen types typescript --local > src/types/supabase.ts
```

Verify: `src/types/supabase.ts` has `credit_transactions` and `credit_top_ups` types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00020_create_credit_system.sql src/types/supabase.ts
git commit -m "feat(schema): credit system tables"
```

---

### Task 2: License system schema

**Files:**
- Create: `supabase/migrations/00021_create_license_system.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Creator license listings (instances of templates with custom pricing)
create table public.creator_license_listings (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  template text not null check (template in ('creation','creation_promotion')),
  price_paise integer not null check (price_paise > 0),
  image_quota integer not null check (image_quota > 0),
  validity_days integer not null check (validity_days > 0),
  ig_post_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, template)
);

create index idx_cll_creator on public.creator_license_listings(creator_id);
create index idx_cll_active on public.creator_license_listings(is_active) where is_active = true;

alter table public.creator_license_listings enable row level security;
create policy "Anyone can read active listings" on public.creator_license_listings
  for select using (is_active = true);
create policy "Creators manage own listings" on public.creator_license_listings
  for all using (creator_id in (select id from public.creators where user_id = auth.uid()));

create trigger on_cll_updated before update on public.creator_license_listings
  for each row execute function public.handle_updated_at();

-- License requests
create table public.license_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  listing_id uuid not null references public.creator_license_listings(id),
  creator_id uuid not null references public.creators(id),
  brand_id uuid not null references public.brands(id),
  status text not null check (status in (
    'draft','requested','accepted','active','rejected','expired','cancelled','completed'
  )) default 'requested',
  
  base_paise integer not null,
  commission_paise integer not null,
  gst_on_commission_paise integer not null,
  total_paise integer not null,
  image_quota integer not null,
  validity_days integer not null,
  release_per_image_paise integer not null,
  
  images_requested integer not null default 0,
  images_approved integer not null default 0,
  images_rejected integer not null default 0,
  
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  
  brand_notes text,
  creator_reject_reason text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lr_creator_status on public.license_requests(creator_id, status);
create index idx_lr_brand_status on public.license_requests(brand_id, status);
create index idx_lr_expires on public.license_requests(expires_at) where status = 'active';

alter table public.license_requests enable row level security;
create policy "Creators read own requests" on public.license_requests
  for select using (creator_id in (select id from public.creators where user_id = auth.uid()));
create policy "Brands read own requests" on public.license_requests
  for select using (brand_id in (select id from public.brands where user_id = auth.uid()));

create trigger on_lr_updated before update on public.license_requests
  for each row execute function public.handle_updated_at();

-- License contracts
create table public.license_contracts (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid not null references public.license_requests(id) on delete cascade unique,
  pdf_r2_path text not null,
  pdf_hash_sha256 text not null,
  template_version text not null,
  creator_accepted_at timestamptz not null,
  creator_accept_ip text not null,
  creator_accept_user_agent text not null,
  brand_accepted_at timestamptz,
  brand_accept_ip text,
  brand_accept_user_agent text,
  terms_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_lc_lr on public.license_contracts(license_request_id);

alter table public.license_contracts enable row level security;
create policy "Parties read own contracts" on public.license_contracts
  for select using (
    license_request_id in (
      select id from public.license_requests lr
      where lr.creator_id in (select id from public.creators where user_id = auth.uid())
         or lr.brand_id in (select id from public.brands where user_id = auth.uid())
    )
  );
```

- [ ] **Step 2: Apply + regen types**

```bash
pnpm dlx supabase db push
pnpm dlx supabase gen types typescript --local > src/types/supabase.ts
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00021_create_license_system.sql src/types/supabase.ts
git commit -m "feat(schema): license marketplace tables"
```

---

### Task 3: Escrow + platform revenue ledgers

**Files:**
- Create: `supabase/migrations/00022_create_escrow_ledger.sql`

- [ ] **Step 1: Write migration** (per spec section 5.1 — `escrow_ledger` + `platform_revenue_ledger` with all columns + indexes + RLS). Spec has complete SQL already.

- [ ] **Step 2: Apply + regen**
- [ ] **Step 3: Commit**: `feat(schema): escrow + platform revenue ledgers`

---

### Task 4: Tax ledgers (GST output, TCS, TDS)

**Files:**
- Create: `supabase/migrations/00023_create_tax_ledgers.sql`

- [ ] **Step 1: Write migration** — full CREATE statements from spec section 5.1 (`gst_output_ledger`, `tcs_ledger`, `tds_ledger`). All three tables follow similar shape.

- [ ] **Step 2: Apply + regen**
- [ ] **Step 3: Commit**: `feat(schema): tax ledgers (GST/TCS/TDS)`

---

### Task 5: Withdrawal + KYC + bank accounts

**Files:**
- Create: `supabase/migrations/00024_create_withdrawal_system.sql`

- [ ] **Step 1: Write migration** (enables pgcrypto extension if not enabled, then creates `withdrawal_requests`, `creator_kyc`, `creator_bank_accounts` per spec, adds `pending_balance_paise`, `lifetime_earned_gross_paise`, `lifetime_withdrawn_net_paise`, `kyc_status` columns to `creators` table).

```sql
-- Enable pgcrypto if not already
create extension if not exists pgcrypto;

-- Add creator columns
alter table public.creators
  add column pending_balance_paise integer not null default 0,
  add column lifetime_earned_gross_paise integer not null default 0,
  add column lifetime_withdrawn_net_paise integer not null default 0,
  add column kyc_status text check (kyc_status in (
    'not_started','in_progress','verified','rejected'
  )) default 'not_started';

-- ... (full CREATE per spec section 5.1)
```

- [ ] **Step 2: Apply + regen**
- [ ] **Step 3: Commit**: `feat(schema): withdrawal + KYC + bank accounts`

---

### Task 6: Rename campaigns → collab_sessions

**Files:**
- Create: `supabase/migrations/00025_rename_campaigns_to_sessions.sql`

- [ ] **Step 1: Write migration**

```sql
-- Rename table
alter table public.campaigns rename to collab_sessions;

-- Add license link
alter table public.collab_sessions
  add column license_request_id uuid references public.license_requests(id);

-- Rename FK in generations
alter table public.generations rename column campaign_id to collab_session_id;

-- Drop LoRA FK if exists
alter table public.collab_sessions drop column if exists lora_model_id;

-- Recreate constraints / rename indexes
alter index if exists idx_campaigns_brand_id rename to idx_collab_sessions_brand_id;
alter index if exists idx_campaigns_creator_id rename to idx_collab_sessions_creator_id;
alter index if exists idx_campaigns_status rename to idx_collab_sessions_status;

-- Rename RLS policies
alter policy "Users can read own campaigns" on public.collab_sessions rename to "Users can read own sessions";
```

- [ ] **Step 2: Apply + regen types**

Verify: `src/types/supabase.ts` no longer has `campaigns`, has `collab_sessions` with `license_request_id` column.

- [ ] **Step 3: Find all app code references**

```bash
grep -rn "campaigns" src --include="*.ts" --include="*.tsx"
```

Expected: many hits. All need to be updated in subsequent tasks to use `collab_sessions`. For now, document in commit message.

- [ ] **Step 4: Commit**: `feat(schema): rename campaigns to collab_sessions`

---

### Task 7: Retire lora_models

**Files:**
- Create: `supabase/migrations/00026_retire_lora_models.sql`

- [ ] **Step 1: Write migration**

```sql
-- Drop the table (cascade removes FKs in dependent tables, will check first)
drop table if exists public.lora_models cascade;

-- Remove any lora-specific columns from creators
alter table public.creators 
  drop column if exists lora_replicate_id,
  drop column if exists lora_training_status;

-- Note: storage bucket for LoRA training files can be deleted via Supabase dashboard
-- (not in migration scope - storage requires admin API)
```

- [ ] **Step 2: Apply + regen**
- [ ] **Step 3: Commit**: `feat(schema): retire lora_models (Gemini pipeline does not require)`

---

### Task 8: Archive wallet_transactions

**Files:**
- Create: `supabase/migrations/00027_archive_wallet_transactions.sql`

- [ ] **Step 1: Write migration**

```sql
-- Rename old table to archive for historical reference
alter table public.wallet_transactions rename to wallet_transactions_archive;

-- Drop policies that allowed writes, keep read-only for admin
drop policy if exists "Users can insert transactions" on public.wallet_transactions_archive;

-- Update comment
comment on table public.wallet_transactions_archive is
  'Historical wallet transactions. Read-only. Replaced by credit_transactions, escrow_ledger, payout_transactions, gst/tcs/tds ledgers from 2026-04.';
```

- [ ] **Step 2: Apply + regen**
- [ ] **Step 3: Commit**: `feat(schema): archive wallet_transactions table`

---

## PHASE 2: Cashfree client scaffolding

### Task 9: Cashfree types + client HTTP wrapper

**Files:**
- Create: `src/lib/payments/cashfree/types.ts`
- Create: `src/lib/payments/cashfree/client.ts`
- Create: `src/lib/payments/cashfree/__tests__/client.test.ts`

- [ ] **Step 1: Write types**

`types.ts` exports interfaces for: `CashfreeOrder`, `CashfreeOrderResponse`, `CashfreePayment`, `CashfreeBeneficiary`, `CashfreeTransfer`, `CashfreeTransferResponse`, `CashfreeKycPanResponse`, `CashfreeKycAadhaarResponse`, `CashfreePennyDropResponse`, `CashfreeWebhookEvent`.

- [ ] **Step 2: Write failing test for `CashfreeClient`**

Test verifies: client signs requests with HMAC-SHA256, sends correct headers (`x-client-id`, `x-client-secret`, `x-api-version`), retries on 5xx (up to 3 attempts), throws on 4xx immediately.

- [ ] **Step 3: Implement client**

```typescript
// src/lib/payments/cashfree/client.ts
import { createHmac } from "crypto";

const CASHFREE_API_VERSION = "2025-01-01";

export class CashfreeClient {
  private baseUrl: string;
  private appId: string;
  private secretKey: string;
  
  constructor() {
    const mode = process.env.CASHFREE_MODE ?? "test";
    this.baseUrl = mode === "prod" 
      ? "https://api.cashfree.com"
      : "https://sandbox.cashfree.com";
    this.appId = process.env.CASHFREE_APP_ID!;
    this.secretKey = process.env.CASHFREE_SECRET_KEY!;
  }
  
  async request<T>(options: {
    method: "GET" | "POST" | "PATCH";
    path: string;
    body?: Record<string, unknown>;
    retries?: number;
  }): Promise<T> {
    const { method, path, body, retries = 3 } = options;
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            "x-client-id": this.appId,
            "x-client-secret": this.secretKey,
            "x-api-version": CASHFREE_API_VERSION,
            "content-type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        
        if (response.status >= 500 && attempt < retries) {
          await sleep(Math.min(1000 * 2 ** attempt, 8000));
          continue;
        }
        
        const data = await response.json();
        if (!response.ok) {
          throw new CashfreeApiError(response.status, data);
        }
        return data as T;
      } catch (e) {
        lastError = e;
        if (attempt >= retries) break;
      }
    }
    throw lastError;
  }
  
  verifyWebhookSignature(rawBody: string, timestamp: string, signature: string): boolean {
    const secret = process.env.CASHFREE_WEBHOOK_SECRET!;
    const payload = timestamp + rawBody;
    const expected = createHmac("sha256", secret).update(payload).digest("base64");
    return expected === signature;
  }
}

export class CashfreeApiError extends Error {
  constructor(public statusCode: number, public response: unknown) {
    super(`Cashfree API error ${statusCode}`);
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
```

- [ ] **Step 4: Run tests, ensure pass**

```bash
pnpm vitest run src/lib/payments/cashfree/__tests__/client.test.ts
```

- [ ] **Step 5: Commit**: `feat(cashfree): HTTP client with signing + retries`

---

### Task 10: Cashfree Collect (top-up orders)

**Files:**
- Create: `src/lib/payments/cashfree/collect.ts`
- Create: `src/lib/payments/cashfree/__tests__/collect.test.ts`

- [ ] **Step 1: Test — createOrder returns payment session URL**

Given brand_id + pack details, createOrder should: call `/pg/orders` with correct payload, return `payment_session_id` + `order_id`.

- [ ] **Step 2: Implement**

```typescript
export async function createTopUpOrder(params: {
  brandId: string;
  pack: "small" | "medium" | "large";
  credits: number;
  amountPaise: number;
  customerEmail: string;
  customerPhone: string;
}): Promise<{ orderId: string; paymentSessionId: string }> {
  const client = new CashfreeClient();
  const orderId = `topup_${params.brandId}_${Date.now()}`;
  
  const response = await client.request<{
    order_id: string;
    payment_session_id: string;
  }>({
    method: "POST",
    path: "/pg/orders",
    body: {
      order_id: orderId,
      order_amount: params.amountPaise / 100,  // Cashfree wants rupees
      order_currency: "INR",
      customer_details: {
        customer_id: params.brandId,
        customer_email: params.customerEmail,
        customer_phone: params.customerPhone,
      },
      order_meta: {
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/brand/credits?order_id={order_id}`,
        notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/cashfree/webhook`,
      },
      order_tags: {
        pack: params.pack,
        credits: params.credits.toString(),
      },
    },
  });
  
  return { orderId: response.order_id, paymentSessionId: response.payment_session_id };
}

export async function getOrderStatus(orderId: string): Promise<{
  status: "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED";
  payments: Array<{ payment_id: string; payment_status: string }>;
}> {
  const client = new CashfreeClient();
  return client.request({
    method: "GET",
    path: `/pg/orders/${orderId}`,
  });
}
```

- [ ] **Step 3: Run tests, commit**: `feat(cashfree): Collect - top-up orders`

---

### Task 11: Cashfree Payouts

**Files:**
- Create: `src/lib/payments/cashfree/payouts.ts`
- Create: `src/lib/payments/cashfree/__tests__/payouts.test.ts`

- [ ] **Step 1-3: Tests + implementation**

Functions needed:
- `createBeneficiary(creator_kyc, bank_account) → beneficiary_id`
- `createTransfer({ beneficiary_id, amount_paise, mode: 'IMPS', transfer_id }) → transfer`
- `getTransferStatus(transfer_id) → { status, utr, reason? }`
- `removeBeneficiary(beneficiary_id)` (for account changes)

Map Cashfree states: `SUCCESS` → our `success`, `FAILED`/`REJECTED` → `failed`, `PROCESSING`/`PENDING` → `processing`.

- [ ] **Step 4: Commit**: `feat(cashfree): Payouts - transfers + beneficiaries`

---

### Task 12: Cashfree KYC (PAN, Aadhaar, penny-drop)

**Files:**
- Create: `src/lib/payments/cashfree/kyc.ts`
- Create: `src/lib/payments/cashfree/__tests__/kyc.test.ts`

- [ ] **Step 1-3: Tests + implementation**

Functions:
- `verifyPan({ pan, name }) → { verified, name_match, pan_name }`
- `verifyAadhaar({ aadhaar_last4, name }) → { verified, confidence }` (uses e-Aadhaar OTP verification endpoint)
- `pennyDrop({ account_number, ifsc, expected_name }) → { success, actual_name, match_score }`

All wrap `client.request()` with Cashfree KYC endpoints under `/kyc-docs/`.

- [ ] **Step 4: Commit**: `feat(cashfree): KYC - PAN + Aadhaar + penny-drop`

---

### Task 13: Cashfree Nodal / Escrow helper

**Files:**
- Create: `src/lib/payments/cashfree/nodal.ts`

**Note:** Cashfree Nodal doesn't have a standalone "split" API — funds arrive via Collect (tagged to brand), and payout from the same virtual account constitutes release. The "lock" is logical (DB state), not an API call.

- [ ] **Step 1: Implement helpers**

```typescript
// Verifies that a brand's received Cashfree payment is in the nodal account before allowing ledger entry
export async function confirmReceiptInNodal(orderId: string): Promise<boolean> {
  const { status, payments } = await getOrderStatus(orderId);
  return status === "PAID" && payments.some(p => p.payment_status === "SUCCESS");
}

// Helper for settlement status queries — Cashfree settlement dashboard API
export async function getSettlementReport(date: string): Promise<SettlementReport> {
  const client = new CashfreeClient();
  return client.request({
    method: "GET",
    path: `/pg/settlements?start_date=${date}&end_date=${date}`,
  });
}
```

- [ ] **Step 2: Commit**: `feat(cashfree): Nodal helpers - receipt confirmation + settlement`

---

### Task 14: Cashfree webhook parser

**Files:**
- Create: `src/lib/payments/cashfree/webhook.ts`
- Create: `src/lib/payments/cashfree/__tests__/webhook.test.ts`

- [ ] **Step 1: Test — parse + verify signature**

- [ ] **Step 2: Implement**

```typescript
export type CashfreeWebhookType =
  | "PAYMENT_SUCCESS_WEBHOOK"
  | "PAYMENT_FAILED_WEBHOOK"
  | "PAYMENT_USER_DROPPED_WEBHOOK"
  | "TRANSFER_SUCCESS"
  | "TRANSFER_FAILED"
  | "TRANSFER_REVERSED";

export type CashfreeWebhookEvent = {
  type: CashfreeWebhookType;
  event_time: string;
  data: Record<string, unknown>;
};

export function parseWebhook(
  rawBody: string,
  headers: { timestamp: string; signature: string }
): CashfreeWebhookEvent {
  const client = new CashfreeClient();
  if (!client.verifyWebhookSignature(rawBody, headers.timestamp, headers.signature)) {
    throw new Error("Invalid webhook signature");
  }
  const parsed = JSON.parse(rawBody);
  return {
    type: parsed.type,
    event_time: parsed.event_time,
    data: parsed.data,
  };
}
```

- [ ] **Step 3: Commit**: `feat(cashfree): webhook parser with signature verification`

---

## PHASE 3: Ledger math + commit helpers

### Task 15: Ledger math (pure functions)

**Files:**
- Create: `src/lib/ledger/math.ts`
- Create: `src/lib/ledger/__tests__/math.test.ts`

- [ ] **Step 1: Write failing tests**

Test every formula with property-based + example inputs:
- `calculateLicenseCheckout(base, quota)` — expects `{ base, commission (18%), gst_on_commission (18%), total, release_per_image (floor) }`
- `calculateWithdrawalDeductions(gross, hasGstin)` — expects `{ tcs (1%), tds (1%), gst_output (18% or 0), net }`
- `calculateRefundOnExpiry(base, quota, images_approved)` — expects remaining slots × release_per_image
- `calculateFinalImageRelease(base, quota, is_final)` — on final image, includes residual

Example test:
```typescript
it("calculates checkout for Priya's license", () => {
  const result = calculateLicenseCheckout(600000, 25);
  expect(result).toEqual({
    base_paise: 600000,
    commission_paise: 108000,
    gst_on_commission_paise: 19440,
    total_paise: 727440,
    release_per_image_paise: 24000,
    residual_paise: 0,
  });
});

it("handles non-divisible quota", () => {
  const result = calculateLicenseCheckout(600100, 25);
  expect(result.release_per_image_paise).toBe(24004);
  expect(result.residual_paise).toBe(0);  // 600100 / 25 = 24004 exact
});

it("handles residual on non-even division", () => {
  const result = calculateLicenseCheckout(600001, 25);
  expect(result.release_per_image_paise).toBe(24000);
  expect(result.residual_paise).toBe(1);
});
```

- [ ] **Step 2: Implement**

```typescript
export const COMMISSION_RATE = 0.18;
export const GST_RATE = 0.18;
export const TCS_RATE = 0.01;
export const TDS_RATE = 0.01;

export type LicenseCheckout = {
  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
  release_per_image_paise: number;
  residual_paise: number;
};

export function calculateLicenseCheckout(
  base_paise: number,
  image_quota: number
): LicenseCheckout {
  const commission_paise = Math.round(base_paise * COMMISSION_RATE);
  const gst_on_commission_paise = Math.round(commission_paise * GST_RATE);
  const total_paise = base_paise + commission_paise + gst_on_commission_paise;
  const release_per_image_paise = Math.floor(base_paise / image_quota);
  const residual_paise = base_paise - release_per_image_paise * image_quota;
  return {
    base_paise,
    commission_paise,
    gst_on_commission_paise,
    total_paise,
    release_per_image_paise,
    residual_paise,
  };
}

export type WithdrawalDeductions = {
  gross_paise: number;
  tcs_paise: number;
  tds_paise: number;
  gst_output_paise: number;
  net_paise: number;
};

export function calculateWithdrawalDeductions(
  gross_paise: number,
  hasGstin: boolean
): WithdrawalDeductions {
  const tcs_paise = Math.round(gross_paise * TCS_RATE);
  const tds_paise = Math.round(gross_paise * TDS_RATE);
  const gst_output_paise = hasGstin ? Math.round(gross_paise * GST_RATE) : 0;
  const net_paise = gross_paise - tcs_paise - tds_paise - gst_output_paise;
  return { gross_paise, tcs_paise, tds_paise, gst_output_paise, net_paise };
}

export function calculateRefundOnExpiry(
  base_paise: number,
  image_quota: number,
  images_approved: number
): number {
  const release_per_image = Math.floor(base_paise / image_quota);
  const residual = base_paise - release_per_image * image_quota;
  const remaining_slots = image_quota - images_approved;
  const base_refund = remaining_slots * release_per_image;
  // Residual goes to brand if ANY slots unused; to creator if all used (handled separately)
  return base_refund + (remaining_slots > 0 ? residual : 0);
}
```

- [ ] **Step 3: Run tests pass**
- [ ] **Step 4: Commit**: `feat(ledger): pure math for checkout + deductions + refunds`

---

### Task 16: Ledger commit helpers (DB writes with transaction safety)

**Files:**
- Create: `src/lib/ledger/commit.ts`
- Create: `src/lib/ledger/__tests__/commit.test.ts`

- [ ] **Step 1: Test — commit functions are transactional**

Functions needed:
- `commitTopUp({ brand_id, top_up_id, amount_paise, credits })` — inserts credit_transactions + updates brand.credits_balance_paise in single transaction
- `commitLicenseAcceptance({ license_request_id })` — runs the escrow lock + platform revenue + GST output entries atomically
- `commitImageApproval({ license_request_id })` — releases one image's worth from escrow to creator pending_balance
- `commitWithdrawalDeductions({ withdrawal_request_id })` — inserts tcs_ledger + tds_ledger + gst_output_ledger + updates withdrawal state
- `commitWithdrawalSuccess({ withdrawal_request_id, cf_utr })` — finalizes, zeroes pending_balance
- `commitWithdrawalFailure({ withdrawal_request_id, reason })` — reverses, restores pending_balance
- `commitExpiryRefund({ license_request_id })` — pro-rata refund to brand credits

Each uses Postgres transaction via Supabase RPC or raw SQL via admin client.

- [ ] **Step 2: Implement** — use `admin.rpc()` with PL/pgSQL stored procedures OR explicit transactions via admin.from() calls with manual rollback pattern. Recommend stored procedures for atomicity.

```sql
-- Example: migrations/00024 includes a procedure
create or replace function public.commit_license_acceptance(p_license_request_id uuid)
returns void language plpgsql as $$
declare
  v_request record;
begin
  select * into v_request from public.license_requests 
    where id = p_license_request_id for update;
  
  if v_request.status != 'accepted' then
    raise exception 'License request not in accepted state';
  end if;
  
  -- Lock escrow
  insert into public.escrow_ledger (
    license_request_id, creator_id, brand_id, type, amount_paise,
    creator_locked_paise, creator_pending_paise, brand_refundable_paise
  ) values (
    p_license_request_id, v_request.creator_id, v_request.brand_id, 
    'lock', v_request.base_paise,
    v_request.base_paise, 0, 0
  );
  
  -- Recognize platform revenue
  insert into public.platform_revenue_ledger (
    license_request_id, type, amount_paise, accounting_period
  ) values (
    p_license_request_id, 'commission', v_request.commission_paise, 
    date_trunc('month', now())::date
  );
  
  insert into public.platform_revenue_ledger (
    license_request_id, type, amount_paise, accounting_period
  ) values (
    p_license_request_id, 'gst_on_commission', v_request.gst_on_commission_paise,
    date_trunc('month', now())::date
  );
  
  -- GST output (from brand's perspective, collected by platform)
  insert into public.gst_output_ledger (
    reference_type, reference_id, brand_id, type, 
    taxable_value_paise, rate_percent, tax_paise, accounting_period
  ) values (
    'license_request', p_license_request_id, v_request.brand_id, 'output_on_commission',
    v_request.commission_paise, 18.00, v_request.gst_on_commission_paise, date_trunc('month', now())::date
  );
  
  -- Transition state
  update public.license_requests
  set status = 'active',
      activated_at = now(),
      expires_at = now() + (v_request.validity_days || ' days')::interval
  where id = p_license_request_id;
end;
$$;
```

Then `commit.ts` calls:
```typescript
export async function commitLicenseAcceptance(licenseRequestId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("commit_license_acceptance", {
    p_license_request_id: licenseRequestId,
  });
  if (error) throw error;
}
```

Similar procedures for the other commits. Put all procedures in migration `00028_ledger_procedures.sql`.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**: `feat(ledger): transactional commit helpers via PL/pgSQL procedures`

---

## PHASE 4: Credit system APIs

### Task 17: Credit top-up API

**Files:**
- Create: `src/app/api/credits/top-up/route.ts`
- Create: `src/app/api/credits/top-up/__tests__/route.test.ts`
- Create: `src/domains/credit/types.ts` (Zod schema for pack selection)

- [ ] **Step 1: Test — POST /api/credits/top-up** 

Authenticated brand user POSTs `{ pack: 'medium' }`. Expects: creates `credit_top_ups` row (initiated), calls Cashfree createTopUpOrder, returns `{ orderId, paymentSessionId }`.

- [ ] **Step 2: Implement** — route reads body, validates pack, computes price/credits from `CREDIT_PACKS` config, inserts row, calls Cashfree, returns session id.

- [ ] **Step 3: Commit**: `feat(api): credit top-up order creation`

---

### Task 18: Credits balance API

**Files:**
- Create: `src/app/api/credits/balance/route.ts`

- [ ] **Step 1: Test — GET returns current balance + recent transactions**
- [ ] **Step 2: Implement** — reads `brands.credits_balance_paise` + last 20 `credit_transactions`.
- [ ] **Step 3: Commit**: `feat(api): credits balance + history`

---

### Task 19: Wire top-up completion via webhook

**Files:**
- Create: `src/app/api/cashfree/webhook/route.ts`

- [ ] **Step 1: Test — PAYMENT_SUCCESS flips status + adds credits**

- [ ] **Step 2: Implement**

```typescript
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const event = parseWebhook(rawBody, {
    timestamp: req.headers.get("x-webhook-timestamp")!,
    signature: req.headers.get("x-webhook-signature")!,
  });
  
  // Store raw event for debug/replay
  await admin.from("webhook_events").insert({ 
    source: "cashfree", event_type: event.type, payload: JSON.parse(rawBody)
  });
  
  switch (event.type) {
    case "PAYMENT_SUCCESS_WEBHOOK":
      await handleTopUpSuccess(event.data);
      break;
    case "PAYMENT_FAILED_WEBHOOK":
      await handleTopUpFailed(event.data);
      break;
    case "TRANSFER_SUCCESS":
      await handleWithdrawSuccess(event.data);
      break;
    case "TRANSFER_FAILED":
    case "TRANSFER_REVERSED":
      await handleWithdrawFailed(event.data);
      break;
  }
  
  return Response.json({ ok: true });
}

async function handleTopUpSuccess(data: Record<string, unknown>) {
  const orderId = data.order_id as string;
  const topUp = await admin.from("credit_top_ups")
    .select("*").eq("cf_order_id", orderId).single();
  if (!topUp.data || topUp.data.status === "success") return; // idempotent
  
  await commitTopUp({
    brand_id: topUp.data.brand_id,
    top_up_id: topUp.data.id,
    amount_paise: topUp.data.amount_paise,
    credits: topUp.data.credits,
  });
}
// ... similar for others
```

- [ ] **Step 3: Commit**: `feat(cashfree): webhook handler with event routing`

---

## PHASE 5: License system APIs

### Task 20: Creator license listings API (CRUD)

**Files:**
- Create: `src/app/api/licenses/listings/route.ts`
- Create: `src/app/api/licenses/listings/[id]/route.ts`

- [ ] **Step 1: Tests** for GET (own listings), POST (create new), PATCH (update existing), DELETE (soft-delete via is_active=false)

- [ ] **Step 2: Implement** — Zod validated, creator-scoped, enforces unique template per creator

- [ ] **Step 3: Commit**: `feat(api): creator license listings CRUD`

---

### Task 21: Brand licenses — request endpoint

**Files:**
- Create: `src/app/api/licenses/request/route.ts`

- [ ] **Step 1: Test — POST /api/licenses/request**

Brand POSTs `{ creator_id, template, brand_notes?, reference_images?[] }`. Expects:
- Validates creator has active listing for template
- Calculates checkout via `calculateLicenseCheckout`
- Checks brand has sufficient credits (balance ≥ total_paise)
- Creates `license_requests` row (status=requested, pricing snapshot frozen)
- Reserves credits via credit_transactions (type=reserve)
- Returns request payload

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**: `feat(api): brand license request with credit reservation`

---

### Task 22: Creator accept/reject endpoints

**Files:**
- Create: `src/app/api/licenses/[id]/accept/route.ts`
- Create: `src/app/api/licenses/[id]/reject/route.ts`

- [ ] **Step 1: Test — accept generates contract + escrow lock**

Creator POSTs accept. Captures IP + UA + scroll_depth in headers/body. Expects:
- Contract PDF generated, uploaded to R2
- `license_contracts` row inserted
- `commit_license_acceptance` RPC called → escrow ledger + platform revenue + status → active
- Brand notified (inngest event `license/accepted`)

- [ ] **Step 2: Implement accept**

- [ ] **Step 3: Implement reject** — just flips status + credits released from reserve + brand notified

- [ ] **Step 4: Commit**: `feat(api): creator accept/reject license requests`

---

### Task 23: Contract PDF viewer API

**Files:**
- Create: `src/app/api/licenses/[id]/contract/route.ts`

- [ ] **Step 1: Test — GET returns signed R2 URL for authorized parties only**
- [ ] **Step 2: Implement** — validates caller is brand_id or creator_id on request, fetches r2_path, generates signed URL (1h TTL)
- [ ] **Step 3: Commit**: `feat(api): contract PDF signed URL`

---

## PHASE 6: Contract generation

### Task 24: Contract markdown template

**Files:**
- Create: `src/lib/contracts/template.ts`
- Create: `src/lib/contracts/__tests__/template.test.ts`

- [ ] **Step 1: Test — template produces valid markdown with all required sections**
- [ ] **Step 2: Implement** — function `generateContract({ request, creator, brand, licenseListing })` returns `{ markdown: string, terms: ContractTerms }`. Includes all 12 sections from spec.
- [ ] **Step 3: Commit**: `feat(contracts): markdown template v1.2026-04`

---

### Task 25: Markdown → PDF renderer

**Files:**
- Create: `src/lib/contracts/pdf-render.ts`

Install: `pnpm add @react-pdf/renderer marked`

- [ ] **Step 1: Implement** — uses `marked` to parse markdown, custom renderer emits `@react-pdf/renderer` primitives. Outputs Buffer.
- [ ] **Step 2: Test — generated PDF has 1+ pages + searchable text**
- [ ] **Step 3: Commit**: `feat(contracts): PDF renderer`

---

### Task 26: Contract storage (R2 upload + retrieve)

**Files:**
- Create: `src/lib/contracts/storage.ts`

- [ ] **Step 1: Test — upload returns R2 path + SHA256 hash**
- [ ] **Step 2: Implement** — uses existing R2 client, path pattern `contracts/{license_request_id}/v1.pdf`, TTL tagged, adds SHA256 for integrity
- [ ] **Step 3: Commit**: `feat(contracts): R2 storage + retrieval helpers`

---

## PHASE 7: Withdrawal system

### Task 27: KYC submission endpoints (PAN, Aadhaar, bank)

**Files:**
- Create: `src/app/api/kyc/pan/route.ts`
- Create: `src/app/api/kyc/aadhaar/route.ts`
- Create: `src/app/api/kyc/bank/route.ts`
- Create: `src/app/api/kyc/status/route.ts`

- [ ] **Step 1: Tests for each** — validates input, calls Cashfree KYC, updates `creator_kyc` row
- [ ] **Step 2: Implement each**
- [ ] **Step 3: Commit**: `feat(kyc): PAN + Aadhaar + bank verification APIs`

---

### Task 28: Withdrawal creation endpoint

**Files:**
- Create: `src/app/api/withdrawals/create/route.ts`

- [ ] **Step 1: Test — creator POSTs withdraw, deductions calculated, Cashfree transfer initiated**

Expects:
- Creator KYC verified + bank active + penny-drop passed
- pending_balance_paise ≥ ₹500
- Computes deductions via `calculateWithdrawalDeductions`
- Inserts `withdrawal_requests` row (status=deductions_applied)
- Commits tax ledgers atomically via RPC
- Calls Cashfree createTransfer
- Updates row to status=processing
- Returns payload

- [ ] **Step 2: Implement**
- [ ] **Step 3: Commit**: `feat(api): creator withdrawal with deductions + Cashfree transfer`

---

### Task 29: Withdrawal status webhook handlers

Already scaffolded in Task 19 — verify transfer.success / transfer.failed flow end-to-end.

- [ ] **Step 1: Integration test — simulated webhook flips state**
- [ ] **Step 2: Fix any gaps**
- [ ] **Step 3: Commit**: `feat(withdrawal): webhook-driven state transitions`

---

## PHASE 8: Scheduled jobs

### Task 30: Daily license expiry job

**Files:**
- Create: `src/inngest/functions/license/expire-licenses.ts`
- Modify: `src/inngest/index.ts` (register function)

- [ ] **Step 1: Test — function scans active licenses past expires_at, triggers refund**

- [ ] **Step 2: Implement**

```typescript
export const expireLicenses = inngest.createFunction(
  { id: "expire-licenses", retries: 3 },
  { cron: "0 1 * * *" },  // 1 AM daily IST
  async ({ step }) => {
    const admin = createAdminClient();
    const expired = await step.run("fetch-expired", async () => {
      const { data } = await admin.from("license_requests")
        .select("id, base_paise, image_quota, images_approved")
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString());
      return data ?? [];
    });
    
    for (const request of expired) {
      await step.run(`refund-${request.id}`, async () => {
        await admin.rpc("commit_expiry_refund", { p_license_request_id: request.id });
      });
    }
    
    return { expired_count: expired.length };
  }
);
```

- [ ] **Step 3: Commit**: `feat(inngest): daily license expiry + pro-rata refund`

---

### Task 31: Cashfree reconciliation cron

**Files:**
- Create: `src/inngest/functions/reconcile/cashfree-reconcile.ts`

- [ ] **Step 1: Test — finds stuck txns + queries Cashfree + updates**
- [ ] **Step 2: Implement** — runs every 6h, scans `credit_top_ups` and `withdrawal_requests` in processing state > 6h, queries Cashfree API, reconciles

- [ ] **Step 3: Commit**: `feat(inngest): Cashfree reconciliation cron`

---

## PHASE 9: Razorpay retirement

### Task 32: Find all Razorpay references

- [ ] **Step 1: Grep the codebase**

```bash
grep -rn "razorpay" src --include="*.ts" --include="*.tsx" -i
grep -rn "RAZORPAY" src --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Document findings in PR description**

Create `docs/superpowers/runbooks/razorpay-migration.md` listing every occurrence.

---

### Task 33: Delete Razorpay code

**Files to delete:**
- `src/lib/payments/razorpay/` (entire directory)
- `src/app/api/wallet/create-order/route.ts`
- `src/app/api/wallet/verify-payment/route.ts`
- Any UI components that import Razorpay SDK

- [ ] **Step 1: Verify no new code paths depend on Razorpay**
- [ ] **Step 2: Delete files**
- [ ] **Step 3: Update env docs** — remove RAZORPAY_* vars from `.env.example`, add CASHFREE_* vars
- [ ] **Step 4: Remove package** — `pnpm remove razorpay`
- [ ] **Step 5: Run build + tests**
- [ ] **Step 6: Commit**: `feat: retire Razorpay — Cashfree is live`

---

## PHASE 10: Seed data + runbooks

### Task 34: Seed license templates + starter credits for existing brands

**Files:**
- Create: `supabase/migrations/00029_seed_starter_data.sql`

- [ ] **Step 1: Write migration**

```sql
-- Give every existing brand 5 free credits (₹250)
insert into public.credit_transactions (brand_id, type, amount_paise, balance_after_paise, description)
select id, 'bonus', 25000, 25000, 'Revamp migration starter credits'
from public.brands
where credits_balance_paise = 0;

update public.brands set credits_balance_paise = 25000, lifetime_topup_paise = 0
where credits_balance_paise = 0;

-- For existing creators with is_active=true: auto-create default Creation License listing
insert into public.creator_license_listings (creator_id, template, price_paise, image_quota, validity_days)
select id, 'creation', 600000, 25, 90
from public.creators
where is_active = true
on conflict (creator_id, template) do nothing;
```

- [ ] **Step 2: Apply + verify via dashboard**

- [ ] **Step 3: Commit**: `feat(seed): starter credits + default license listings`

---

### Task 35: Ops runbook

**Files:**
- Create: `docs/superpowers/runbooks/cashfree-operations.md`

- [ ] **Step 1: Write runbook** covering:
  - How to check a stuck txn
  - How to reconcile manually
  - How to retry a failed payout
  - How to dispute-hold escrow
  - Cashfree support escalation contact
  - Monthly GST / TDS filing checklist

- [ ] **Step 2: Commit**: `docs(runbook): Cashfree ops handbook`

---

## Verification before merge

Once all tasks complete, verify end-to-end:

- [ ] **Fresh brand signup** → 5 free credits granted automatically
- [ ] **Brand top-up** → Cashfree Collect test payment → credits appear in balance
- [ ] **Creator creates listing** → visible to brands (staging only)
- [ ] **Brand requests license** → pricing math correct to paise, credits reserved
- [ ] **Creator accepts** → contract PDF in R2, escrow locked in ledger, status=active
- [ ] **KYC flow** → PAN + Aadhaar + penny-drop pass via Cashfree sandbox
- [ ] **Withdrawal test** → deductions correct, Cashfree Payouts test mode success, bank simulated receive
- [ ] **License expiry** → cron runs, pro-rata refund to brand credits verified
- [ ] **Reconciliation** → simulate stuck webhook, cron catches + resolves
- [ ] **All Razorpay code removed** — `grep -rn razorpay src` returns nothing
- [ ] **Test suite passing** — `pnpm vitest run` all green
- [ ] **Build passing** — `pnpm build` clean
- [ ] **Type check passing** — `pnpm tsc --noEmit` clean

On success: PR with Chunk C done → ready for Chunk B + D implementation plans.

---

## Notes for executing engineer

1. **Always use paise.** Never `number` for amounts that aren't paise. If you see `amount` without a `_paise` suffix in new code, reject in review.
2. **Every state transition logs an audit_log row.** Use the existing audit log table.
3. **Cashfree sandbox first.** Never point at production until every flow has passed 3x in sandbox.
4. **RLS policies on all new tables.** Never skip — privacy law requirement.
5. **Webhooks are idempotent.** Re-delivery is normal. Check status before mutating.
6. **Ledgers never UPDATE, only INSERT.** If you need to "correct", insert a reversal entry.
7. **Test with real numbers from spec.** The worked example (Amul × Priya → ₹7,274.40) is the golden test case. If implementation doesn't match that exactly, it's broken.

*End of Chunk C implementation plan.*
