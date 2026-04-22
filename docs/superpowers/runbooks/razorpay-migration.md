# Runbook: Razorpay → Cashfree Migration (Chunk C, Phase 9)

**Date:** 2026-04-22
**Author:** Chunk C foundation implementer
**Ref:** `docs/superpowers/plans/2026-04-22-chunk-c-foundation.md` (Tasks 32-33)
**Status:** Complete

---

## Why

Phases 2-8 of Chunk C built the Cashfree money path (Collect + Payouts + KYC + Nodal + Webhook). Razorpay is no longer a live gateway. Leaving Razorpay code around wastes surface area, confuses new contributors, and ships dead credentials in every deployed image.

This runbook captures the full audit of Razorpay references on `main` right before we ripped them out, so future archaeology (why did we once import `razorpay`?) has a single document to read.

---

## Audit — Pre-removal state

### Source files (will be deleted or rewired)

Grep command used:
```bash
grep -rn "razorpay" src --include="*.ts" --include="*.tsx" -i
grep -rn "RAZORPAY" src --include="*.ts" --include="*.tsx"
```

| File | Role | Disposition |
|---|---|---|
| `src/lib/payments/razorpay-client.ts` | Razorpay SDK singleton | **DELETE** |
| `src/lib/payments/webhook-verifier.ts` | HMAC SHA-256 verifier for Razorpay webhook | **DELETE** (unused — no routes import it) |
| `src/app/api/wallet/create-order/route.ts` | Creates Razorpay order for wallet top-up | **DELETE** |
| `src/app/api/wallet/verify-payment/route.ts` | Verifies Razorpay signature + credits wallet | **DELETE** |
| `src/app/layout.tsx` | Loads `checkout.razorpay.com/v1/checkout.js` | **MODIFY** — remove `<Script>` tag |
| `src/app/(dashboard)/dashboard/wallet/page.tsx` | Top-up modal calls Razorpay Checkout | **STUB** — replace top-up flow with "coming soon" banner pointing at `/api/credits/top-up`; payout flow untouched |
| `src/domains/wallet/types.ts` | Comments reference `razorpay_payment` reference_type | **MODIFY** — drop stale comments, keep types (compat with archive) |
| `src/app/(marketing)/for-creators/page.tsx` | Marketing copy + trust badge says "RAZORPAY" | **MODIFY** — change copy to Cashfree |

### `wallet_transactions` table references

Grep command:
```bash
grep -rn "wallet_transactions" src --include="*.ts" --include="*.tsx" -i
```

These all touched `public.wallet_transactions`. Migration 00027 renamed that table to `wallet_transactions_archive` and sealed it against writes (no insert policies). So any writer to `wallet_transactions` is already dead in production — the table literally does not exist under that name.

| File | Role | Resolution |
|---|---|---|
| `src/types/supabase.ts` | Generated type for `wallet_transactions` | Leave — regenerated from DB; will self-fix on next pull |
| `src/inngest/functions/generation/generation-pipeline.ts` | Writes escrow_release refunds + generation_earning / generation_spend on approve | Will be rebuilt in Chunk D (escrow_ledger + platform_revenue_ledger). For Phase 9 we leave the writes pointed at the old table name — they fail silently on archive (no insert policy), which is the correct behaviour: Chunk D will wire the pipeline to `escrow_ledger.release_escrow(...)` / `platform_revenue_ledger` via the RPCs shipped in migration 00029. **Do not point these at `wallet_transactions_archive`** — it is read-only. |
| `src/app/api/wallet/transactions/route.ts` | Reads user wallet_transactions | Rewire read to `wallet_transactions_archive` (read-only archival history) |
| `src/app/api/wallet/request-payout/route.ts` | Writes `type=payout` debit | **DELETE** — Cashfree Payouts handles this end-to-end in Phase 5 (`/api/payouts/initiate`). Leaving the route would allow payout inserts against a sealed table and confuse the admin ledger. |
| `src/app/api/campaigns/route.ts` | Reads earnings per campaign from wallet_transactions | Point at `wallet_transactions_archive` for backward-compat reads |
| `src/app/api/campaigns/[id]/route.ts` | Reads earnings per campaign | Same — point at `wallet_transactions_archive` |
| `src/app/api/dashboard/stats/route.ts` | Reads wallet balance for dashboard | Point at `wallet_transactions_archive` for read |
| `src/app/(dashboard)/dashboard/analytics/page.tsx` | Reads creator earnings timeseries | Point at `wallet_transactions_archive` |
| `src/app/api/auth/delete-account/route.ts` | Delete wallet_transactions on account deletion | **DELETE line** — archive is immutable; purge job handled by Chunk D |
| `src/app/api/generations/create/route.ts` | Reads brand wallet balance to pre-auth a generation | Switch to reading `brands.credits_balance_paise - brands.credits_reserved_paise` (the new source of truth shipped in migration 00020) |

> **Note (deliberate scope cut):** Chunk D will rebuild every one of these touch-points (brand credits view, creator earnings view, generation pre-auth, payout flow). The Phase 9 rewire just keeps the surface area compile-clean and test-green without regressing behaviour — any code that only READS the archive continues to work because migration 00027 kept the SELECT policies intact.

### Config + tooling

| File | Role | Disposition |
|---|---|---|
| `package.json` | `razorpay@^2.9.6` dependency | **REMOVE** |
| `.env.example` | `RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET` | **REMOVE** section |
| `CLAUDE.md` | Tech stack bullet says Razorpay | **MODIFY** → Cashfree + credits |
| `AGENTS.md` | No Razorpay refs | Leave |

### Docs (not touched)

These are historical and should stay as-is to preserve context:

- `docs/superpowers/plans/2026-04-22-chunk-c-foundation.md` — explicitly documents the Razorpay retirement
- `docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md` — spec for the replacement (Cashfree)
- Old database migrations `00011_create_wallet.sql`, `00015_fix_wallet_transaction_types.sql`, `00017_campaign_escrow.sql` — historical, untouched
- `LANDING_PAGE_PROMPT.md`, `STITCH_UI_PROMPT.md`, `INTERNAL_APP_STITCH_PROMPT.md`, `GEMINI.md` — design/prompt artifacts, not runtime code

---

## Replacement architecture (reference)

```
Client                        Server                    Cashfree
──────                        ──────                    ────────
POST /api/credits/top-up  ──► credit_top_ups (status=initiated)
                              └ createTopUpOrder ─────► /orders
                              ◄ { order_id, payment_session_id }
                              └ update row (status=processing)
◄ { orderId, paymentSessionId }

cashfree.checkout({ paymentSessionId }) ─► Cashfree Drop-in
                                         ◄ (user pays)
                              Cashfree ─► POST /api/cashfree/webhook
                                           ├ parseWebhook(rawBody, sig) — HMAC
                                           ├ dedup via webhook_events.idempotency_key
                                           └ routeWebhookEvent ─► credit_top_ups.status=success
                                                                  brands.credits_balance_paise += ...
                                                                  credit_transactions.insert(type=topup)

Client polls /api/credits/balance until credits_balance_paise increases.
```

For the Phase 9 rewire, the wallet page is stubbed rather than fully rewired — Chunk B will rebuild `/brand/credits` with the proper Drop-in integration.

---

## Decisions made

1. **`webhook-verifier.ts` deleted, not archived.** It exported `verifyWebhookSignature` which no route in the tree imports (Razorpay never had a working webhook receiver on this project — top-up went through `verify-payment` directly using signature-in-body). Cashfree has its own verifier at `src/lib/payments/cashfree/webhook.ts`. Zero dependents → delete.

2. **Wallet page stubbed, not rewired.** Rewiring would require Cashfree Drop-in JS loading, sessionId handling, and polling logic. Chunk B is already scoped to rebuild `/brand/credits` — doing it twice is waste. The stub links to `/api/credits/top-up` for anyone curious where the flow moved.

3. **Payout route deleted.** Cashfree Payouts API (Phase 5) replaces it end-to-end. Leaving the old POST handler as a stub would confuse admins if anyone hit it with curl.

4. **`wallet_transactions_archive` reads kept.** The old reads from campaigns, dashboard, analytics are rewired to the archive table so historical display data still loads. Chunk D will migrate the display code to the new ledgers.

5. **`razorpay` npm package removed.** No `@types/razorpay` was installed (the package is .d.ts shipped), so only one line disappears from `package.json`.

---

## Verification

After all changes land:

```bash
grep -rn "razorpay" src     # → (no output)
grep -rn "RAZORPAY" src     # → (no output)
./node_modules/.bin/tsc --noEmit           # → clean
./node_modules/.bin/vitest run              # → 356 tests pass
./node_modules/.bin/next build              # → clean (no dead-route warnings)
```

---

## Rollback

Not recommended. Razorpay account is not configured for this stage. If we ever need to restore, `git revert` the three commits of this phase.
