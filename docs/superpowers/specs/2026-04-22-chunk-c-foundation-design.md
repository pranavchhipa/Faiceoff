# Chunk C — Foundation (DB + Pricing + Credits + Payout) Design

> **Context:** This is the first of 4 chunks for the Faiceoff product revamp. Chunks are sequenced foundation-first: **C → B → D → A**. Other chunks have their own specs:
> - **A** — Landing page revamp (blocked on `Faiceoff_Page_Content_Reference.pdf` read)
> - **B** — Route restructure (`/brand/*`, `/creator/*`) — separate spec
> - **D** — End-to-end flow (request → chat → approval → payout) — separate spec, depends on C

**Goal:** Replace the current campaign/wallet model with a creator-driven license marketplace running on Cashfree (Collect + Nodal + Payouts), with explicit platform fee + regulatory deductions (GST/TCS/TDS), click-to-accept digital contracts, and a credit pack top-up system.

---

## 1. Scope

### In scope (this spec)
- Schema for: credit packs, credit transactions, creator-listed licenses, license requests, contracts, escrow ledger, payout transactions, KYC state
- Retire: `lora_models` (no longer applicable — we run on Gemini), reshape `wallet_transactions` into dedicated ledger tables
- Rename: `campaigns` → `collab_sessions` (matches new terminology from flow doc)
- Rewire: existing Razorpay integration → Cashfree (Collect + Nodal + Payouts)
- Add: click-to-accept contract generator + PDF storage in R2
- Add: platform fee + GST + TCS + TDS math at correct state transitions
- Add: KYC gating on first withdrawal

### Out of scope (other specs)
- UI components / page layout (Chunk B + D)
- Chat UI between brand & creator (Chunk D)
- Approval queue UI + per-image review loop UI (Chunk D)
- Landing page / marketing copy (Chunk A)
- LoRA training pipeline removal (already happening separately)

---

## 2. Decision log

Decisions from the brainstorming dialog. Lock list — no re-debate during implementation.

| # | Decision | Choice | Rationale (short) |
|---|---|---|---|
| D1 | Payout provider | **Cashfree Payouts** | India standard, instant IMPS, TDS automation |
| D2 | Payout cadence | **Creator-initiated withdraw** (min ₹500) | Marketplace standard (Fiverr model), creator trust |
| D3 | License ownership | **Template + creator override** (price/quota/validity editable; retry/commission/TDS platform-level) | Predictable products for brand, pricing freedom for creator |
| D4 | Retry / rejection policy | **3 free retries per image slot**; 4th attempt deducts ~5 credits | Balanced — safety net without AI cost abuse |
| D5 | Unused license slots at expiry | **Pro-rata refund to brand** (as credits) | Brand trust, discourages "reserve & hold" creator abuse |
| D6 | Collection provider | **Cashfree Collect** (replace Razorpay entirely) | Single vendor consolidation, one dashboard/reconciliation |
| D7 | Commission model | **18% from BRAND at contract signing** (not from creator) | Cleaner creator perception, HTML flow stated 20% on creator which we replaced |
| D8 | TCS | **1% Sec 52 CGST** — platform deducts at withdrawal, remits | Legally mandated for e-commerce operators |
| D9 | TDS | **1% Sec 194-O Income Tax** — platform deducts, remits | Legally mandated, creator claims in ITR |
| D10 | GST remittance | **Platform collects & remits on creator's behalf** | Creator UX (zero compliance headache), Meesho/Fiverr pattern |
| D11 | Contract eSign | **Click-to-accept** (IT Act 2000 + audit trail: IP + UA + timestamp). NOT Aadhaar OTP (eSign ₹10-25/txn overhead + integration complexity) | MVP speed, legally sufficient |
| D12 | Escrow container | **Cashfree Nodal account** (not platform wallet) | RBI PPI compliance — platform never holds customer money |
| D13 | License scope (MVP) | **Digital use only** (web, organic social, digital ads) — contract clause | Simple single-tier for MVP; Commercial upgrade is V2 |
| D14 | Creator pricing model | **Gross listing + live breakup UI** | Standard marketplace UX (Fiverr/Upwork), transparent tax breakdown solves "feels cheated" |
| D15 | Credit unit price | **₹50 / credit** | HTML default, keeps math round |
| D16 | Credit packs | **5 free (signup) / 10 @ ₹500 / 50 @ ₹2,250 (₹45/credit) / 200 @ ₹8,000 (₹40/credit)** | HTML default, tiered discount encourages bigger packs |
| D17 | Credit expiry | **6 months from purchase** | HTML default, standard marketplace |
| D18 | License templates | **Creation License** (default ₹6,000 / 25 images / 90 days) + **Creation+Promotion** (default ₹15,000 / 10 images + 1 IG post / 30 days) | HTML defaults; creator edits price/quota/validity |
| D19 | Min withdrawal | **₹500 pending balance** | Keeps Cashfree txn fee (~₹5-10) sensible ratio |
| D20 | Creator KYC for payout | **PAN + Aadhaar + bank penny-drop** via Cashfree KYC APIs | Cashfree handles; no separate vendor |

---

## 3. Architecture principles

1. **Money never sits on platform balance sheet.** All customer money lives in Cashfree Nodal. Platform reads balances, writes instructions.
2. **Ledger tables are append-only.** `credit_transactions`, `escrow_transactions`, `payout_transactions` never update rows — only INSERT. Status is derived or carried via FSM row.
3. **Every money-affecting state change has a DB row + an audit_log entry.** Dispute-ready.
4. **Paise, not rupees.** All money columns `*_paise integer`. Never store `numeric`/`decimal` for money.
5. **Two-phase commit across Cashfree + DB.** Pending Cashfree call → DB row in PENDING state → Cashfree webhook flips to SUCCESS/FAILED. Reconciliation job catches orphans nightly.
6. **Single source of truth for prices** — creator listings. No price duplicated in request/escrow. Quotes captured at request-time in JSONB snapshot for audit.
7. **Idempotency on every Cashfree-touching endpoint.** Request ID from client, stored unique-indexed in DB.

---

## 4. Money flow & state machines

### 4.1 High-level architecture

```
         Brand pays (UPI/card/netbanking)
                    │
                    ▼
         ┌─────────────────────┐
         │  Cashfree Collect   │   (MDR: UPI free <₹2L, cards 1.75%)
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────────────┐
         │  CASHFREE NODAL ACCOUNT     │  ← escrow lives here
         │  (trust account, not ours)  │     platform balance sheet is clean
         └──────────┬──────────────────┘
                    │
                    │ on each approved image → split instruction
                    ▼
         ┌─────────────────────┐
         │  Cashfree Payouts   │   (IMPS ₹5-10/txn, UPI ₹1.99)
         └──────────┬──────────┘
                    │
                    ▼
              Creator bank
```

### 4.2 State machines

```
LICENSE_REQUEST:
  DRAFT → REQUESTED → ACCEPTED → ACTIVE → COMPLETED
                   ↘ REJECTED  ↘ EXPIRED (pro-rata refund to brand credits)
                                ↘ CANCELLED (dispute resolved)

IMAGE (within license):
  PENDING → GENERATING → GENERATED → AWAITING_APPROVAL
                                  ↘ APPROVED → DELIVERED
                                  ↘ REJECTED (retry_count++; if ≥3, consume slot + deduct credit for next)

WITHDRAWAL:
  REQUESTED → KYC_CHECK → DEDUCTIONS_APPLIED → PROCESSING (Cashfree) → SUCCESS
                                                                    ↘ FAILED (balance restored)

CREDIT_TOP_UP:
  INITIATED → PROCESSING (Cashfree) → SUCCESS (credits added) 
                                   ↘ FAILED (no change)
```

### 4.3 Brand money lifecycle

```
1. TOP-UP
   Brand pays via Cashfree Collect
     → credit_top_ups row (PENDING)
     → webhook SUCCESS
     → credits_balance += N (based on pack)
     → credit_transactions row (type=TOPUP)
   Money lands in Cashfree Nodal, tagged to brand_id

2. LICENSE REQUEST
   Brand picks creator + template (Creation OR Creation+Promotion)
   System snapshots: base_paise, commission_paise, gst_paise, total_paise
   Credits reserved (not spent): credit_transactions (type=RESERVE)
   license_request row (status=REQUESTED, amount snapshot frozen)

3. CREATOR ACCEPTS + SIGNS CONTRACT
   Contract PDF generated + stored in R2
   Click-to-accept logged (IP + UA + timestamp)
   license_request.status = ACTIVE
   Credits committed: credit_transactions (type=SPEND)
   Escrow split in nodal:
     creator_portion_paise → escrow_ledger (LOCKED)
     platform_revenue_paise → platform_revenue_ledger (recognized)
     gst_on_commission_paise → gst_output_ledger

4. PER IMAGE APPROVAL
   For each approved image:
     release_per_image = creator_portion_paise / image_quota
     escrow_ledger row (type=RELEASE, from=LOCKED to=CREATOR_PENDING)
     creator.pending_balance_paise += release_per_image
     license_request.images_approved += 1

5. LICENSE COMPLETE OR EXPIRED
   If images_approved == image_quota → status=COMPLETED
   If expires_at passed with unused slots:
     refund_paise = (image_quota - images_approved) × release_per_image
     escrow_ledger row (type=REFUND_TO_BRAND)
     credit_transactions row (type=REFUND) adds credits back to brand
     status=EXPIRED
```

### 4.4 Creator payout lifecycle

```
1. ELIGIBILITY CHECK (Withdraw button click)
   ✓ creator.pending_balance_paise ≥ 50000  (₹500)
   ✓ creator_kyc.status = VERIFIED
   ✓ creator_bank_accounts has active row (penny-drop verified)

2. DEDUCTIONS CALCULATED AT WITHDRAW-TIME
   gross_paise       = creator.pending_balance_paise
   tcs_paise         = round(gross × 0.01)
   tds_paise         = round(gross × 0.01)
   gst_output_paise  = round(gross × 0.18)    # if creator has GSTIN
   net_paise         = gross - tcs - tds - gst_output
   
   withdrawal_request row (DEDUCTIONS_APPLIED)
   Ledger entries:
     escrow_ledger (CREATOR_PENDING → WITHDRAW_HELD)
     tcs_ledger (+tcs_paise)
     tds_ledger (+tds_paise)
     gst_output_ledger (+gst_output_paise)

3. CASHFREE PAYOUT API CALL
   POST /payouts { beneficiary_id, amount=net_paise, mode=IMPS }
   payout_transactions row (PROCESSING)
   Idempotency key = withdrawal_request.id

4. CASHFREE WEBHOOK
   SUCCESS:
     payout_transactions.status = SUCCESS
     creator.pending_balance_paise = 0 (or residual if partial)
     escrow_ledger (WITHDRAW_HELD → PAID_OUT)
   FAILED:
     payout_transactions.status = FAILED + failure_reason
     escrow_ledger (WITHDRAW_HELD → CREATOR_PENDING)  — restored
     creator.pending_balance_paise unchanged / restored

5. RECONCILIATION (nightly cron)
   For withdrawals stuck in PROCESSING > 24h: query Cashfree status, update accordingly
```

### 4.5 Worked example — end-to-end

**Setup:** Priya lists Creation License @ ₹6,000 / 25 images / 90 days. Amul (brand) requests.

```
STEP 1 — Amul tops up
  Cashfree Collect: Amul pays ₹8,000 → credits_balance = 200
  Nodal: +₹8,000 (brand-tagged)

STEP 2 — Amul requests Priya's license
  Checkout calculation:
    base_paise           = 600000     (₹6,000 — Priya's listed gross)
    commission_paise     = 108000     (18% × ₹6,000)
    gst_on_commission    = 19440      (18% × ₹1,080)
    total_paise          = 727440     (₹7,274.40)
  credits_reserved = 14549  (14549 credits * ₹50/100 paise = wait — fix math)
  
  (Fix: credit reservation uses paise directly. 727440 paise ÷ 50 paise/credit ≠ clean.
   Decision: credit_transactions stores amount_paise directly. "credits" is just display.
   Reservation: -727440 paise from brand's credits_balance_paise.)
  
  license_request row: REQUESTED, snapshot = {base, commission, gst} frozen

STEP 3 — Priya accepts + clicks contract
  Contract PDF → R2 → license_contracts row (accepted_at, ip, user_agent)
  license_request.status = ACTIVE
  Nodal split:
    600000 paise → escrow_ledger (LOCKED, creator=Priya)
    108000 paise → platform_revenue_ledger (COMMISSION_RECOGNIZED)
     19440 paise → gst_output_ledger (COLLECTED_FROM_BRAND)
  credit_transactions: SPEND -727440 paise (commit)

STEP 4 — 25 images generated, all approved
  release_per_image = 600000 / 25 = 24000 paise (₹240)
  After 25: Priya.pending_balance_paise = 600000 (₹6,000)

STEP 5 — Priya hits Withdraw
  gross            = 600000
  tcs (1%)         =   6000
  tds (1%)         =   6000
  gst_output (18%) = 108000
  net              = 480000   (₹4,800)
  
  Cashfree Payouts IMPS: ₹4,800 → Priya's bank (< 2 min)
  
FINAL POSITION:
  Amul paid:           ₹7,274.40
  Priya received:      ₹4,800  (+ ₹120 claimable in ITR on filing)
  Platform revenue:    ₹1,274.40 (commission + GST on commission)
  Govt collected:      ₹1,200    (GST ₹1,080 + TCS ₹60 + TDS ₹60)
  
  Verify: 7,274.40 = 4,800 + 1,274.40 + 1,200  ✓
```

---

## 5. DB schema changes

### 5.1 Tables to ADD

#### `creator_license_listings`
Creator's offerings (instances of license templates with custom price/quota/validity).

```sql
create table public.creator_license_listings (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  template text not null check (template in ('creation', 'creation_promotion')),
  price_paise integer not null check (price_paise > 0),
  image_quota integer not null check (image_quota > 0),
  validity_days integer not null check (validity_days > 0),
  ig_post_required boolean not null default false,  -- true for creation_promotion
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, template)   -- one listing per template per creator
);

create index idx_cll_creator on public.creator_license_listings(creator_id);
create index idx_cll_active on public.creator_license_listings(is_active) where is_active = true;
```

#### `license_requests`
Brand requests → creator acceptance flow. Snapshots pricing at request time.

```sql
create table public.license_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  listing_id uuid not null references public.creator_license_listings(id),
  creator_id uuid not null references public.creators(id),
  brand_id uuid not null references public.brands(id),
  status text not null check (status in (
    'draft','requested','accepted','active','rejected','expired','cancelled','completed'
  )) default 'requested',
  
  -- Snapshot of pricing at request time (frozen even if listing edits)
  base_paise integer not null,
  commission_paise integer not null,    -- 18% of base
  gst_on_commission_paise integer not null,  -- 18% of commission
  total_paise integer not null,
  image_quota integer not null,
  validity_days integer not null,
  
  -- Derived from release math
  release_per_image_paise integer not null,  -- base_paise / image_quota
  
  -- Progress
  images_requested integer not null default 0,
  images_approved integer not null default 0,
  images_rejected integer not null default 0,
  
  -- Lifecycle
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
```

#### `license_contracts`
Signed contract PDFs + click-to-accept audit trail.

```sql
create table public.license_contracts (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid not null references public.license_requests(id) on delete cascade unique,
  
  -- Contract document
  pdf_r2_path text not null,
  pdf_hash_sha256 text not null,
  template_version text not null,    -- e.g., 'v1.2026-04'
  
  -- Acceptance audit (IT Act 2000)
  creator_accepted_at timestamptz not null,
  creator_accept_ip text not null,
  creator_accept_user_agent text not null,
  brand_accepted_at timestamptz,
  brand_accept_ip text,
  brand_accept_user_agent text,
  
  -- License terms frozen at accept-time
  terms_json jsonb not null,   -- scope, usage rights, quota, price, validity
  
  created_at timestamptz not null default now()
);

create index idx_lc_lr on public.license_contracts(license_request_id);
```

#### `credit_transactions`
Append-only ledger for brand credit changes.

```sql
create table public.credit_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id),
  type text not null check (type in (
    'topup','reserve','release_reserve','spend','refund','bonus','adjustment'
  )),
  amount_paise integer not null,   -- signed: +topup, -spend, etc
  balance_after_paise integer not null,
  
  -- Reference to whatever triggered this
  reference_type text,             -- 'license_request','credit_top_up','refund','bonus'
  reference_id uuid,
  
  description text,
  created_at timestamptz not null default now()
);

create index idx_ct_brand_created on public.credit_transactions(brand_id, created_at desc);
create index idx_ct_ref on public.credit_transactions(reference_type, reference_id);
```

#### `credit_top_ups`
Brand → Cashfree Collect top-up attempts.

```sql
create table public.credit_top_ups (
  id uuid primary key default extensions.uuid_generate_v4(),
  brand_id uuid not null references public.brands(id),
  pack text not null check (pack in ('free_signup','small','medium','large')),
  credits integer not null,
  amount_paise integer not null,
  
  -- Cashfree
  cf_order_id text unique,
  cf_payment_id text,
  status text not null check (status in ('initiated','processing','success','failed','expired')) default 'initiated',
  failure_reason text,
  
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ctu_brand on public.credit_top_ups(brand_id, created_at desc);
create index idx_ctu_cf on public.credit_top_ups(cf_order_id);
```

#### `escrow_ledger`
Append-only ledger for every nodal-account movement related to licenses.

```sql
create table public.escrow_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid not null references public.license_requests(id),
  creator_id uuid references public.creators(id),
  brand_id uuid not null references public.brands(id),
  
  type text not null check (type in (
    'lock',              -- on contract accept
    'release_per_image', -- per approved image
    'refund_to_brand',   -- unused slots at expiry
    'dispute_hold',      -- freeze during dispute
    'dispute_release',
    'withdraw_hold',     -- creator hit withdraw
    'withdraw_paid',     -- Cashfree SUCCESS
    'withdraw_reversed'  -- Cashfree FAILED
  )),
  amount_paise integer not null,
  
  -- Derived state after this entry
  creator_locked_paise integer not null,     -- in escrow, not yet pending
  creator_pending_paise integer not null,    -- released, not yet withdrawn
  brand_refundable_paise integer not null,
  
  reference_type text,
  reference_id uuid,
  description text,
  
  created_at timestamptz not null default now()
);

create index idx_el_lr on public.escrow_ledger(license_request_id, created_at);
create index idx_el_creator on public.escrow_ledger(creator_id, created_at desc);
```

#### `platform_revenue_ledger`
Commission recognition + GST on commission.

```sql
create table public.platform_revenue_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  license_request_id uuid references public.license_requests(id),
  type text not null check (type in (
    'commission','gst_on_commission','commission_reversal','gst_reversal','adjustment'
  )),
  amount_paise integer not null,
  
  accounting_period date not null,  -- for GSTR filing grouping
  description text,
  
  created_at timestamptz not null default now()
);

create index idx_prl_period on public.platform_revenue_ledger(accounting_period);
create index idx_prl_lr on public.platform_revenue_ledger(license_request_id);
```

#### `gst_output_ledger`, `tcs_ledger`, `tds_ledger`
Tax collection/deduction trails. Same shape, separate tables for compliance clarity.

```sql
create table public.gst_output_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  reference_type text not null,  -- 'license_request' or 'withdrawal_request'
  reference_id uuid not null,
  creator_id uuid references public.creators(id),
  brand_id uuid references public.brands(id),
  
  type text not null check (type in (
    'output_on_commission',       -- GST platform charges brand (on commission)
    'output_on_creator_service',  -- GST on creator's service (platform remits on behalf)
    'reversal'
  )),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 18.00,
  tax_paise integer not null,
  
  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,       -- GSTR challan #
  
  created_at timestamptz not null default now()
);

create table public.tcs_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  withdrawal_request_id uuid not null references public.withdrawal_requests(id),
  creator_id uuid not null references public.creators(id),
  
  type text not null check (type in ('deducted_at_withdrawal','reversal')),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 1.00,
  tax_paise integer not null,
  
  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,    -- GSTR-8 challan #
  
  created_at timestamptz not null default now()
);

create index idx_tcs_period on public.tcs_ledger(accounting_period);
create index idx_tcs_creator on public.tcs_ledger(creator_id);

create table public.tds_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  withdrawal_request_id uuid not null references public.withdrawal_requests(id),
  creator_id uuid not null references public.creators(id),
  
  type text not null check (type in ('deducted_at_withdrawal','reversal')),
  taxable_value_paise integer not null,
  rate_percent numeric(5,2) not null default 1.00,
  tax_paise integer not null,
  
  accounting_period date not null,
  remitted_at timestamptz,
  remittance_reference text,    -- Form 26Q / TRACES challan #
  form_16a_issued_at timestamptz,
  
  created_at timestamptz not null default now()
);

create index idx_tds_period on public.tds_ledger(accounting_period);
create index idx_tds_creator on public.tds_ledger(creator_id);
```

#### `withdrawal_requests`
Creator withdrawal lifecycle.

```sql
create table public.withdrawal_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id),
  
  gross_paise integer not null,
  tcs_paise integer not null,
  tds_paise integer not null,
  gst_output_paise integer not null,
  net_paise integer not null,
  
  status text not null check (status in (
    'requested','kyc_check','deductions_applied','processing','success','failed','cancelled'
  )) default 'requested',
  failure_reason text,
  
  -- Bank (snapshot for audit, in case creator edits later)
  bank_account_number_masked text not null,  -- last 4 digits only
  bank_ifsc text not null,
  bank_name text not null,
  
  -- Cashfree
  cf_transfer_id text unique,
  cf_utr text,                     -- UTR number from bank
  cf_mode text,                    -- IMPS / NEFT
  
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wr_creator on public.withdrawal_requests(creator_id, created_at desc);
create index idx_wr_status on public.withdrawal_requests(status);
create index idx_wr_cf on public.withdrawal_requests(cf_transfer_id);
```

#### `creator_kyc`
Cashfree KYC state per creator.

```sql
create table public.creator_kyc (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  
  -- PAN
  pan_number_encrypted text,
  pan_name text,
  pan_verified_at timestamptz,
  pan_verification_status text check (pan_verification_status in ('pending','verified','mismatch','failed')),
  
  -- Aadhaar (last 4 stored + hash for dedup)
  aadhaar_last4 text,
  aadhaar_hash text unique,
  aadhaar_verified_at timestamptz,
  
  -- GSTIN (optional)
  gstin text,
  gstin_verified_at timestamptz,
  is_gstin_registered boolean not null default false,
  
  -- Cashfree beneficiary
  cf_beneficiary_id text unique,
  
  -- Aggregate state
  status text not null check (status in (
    'not_started','pan_pending','aadhaar_pending','bank_pending','verified','rejected'
  )) default 'not_started',
  
  rejected_reason text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### `creator_bank_accounts`
One or more bank accounts per creator (only one active).

```sql
create table public.creator_bank_accounts (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  
  account_number_encrypted text not null,
  account_number_last4 text not null,
  ifsc text not null,
  bank_name text not null,
  account_holder_name text not null,
  
  -- Penny-drop verification
  penny_drop_verified_at timestamptz,
  penny_drop_verified_name text,   -- name returned by bank
  name_match_score numeric(5,2),
  
  is_active boolean not null default false,
  cf_beneficiary_id text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uniq_active_bank_per_creator on public.creator_bank_accounts(creator_id) where is_active = true;
```

### 5.2 Tables to MODIFY

#### `brands`
Add credit balance (denormalized for read performance; derived from credit_transactions).

```sql
alter table public.brands 
  add column credits_balance_paise integer not null default 0,
  add column credits_reserved_paise integer not null default 0,
  add column lifetime_topup_paise integer not null default 0;

-- Trigger or app-level enforcement: credits_balance_paise = sum(credit_transactions.amount_paise) where brand_id
```

#### `creators`
Add payout state fields.

```sql
alter table public.creators
  add column pending_balance_paise integer not null default 0,
  add column lifetime_earned_gross_paise integer not null default 0,
  add column lifetime_withdrawn_net_paise integer not null default 0,
  add column kyc_status text check (kyc_status in ('not_started','in_progress','verified','rejected')) default 'not_started';
```

#### `campaigns` → `collab_sessions` (RENAME + reshape)

Rename to match new terminology. Retain history but drop lora-specific columns.

```sql
alter table public.campaigns rename to collab_sessions;

-- Link to license request
alter table public.collab_sessions
  add column license_request_id uuid references public.license_requests(id);

-- Drop old campaign-specific columns that no longer apply
alter table public.collab_sessions
  drop column if exists lora_model_id;

-- Foreign keys on dependent tables will need renaming too (see below)
```

#### `generations`
Replace `campaign_id` FK with both `license_request_id` + retain `collab_session_id` for compat.

```sql
alter table public.generations
  add column license_request_id uuid references public.license_requests(id),
  add column retry_count integer not null default 0,
  add column slot_number integer,  -- which slot within license (1..image_quota)
  add column is_free_retry boolean not null default true;

-- Index for license request
create index idx_gen_lr on public.generations(license_request_id);
```

### 5.3 Tables to REMOVE

#### `lora_models`
No longer applicable — we run on Gemini without LoRA training.

```sql
drop table public.lora_models cascade;
-- audit_log entries preserved; FK references nulled
```

#### `wallet_transactions` — REPLACED by `credit_transactions` + `escrow_ledger` + `payout_transactions`
Migrate data: historical wallet_transactions are preserved as read-only archive table, new writes go to specialized ledgers.

```sql
alter table public.wallet_transactions rename to wallet_transactions_archive;
-- Archive remains for historical lookups. All new money movement uses typed ledgers.
```

### 5.4 Migration order

New migration files (starting at `00020_`):

```
00020_create_credit_system.sql         -- credit_transactions, credit_top_ups, brand column adds
00021_create_license_system.sql        -- creator_license_listings, license_requests, license_contracts
00022_create_escrow_ledger.sql         -- escrow_ledger, platform_revenue_ledger
00023_create_tax_ledgers.sql           -- gst_output, tcs, tds
00024_create_withdrawal_system.sql     -- withdrawal_requests, creator_kyc, creator_bank_accounts, creators columns
00025_rename_campaigns_to_sessions.sql -- campaigns → collab_sessions + dependent FKs
00026_retire_lora_models.sql           -- drop lora_models, drop lora_training_bucket
00027_archive_wallet_transactions.sql  -- rename to _archive, seal against writes
```

---

## 6. Cashfree integration

### 6.1 Accounts needed
- **Cashfree Payment Gateway** (Collect product) — brand → platform top-ups
- **Cashfree Nodal** (Escrow product) — holds brand money + creator escrow
- **Cashfree Payouts** — creator bank transfers
- **Cashfree KYC** (PAN + Aadhaar + penny-drop APIs)

Single merchant account, all products linked. Single dashboard for reconciliation.

### 6.2 Env variables

```
CASHFREE_MODE=test                 # or 'prod'
CASHFREE_APP_ID=...
CASHFREE_SECRET_KEY=...
CASHFREE_WEBHOOK_SECRET=...
CASHFREE_NODAL_VIRTUAL_ACCOUNT_ID=... # assigned by Cashfree
CASHFREE_PAYOUT_TRANSFER_MODE=IMPS
```

### 6.3 Webhook handlers

Single webhook endpoint `/api/cashfree/webhook` with event routing:

| Event | Handler action |
|---|---|
| `payment.success` | Flip `credit_top_ups.status` → SUCCESS, add credits |
| `payment.failed` | Flip `credit_top_ups.status` → FAILED, log reason |
| `payout.success` | Flip `withdrawal_requests.status` → SUCCESS, zero pending_balance |
| `payout.failed` | Flip status → FAILED, restore pending_balance via escrow_ledger reversal |
| `payout.reversal` | Rare — bank returned; same as failed + alert admin |

Webhook security: HMAC-SHA256 signature verification using `CASHFREE_WEBHOOK_SECRET`. Store raw payload in `webhook_events` table for replay/debug.

### 6.4 Files to touch

**Create:**
- `src/lib/payments/cashfree/client.ts` — HTTP client, signature helpers
- `src/lib/payments/cashfree/collect.ts` — create order, verify payment
- `src/lib/payments/cashfree/payouts.ts` — create transfer, check status, beneficiary CRUD
- `src/lib/payments/cashfree/nodal.ts` — escrow split/release instructions
- `src/lib/payments/cashfree/kyc.ts` — PAN/Aadhaar/penny-drop APIs
- `src/lib/payments/cashfree/webhook.ts` — signature verify, event types
- `src/app/api/cashfree/webhook/route.ts` — webhook endpoint
- `src/app/api/credits/top-up/route.ts` — initiate top-up
- `src/app/api/withdrawals/create/route.ts` — creator-initiated withdraw
- `src/app/api/kyc/submit/route.ts` — submit PAN/Aadhaar/bank

**Delete/retire:**
- `src/lib/payments/razorpay/` — entire directory
- `src/app/api/wallet/create-order/route.ts` — replaced by credits/top-up
- `src/app/api/wallet/verify-payment/route.ts` — replaced by Cashfree webhook

### 6.5 Reconciliation job

Nightly cron via Inngest scheduled function:

```
event: 'cashfree/reconcile'
cron: '0 2 * * *'   # 2 AM daily

For each table (credit_top_ups, withdrawal_requests, payout_transactions):
  Find rows stuck in 'processing' or 'initiated' > 6h
  Query Cashfree API: GET /status/{id}
  Update DB to match Cashfree truth
  If Cashfree says SUCCESS but DB says PROCESSING: alert (missed webhook)
  If Cashfree says FAILED but DB says PROCESSING: mark failed, restore balances
  If both PROCESSING > 48h: alert admin for manual intervention
```

---

## 7. Contract system

### 7.1 Contract template

Single versioned template stored in repo (not DB): `src/lib/contracts/templates/license-v1.2026-04.ts`

Exports a function: `generateContract(request: LicenseRequest, creator: Creator, brand: Brand): { markdown: string; terms: ContractTerms }`.

Markdown fed into HTML-to-PDF renderer (use `@react-pdf/renderer` or `pdf-lib`).

### 7.2 Contract sections (fixed structure)

1. **Parties** — Creator legal name + Brand company name + GSTIN (if any)
2. **Likeness grant** — creator grants brand right to use AI-generated content featuring creator's likeness, within scope
3. **Scope — Digital use only** (MVP clause, verbatim):
   > *"Grant is limited to: (a) Brand's owned website; (b) Brand's organic social media posts; (c) Brand's digital paid advertising on Meta, Google, and equivalent platforms. Excluded: television broadcast, print media, outdoor/out-of-home media, and film. Commercial use beyond this scope requires a separate license."*
4. **Duration** — validity_days from activation
5. **Image quota & retry policy** — quota, 3 free retries per slot, 4th attempt paid
6. **Fees & deductions** — snapshot of pricing breakdown shown to both parties
7. **IP ownership**
   - Creator retains: face + likeness IP
   - Brand receives: limited-use license within scope, for validity period
   - Generated image file copyright: platform (since AI output), licensed to brand within scope
8. **Representations** — creator confirms they own their likeness rights
9. **Termination** — dispute → platform mediation → possible refund
10. **DPDP consent** — face data processing consent
11. **Governing law** — Laws of India, exclusive jurisdiction: courts at Mumbai, Maharashtra
12. **Acceptance** — click-to-accept log (IP, UA, timestamp) for both parties

### 7.3 Click-to-accept flow

```
Creator flow:
1. License request arrives → creator sees preview
2. Click "View contract" → server generates PDF + markdown preview
3. Scroll-to-bottom gate (UI): "I have read and agree" checkbox enabled only after scroll
4. Click "Accept & sign" → POST /api/license-requests/{id}/accept
5. Server:
   a. Re-generates contract PDF (ensure template matches at accept time)
   b. Computes SHA256 of PDF
   c. Uploads to R2: contracts/{license_request_id}/v1.pdf
   d. Inserts license_contracts row with accept_ip, accept_ua, timestamp
   e. Transitions license_request: REQUESTED → ACCEPTED → ACTIVE
   f. Triggers nodal escrow lock via Cashfree
   g. Audit log: CONTRACT_ACCEPTED event
6. Creator redirected to active licenses dashboard

Brand flow (symmetric):
- Brand initially clicks "Request license" → implicit agreement to T&C
- When creator accepts, brand sees "Active" status; no second sign required
- (Optional V2: dual-side explicit acceptance for high-value licenses)
```

### 7.4 Legal validity

Click-to-accept is enforceable under:
- **Information Technology Act 2000**, Sec 10A — electronic records recognized as valid contracts
- **Indian Contract Act 1872** — offer + acceptance + consideration all present
- **IT Rules 2011 / DPDP Act 2023** — consent explicit + granular

Audit trail (IP + UA + timestamp + scroll-to-bottom gate + T&C version hash) is sufficient for civil enforcement. We are NOT using this for criminal-liability scenarios (e.g., contested fraud) — those would require Aadhaar eSign, which is a V2 feature.

### 7.5 PDF storage

- R2 bucket: `faiceoff-contracts` (new)
- Path: `contracts/{license_request_id}/{version}.pdf`
- Access: signed URL (1h TTL) served via API, never public
- Retention: indefinite (legal record)

---

## 8. Math reference (for implementer)

All calculations in paise. Rounding: banker's rounding (ROUND_HALF_EVEN) for tax calculations to avoid bias.

```typescript
// Brand checkout totals (on license request)
const base_paise = listing.price_paise;
const commission_paise = Math.round(base_paise * 0.18);
const gst_on_commission_paise = Math.round(commission_paise * 0.18);
const total_paise = base_paise + commission_paise + gst_on_commission_paise;

// Per image release (on approval)
const release_per_image_paise = Math.floor(base_paise / image_quota);
// Residual handling: if base_paise not evenly divisible by image_quota, residual = base_paise - (release_per_image_paise * image_quota).
// On the FINAL approved image of the license (when images_approved transitions to image_quota), release = release_per_image_paise + residual.
// On expiry with unused slots: residual stays in escrow and is included in the brand's pro-rata refund.
// This ensures total_released + total_refunded = base_paise exactly — no orphan paise.

// Creator withdrawal deductions
const gross_paise = creator.pending_balance_paise;
const tcs_paise = Math.round(gross_paise * 0.01);
const tds_paise = Math.round(gross_paise * 0.01);
const gst_output_paise = creator_has_gstin ? Math.round(gross_paise * 0.18) : 0;
const net_paise = gross_paise - tcs_paise - tds_paise - gst_output_paise;

// Pro-rata refund on expiry
const unused_slots = image_quota - images_approved;
const refund_paise = unused_slots * release_per_image_paise;
```

### Credits to paise mapping
- Credits are a display abstraction. Internally everything is paise.
- Pack purchase: ₹X pays → `amount_paise = X * 100`, `credits = amount_paise / 50`
- License request deducts `total_paise` from `brand.credits_balance_paise` directly
- Credits shown in UI = `credits_balance_paise / 50`

### Credit pack pricing table

| Pack | Credits | Price | Price/credit | Bonus |
|---|---|---|---|---|
| Free signup | 5 | ₹0 | — | One-time on email-verified signup |
| Small | 10 | ₹500 | ₹50 | — |
| Medium | 50 | ₹2,250 | ₹45 | 10% off |
| Large | 200 | ₹8,000 | ₹40 | 20% off |

---

## 9. Security & compliance

### 9.1 Encryption at rest
- `creator_kyc.pan_number_encrypted`, `creator_bank_accounts.account_number_encrypted` — pgcrypto `pgp_sym_encrypt` with key in env
- `aadhaar_last4` + `aadhaar_hash` only — never store full Aadhaar (UIDAI compliance)

### 9.2 RLS policies
- Brand can only read own `credit_transactions`, `credit_top_ups`, `license_requests` (brand_id = auth.uid())
- Creator can only read own `license_requests`, `escrow_ledger`, `withdrawal_requests`, `creator_kyc`, `creator_bank_accounts`
- Admin role reads all
- Ledger tables never exposed to client (server-only via admin client)

### 9.3 DPDP Act compliance
- Face images + KYC = sensitive personal data
- Creator onboarding captures explicit consent (checkbox + audit row)
- Data retention: 7 years post account closure (statutory) then deletion
- Creator "right to erasure" flow: zero balance enforced before deletion

### 9.4 TDS/TCS filing
- Platform holds PAN of all creators (mandatory for TDS)
- Monthly filing: Form 26Q (TDS), GSTR-8 (TCS), GSTR-1/3B (GST output)
- TDS certificates (Form 16A) auto-generated quarterly, emailed to creators
- Reconciliation report: ledger totals must match filings

---

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cashfree outage | Can't process payments/payouts | Reconciliation job + manual retry UI + 99.9% SLA from Cashfree |
| Missed webhook | Status stuck | Nightly reconcile job + 6h polling fallback |
| Creator name mismatch on penny-drop | Can't pay out | Block withdrawal, force re-submit KYC with matching bank |
| GSTR filing mistake | Regulatory fine | CA review quarterly + auto-generated reports from ledgers |
| Creator disputes AI output quality | Refund claim | Existing disputes table + 48h approval window (creator can reject) |
| Credit expiry disputes | Customer complaint | 30-day-prior email reminder + extend on request (admin action) |
| Race condition on concurrent approvals | Over-release escrow | DB transaction with SELECT FOR UPDATE on license_request row |
| Contract template update mid-flight | Old licenses unclear | Version lock: each contract stores `template_version`, renders that version on display |
| Revenue recognition timing debate | CA audit query | Commission recognized at contract acceptance (performance = matchmaking + escrow lock, complete at that moment). If CA requires pro-rata recognition per approved image, `platform_revenue_ledger` supports both models — just changes the trigger point, ledger schema unchanged. |

---

## 11. What we're NOT changing in this chunk

- Inngest generation pipeline (functional — belongs to Chunk D)
- Face embedding / compliance vectors (still used)
- Auth flow (Supabase OTP)
- R2 storage setup (add new `faiceoff-contracts` bucket only)
- PostHog / Sentry observability

---

## 12. Open items for implementation plan (not decisions — wiring)

- Exact field encryption scheme for PAN/bank (pick AES-256-GCM via pgcrypto extension)
- Inngest events to emit: `license.requested`, `license.accepted`, `license.expired`, `image.approved`, `withdrawal.initiated`, `withdrawal.completed`
- Seed migration: insert 2 license templates as defaults; brand-free-credits trigger on signup
- Admin dashboard: ledger drill-down UI (separate thin admin app, not creator/brand-facing)

---

## 13. Success criteria

Chunk C is complete when:

1. ✅ Brand can top-up credits via Cashfree Collect → credits appear in balance
2. ✅ Creator can create a Creation License listing with custom price
3. ✅ Brand can request a license → total_paise calculated correctly including commission + GST
4. ✅ Creator can view contract PDF, click-to-accept → license becomes ACTIVE
5. ✅ Escrow lock visible in `escrow_ledger` after acceptance
6. ✅ Creator completes KYC (PAN + Aadhaar + bank penny-drop) via Cashfree
7. ✅ Creator withdraws → deductions correct (TCS/TDS/GST), Cashfree IMPS fires, bank receives net
8. ✅ Expired license with unused slots → pro-rata refund to brand's credits
9. ✅ Reconciliation cron handles stuck Cashfree statuses
10. ✅ Ledger totals reconcile: `brand.credits_balance_paise = sum(credit_transactions.amount_paise)` for each brand

---

*End of Chunk C spec. Chunks B and D to follow as separate spec documents. Chunk A blocked on reading the landing page content reference PDF.*
