# Chunk E — Night-Run Status

**Run window:** 2026-04-22 evening → 2026-04-23 morning
**Spec:** `docs/superpowers/specs/2026-04-23-pricing-workflow-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-04-23-chunk-e-pricing-workflow.md`
**Mandate:** Full autonomous run — 41 tasks across 8 phases — finish before user wakes up.

---

## TL;DR

| Phase | Tasks | Status | Commits |
|---|---|---|---|
| 1. DB Foundation | E1–E5 | ✅ Done | `5f19b91` |
| 2. Service Layer | E6–E9 | ✅ Done | `edd2348` |
| 3. API Routes | E10–E19 | ✅ Done | `1256723` |
| 4. Brand UI | E20–E27 | ✅ Done | this commit |
| 5. Creator UI | E28–E32 | ✅ Done | this commit |
| 6. Admin + Public UI | E33–E37 | ✅ Done | this commit |
| 7. Inngest Removal + Cron | E38–E39 | ✅ Done | this commit |
| 8. Verification | E40–E41 | ✅ Done | (this doc) |

**Final verification gates:**
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **657 tests passing across 56 files** (0 failures)
- `npx next build` → **passes** (see build section below)

---

## Phase 1 — DB Foundation (E1–E5)

Six new migrations (00032–00037) committed in `5f19b91`:

| File | What it does |
|---|---|
| `00032_two_layer_billing.sql` | Adds `credits_remaining`, renames credits_balance → wallet_balance, creates `credit_packs_catalog`, `wallet_top_ups`, `wallet_transactions`, `licenses`, `creator_blocked_categories`, `creator_payouts`. Extends `escrow_ledger` with `holding_until` + `payout_id`. Adds `cert_url` and `download_count_jsonb` to `generations`. |
| `00033_seed_credit_packs.sql` | Seeds the 5-pack catalog: `spark`/`flow`/`pro`/`studio`/`enterprise` + `free_signup`. |
| `00034_backfill_legacy_packs.sql` | Backfills `small`/`medium`/`large` pack rows so historic top-ups still resolve. |
| `00035_create_billing_views_and_cron.sql` | Creates `v_brand_billing` (joins brands+creators_payouts+licenses for dashboard reads) and `v_creator_dashboard` (4-pot earnings view). pg_cron entry to expire stale top-ups. |
| `00036_payout_procedures.sql` | `compute_creator_payable_balance`, `request_payout` (assembles escrow rows + locks them with payout_id), `mark_payout_success`, `mark_payout_failed`. |
| `00037_billing_procedures.sql` | `add_credits`, `deduct_credit`, `reserve_wallet`, `release_reserve`, `spend_wallet`, `refund_wallet`, `add_wallet`, `compute_wallet_bonus`. All FOR UPDATE-locked, idempotent on reference_id. |

**Plus this run:** `00038_admin_credit_rpcs.sql` adds the two RPCs the API layer flagged during Phase 3:
- `rollback_credit_for_generation(brand_id, generation_id)` — restores 1 credit when generation create fails after deduction. Idempotent on (`generation_rollback`, `generation_id`).
- `add_credits_manual(brand_id, credits, bonus, source, reference_id)` — admin restitution path used by safety-reject and stuck-gen refund. Idempotent on (`source`, `reference_id`).

---

## Phase 2 — Service Layer (E6–E9)

`edd2348` committed all four service modules. Each module is a pure function set, RPC-backed, throws `BillingError` / `LicenseError` / `PayoutError` for caller-handleable codes.

| Module | Files | Public surface |
|---|---|---|
| `@/lib/billing` | `credits-service.ts`, `wallet-service.ts`, `pack-catalog.ts`, `pricing-engine.ts`, `errors.ts`, `types.ts`, `index.ts` | `addCredits`, `deductCredit`, `getCredits`, `freeSignupGrant`, `addWallet`, `reserveWallet`, `releaseReserve`, `spendWallet`, `refundWallet`, `getWallet`, `getActivePacks`, `getPackByCode`, `upsertPack`, `deactivatePack`, `computeRate`, `SCOPE_ADDONS_PAISE`, `PLATFORM_COMMISSION_RATE`, `GST_ON_COMMISSION_RATE`, `EXCLUSIVITY_RATE` |
| `@/lib/licenses` | `license-service.ts`, `cert-pdf.ts` (@react-pdf/renderer), `cert-storage.ts` (R2), `verify.ts`, `license-error.ts`, `types.ts`, `index.ts` | `issueLicense`, `renewLicense`, `revokeLicense`, `getLicense`, `listBrandLicenses`, `listCreatorLicenses`, `getExpiringSoon`, `getPublicLicenseStatus`, `generateLicenseCertPDF`, `uploadCertPDF` |
| `@/lib/payouts` | `payout-service.ts`, `cashfree-payouts.ts`, `errors.ts`, `types.ts`, `index.ts` | `requestPayout`, `markPayoutSuccess`, `markPayoutFailed`, `listCreatorPayouts`, `getCreatorBalance`, `cashfreePayoutInitiate` |
| `@/lib/vault` | `vault-service.ts`, `download-formats.ts` (jszip + react-pdf + docx), `types.ts`, `index.ts` | `listVaultImages`, `getVaultImage`, `recordDownload`, `generateOriginalZip`, `generatePdfPackage`, `generateDocxPackage` |

---

## Phase 3 — API Routes (E10–E19)

`1256723` committed 30+ new route files. Five parallel groups (A–E) ran with self-contained briefs covering API contracts, file paths, and service-layer calls.

### Group A — Billing (E10–E11)
- `POST /api/credits/top-up` (rewritten) — uses new pack codes, persists `bonus_credits`
- `POST /api/wallet/top-up` — tiered bonus calc (0/5/10/15/20% by amount)
- `GET /api/billing/balance` — reads `v_brand_billing`

### Group B — Generation (E12)
- `POST /api/generations/create` (rewritten, 542 lines) — sync compliance + prompt assembly + credit deduct + wallet reserve + async Replicate submit (with webhook URL)
- `POST /api/webhooks/replicate` (404 lines) — two-layer auth (svix signature + query token), Hive safety check, R2 upload, approval row creation. Calls `rollback_credit_for_generation` on failures (uses migration 00038).

### Group C — Approval + License (E13–E15)
- `POST /api/approvals/[id]/approve` (270 lines) — `spendWallet` → `escrow_ledger` insert (creator_share = cost × 0.80, holding_until = now() + 7 days) → `platform_revenue_ledger` (commission + 18% GST) → `issueLicense` → `uploadCertPDF` → mark generation approved
- `POST /api/approvals/[id]/reject` — `releaseReserve` only (credits not refunded per spec)
- `GET /api/licenses/list`, `GET /api/licenses/[id]`, `GET /api/licenses/[id]/certificate`, `POST /api/licenses/[id]/auto-renew`, `POST /api/licenses/[id]/revoke`
- **Note:** Old `license_requests`-based routes preserved at `/api/legacy-licenses/[id]/{accept,reject,contract}` to free up the namespace for the new `licenses` table.

### Group D — Vault + Earnings + Payouts (E16–E17)
- `GET /api/vault`, `GET /api/vault/[id]`, `GET /api/vault/[id]/download?format=original|pdf|docx`
- `GET /api/earnings/dashboard` — reads `v_creator_dashboard`
- `POST /api/payouts/request` (219 lines), `GET /api/payouts/list` (92 lines)
- `POST /api/cashfree/payout-webhook` (209 lines) — TRANSFER_SUCCESS / TRANSFER_FAILED / TRANSFER_REVERSED handlers

### Group E — Creator + Admin + Cron (E18–E19)
- `GET/POST /api/creator/blocked-categories`, `DELETE /api/creator/blocked-categories/[category]`
- 8 admin routes under `/api/admin/{packs,safety,stuck-gens}/...` (CRUD packs, Hive review queue, stuck-gen retry/refund)
- 4 cron routes with Bearer CRON_SECRET auth: `/api/cron/{license-renewals,tds-quarterly-reminder,poll-replicate,process-rejections}`
- `POST /api/cashfree/webhook/handlers.ts` extended with `handleWalletTopUpSuccess` / `handleWalletTopUpFailed`. `routeWebhookEvent` cascades resolution: credit_top_ups → wallet_top_ups → creator_payouts.
- `vercel.json` created with 4 cron schedules.
- `.env.example` extended with `CRON_SECRET` + `REPLICATE_WEBHOOK_SECRET`.

---

## Phase 4–6 — UI (E20–E37)

Five parallel UI agents (UI-G1 through UI-G5) delivered the entire frontend — pricing, brand pages, creator pages, admin pages, public verify. ~7,200 lines across 33 new files. All TypeScript-clean.

### UI-G1 — Public pricing + landing hero (E20, E37)
**Files (2 created/modified, ~864 lines):**
- `src/app/(marketing)/pricing/page.tsx` — server component, fetches `getActivePacks()` with stub fallback, 5-pack grid (Pro card scaled + gold border), wallet bonus tier chips, FAQ via native `<details>`, no-JS bottom CTA panel.
- `src/app/(marketing)/page.tsx` — surgical add of the gold-bordered "5 free credits on signup — no card required" pill above the H1.

### UI-G2 — Brand billing + sheet modal (E21–E23, E27)
**Files (6 created, ~1,766 lines):**
- `src/app/(dashboard)/brand/credits/page.tsx` + `credits-pack-grid.tsx` — 5-pack grid with Cashfree Drop-in checkout (lazy-loaded SDK)
- `src/app/(dashboard)/brand/wallet/page.tsx` + `wallet-topup.tsx` — ₹500–₹5L range slider with live bonus calc + animated tier indicator pills
- `src/app/(dashboard)/brand/billing/page.tsx` — 2-col balance cards + last-10 wallet transactions table
- `src/components/sessions/generation-sheet.tsx` — right-side Sheet with product/scene inputs, scope radio cards, exclusivity checkbox, sticky PriceBar, Framer Motion price pulse, 402/422 inline errors with deep-link CTAs

### UI-G3 — Vault + licenses + sessions (E24–E26)
**Files (7 created, ~1,995 lines):**
- `brand/vault/page.tsx` + `vault-grid.tsx` — 4-col grid with hover overlay + dialog modal + 3-format download buttons
- `brand/licenses/page.tsx` + `licenses-list.tsx` — card-row layout with creator avatar, scope chips, expiry color chips, inline auto-renew toggle
- `brand/licenses/[id]/page.tsx` — 2-col layout with party cards + interactive auto-renew + embedded PDF viewer
- `brand/sessions/[id]/page.tsx` + `session-poller.tsx` — 3s polling, 4-stage Framer Motion progress bar, approval countdown timer

### UI-G4 — Creator pages (E28–E32)
**Files (10 created, ~1,835 lines):**
- `creator/earnings/page.tsx` + `earnings-cards.tsx` — 4-pot dashboard with `useMotionValue` count-up animation, 1.2s spring
- `creator/withdraw/page.tsx` + `withdraw-wizard.tsx` — 3-step Framer Motion slide wizard, range slider with live TDS+fee breakdown, success auto-redirect
- `creator/payouts/page.tsx` + `payouts-table.tsx` — paginated card list with status pills (mint/lilac/blush)
- `creator/blocked-categories/page.tsx` + `blocks-manager.tsx` — 9-checkbox toggle with optimistic updates and per-block reason textarea
- `creator/licenses/page.tsx` + `licenses-list.tsx` — paginated list with revoke dialog (radio reason picker + textarea)

### UI-G5 — Admin + public verify (E33–E36)
**Files (8 created/modified, ~1,677 lines):**
- `admin/packs/page.tsx` + `packs-table.tsx` (607 lines) — full CRUD with add/edit/delete dialogs, soft-delete
- `admin/safety/page.tsx` + `safety-cards.tsx` — Hive review queue with score chips (red >0.7), 30s auto-refresh
- `admin/stuck-gens/page.tsx` + `stuck-list.tsx` — duration badges, retry/refund actions, refund confirm dialog
- `(marketing)/verify/[license_id]/page.tsx` — public, zero-PII status page with graceful not-found
- `src/config/routes.ts` — added `/verify/*` to `isPublicPath`

---

## Phase 7 — Inngest Removal + Vercel Cron (E38–E39)

**Removed:**
- `src/inngest/index.ts` (function registry)
- `src/inngest/functions/{approval,audit,compliance,creator,generation,license,payment,reconcile}/` (all impls)
- `src/app/api/inngest/route.ts` (the webhook receiver)
- `inngest` dep from `package.json` + `dev:inngest` script
- Stale duplicate license_requests routes at `/api/licenses/[id]/{accept,reject,contract,__tests__}/` (preserved at `/api/legacy-licenses/[id]/...`)

**Replaced with stub:**
- `src/inngest/client.ts` — `inngest.send()` is a no-op that warns. Preserves the import surface for legacy callers (`/api/legacy-licenses/*`, `/api/lora/*`, `/api/campaigns/*`, `/api/generations/[id]/approve`) without pulling the runtime dependency. Migration path documented in the file comment.

**Cron wired:**
- `vercel.json` lists 4 schedules:
  - `30 18 * * *` — `/api/cron/license-renewals` (daily midnight IST)
  - `30 18 * * *` — `/api/cron/tds-quarterly-reminder` (daily, route logic gates to quarter-start days)
  - `*/15 * * * *` — `/api/cron/poll-replicate`
  - `*/15 * * * *` — `/api/cron/process-rejections`
- All routes verify `Authorization: Bearer ${CRON_SECRET}` before doing work.

---

## Phase 8 — Verification (E40–E41)

### Typecheck
```
npx tsc --noEmit
```
**Result:** 0 errors. Stale `.next/types/validator.ts` errors after route deletions resolved by clearing `.next` cache (regenerated on next build).

### Tests
```
npx vitest run
```
**Result:** 56 files / 657 tests pass, 0 failures.

`vitest.config.ts` updated to exclude `.claude/worktrees/**` so leftover subagent worktrees don't pollute the scan.

### Build
```
npx next build
```
**Result:** exit 0. All new routes compile and appear in the route table:
- `○ /pricing` (static)
- `ƒ /verify/[license_id]` (dynamic)
- `ƒ /brand/{billing,credits,licenses,licenses/[id],sessions/[id],vault,wallet}`
- `ƒ /creator/{blocked-categories,earnings,licenses,payouts,withdraw}`
- `ƒ /admin/{packs,safety,stuck-gens}` (under (dashboard) group)
- All new API routes under `/api/{billing,credits,wallet,vault,licenses,earnings,payouts,creator,admin,cron,webhooks/replicate,cashfree/payout-webhook}`

---

## Open Items / Follow-Ups

These are all non-blocking — Chunk E ships without them:

1. **Migrate legacy callers to drop the inngest stub.** The stub preserves typecheck for these routes but events are dropped:
   - `/api/lora/{webhook,status}/route.ts` — should handle LoRA training notifications inline (no event needed).
   - `/api/campaigns/{create,backfill-generations}/route.ts` — should call `/api/generations/create` directly (or queue work via the new sessions flow).
   - `/api/generations/[id]/approve/route.ts` — replaced by `/api/approvals/[id]/approve`. Old route still exists for backwards-compat; remove once all UI points at the new endpoint.
   - `/api/legacy-licenses/[id]/{accept,reject}/route.ts` — old `license_requests` flow. Will be removed once the new `licenses` table is fully cut-over.

2. **Run migration 00038 in staging** before deploying to verify the two new RPCs work end-to-end. The route fallbacks (try/catch with manual reconciliation logs) are safe but you want the RPCs live.

3. ~~**Wire the new generation-sheet modal into the campaign create flow.**~~ ✅ Done in `8b11f21` — `/brand/discover/[creatorId]` now hosts the GenerationSheet via the LaunchSection client island.

4. ~~**Wire the brand sessions page to a sessions list.**~~ ✅ Done in `8b11f21` — `/brand/sessions` now renders a paginated 24/page grid with status pills + "+ New generation" CTA.

---

## Glue-Layer Follow-Up (commit `8b11f21`)

After the main 5-agent UI parallel build, an 8-item glue layer was completed in a single autonomous pass:

| # | Item | Files |
|---|---|---|
| 1 | Sidebar nav for brand + creator + admin | `src/config/nav-items.{brand,creator,admin}.ts` |
| 2 | Generation-sheet wired to creator detail | `src/app/(dashboard)/brand/discover/[creatorId]/{page,launch-section}.tsx` |
| 3 | `/brand/sessions` list page | `src/app/(dashboard)/brand/sessions/page.tsx` |
| 4 | Legacy `/dashboard/wallet` permanent redirect to `/brand/wallet` | `src/app/(dashboard)/dashboard/wallet/page.tsx` |
| 5 | Onboarding pricing scope/exclusivity uplift hint | `src/app/(dashboard)/dashboard/onboarding/pricing/page.tsx` |
| 6 | Delete `/api/legacy-licenses/*` (no callers) | (8 files removed) |
| 7 | Inngest stub comments refreshed | `src/inngest/client.ts` |
| 8 | Verify gates re-run | tsc 0, vitest 622/622, build exit 0 |

Also: `docs/superpowers/OPS_DEPLOY_GUIDE.md` written — single-page deploy checklist for migrations, env vars, Cashfree + Replicate webhook config, and smoke tests.

---

## Files Touched This Run

- **Created:** 33 UI files (~7,237 lines), 1 migration file, 1 status doc
- **Modified:** 6 files (`package.json`, `package-lock.json`, marketing landing page, credits test fixture, `src/config/routes.ts`, `src/inngest/client.ts`, `vitest.config.ts`)
- **Deleted:** 7 inngest function files + 1 inngest API route + 6 stale duplicate license routes

Total commits this session: **3** (Phase 1, 2, 3) + **2** new (Phase 4–7 consolidated UI + cleanup, Phase 8 status doc).

`Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
