# Faiceoff — Production Readiness (2026-06-14 audit)

A 38-agent end-to-end audit traced both flows (signup → onboarding → verification →
collab → approval → earnings → payout) plus the Control Centre. 28 criticals were
confirmed (adversarially verified). Status below.

## ✅ Fixed in code (commit 25c5e27, build green)

### P0 — money / security
1. **Ledger schema drift → creators earned ₹0.** The approval code inserts
   generation-based rows into `escrow_ledger` / `platform_revenue_ledger`, but the
   committed schema (00022) required `license_request_id`/`brand_id`/running-totals
   and had no `generation_id`/`gst_paise`/`source`. Inserts were rejected and
   swallowed by non-fatal try/catch → no escrow ever recorded. **Migration 00068**
   reshapes both tables (idempotent).
2. **Double credit charge** on every collab generation — the `/collabs/[id]/generate`
   route deducts, then `run-generation` deducted again. Fixed: run-generation skips
   billing for collab-originated gens (single-pool source of truth is the route).
3. **Payment bypass** — `confirm-payment` only verified the Razorpay signature *if
   provided*; an authenticated brand could POST `{}` to unlock a paid collab + free
   credits. Signature is now mandatory on the brand path.
4. **Vault download bypass** — single-image download only checked `image_url`, so a
   brand could pull the full-res licensed-likeness asset *before* creator consent.
   Now gated on `license_id` + `status='approved'`.
5. **Payout double-request race** — partial unique index `uniq_open_payout_per_creator`
   (00068) + 409 handling.

### P1
- `/api/credits/balance` 500 (selected pre-00032 renamed columns) — fixed.
- Creator approvals page showed ₹0 (API omitted `cost_paise`) — fixed.
- Brand discover listed unverified / not-live creators — now filters `is_live`.
- Wallet page advertised a dead escrow model (permanent ₹0 "In escrow") — copy now
  matches the single-pool credit model.
- Upstash Redis threw at import if env missing (crashed every rate-limited route) —
  now lazy + fail-open.
- Dual auto-resolution conflict (auto-approve vs auto-reject on the same 48h-expired
  approvals) — auto-reject disabled (**migration 00069** + process-rejections no-op);
  auto-approve (silence = consent) is canonical.
- New-brand onboarding bypassed the GST+PAN verification flow (funnelled to a stale
  wizard) — `/brand/onboarding` now routes through the verification form (creates a
  `brand_verifications` pending row).
- Discard didn't refund the paid iteration — now refunds 1 credit + decrements the
  per-collab counter.
- Retired the stale `/admin/payouts` UI (dead `withdrawal_requests`) → CC `/payouts`.
- CC money page now surfaces `wallet_top_ups`; CC disputes got resolve actions.

## 🚨 PENDING — only you can do these (BEFORE launch)

1. **Apply migrations to prod Supabase (in order):** 00065, 00066, 00067, 00068, 00069.
   - 00065/00067 missing → verification flows 500.
   - **00068 missing → creators still earn ₹0** (the whole point).
   - 00067 resets every brand to unverified → after applying, an operator MUST verify
     the test brand (rectangled.io) + any real brands in CC `/brand-verifications`,
     else they're locked out of collabs.
2. **Live keys / env:** Razorpay live keys + webhook secret; RazorpayX (for the manual
   payout transfers); rotate Upstash; set `R2_PUBLIC_URL` + R2 access keys in Vercel;
   Instagram OAuth (`INSTAGRAM_APP_ID/SECRET`).
3. After 00068 lands + a test approval credits escrow correctly: regenerate Supabase
   types (`npx supabase gen types …`) and drop `ignoreBuildErrors` on the money-path
   routes so future schema drift fails the build instead of hiding.

## ✅ Wave 2 (also fixed — commits 8f29c40 + later)
- **Control Centre now fully actionable:** moderation (force-discard + retry-stuck),
  collabs (force-complete + cancel), disputes (resolve + 1-credit refund) — all
  operator-guarded, audited, notify both parties; conservative on money (no
  fabricated escrow clawback — left as TODO where risky).
- Dark-only: brand-setup/onboarding page + dashboard status pills de-lighted.
- Hygiene: ticket notifications no longer 404; deprecated self-withdraw routes →
  410 Gone; brand-verify hrefs unified; dead LaunchSection deleted; stale share-%
  comments corrected to 75/25.
- Resilience: R2 public-URL validation made lazy — `next build` no longer crashes
  when the env is absent. 72h stale collab_requests now expired by the daily cron.
- Legacy-redirects test suite green (15/15) — stale expectations updated to match
  the current routes.

## Still open (need you, or a dedicated follow-up)
1. **Supabase type regen + drop `ignoreBuildErrors`** — needs your Supabase access
   token (`npx supabase gen types typescript --project-id jgmhronskdnzqkkimffp >
   src/types/supabase.ts`), then a pass to remove `as any` on money routes. Until
   then, schema drift is hidden from the build (that's how the ₹0-escrow bug hid).
2. **CC money refund tooling** (release an escrow row / refund a failed top-up /
   mark a payout failed) and the **escrow-aware refund** on dispute/collab-cancel —
   deliberately NOT auto-wired (clawing back already-released creator money is risky
   to automate); marked with TODOs.
3. Live keys / env (Razorpay live, RazorpayX, Upstash rotate, Vercel R2 env,
   Instagram OAuth) + verify the test brand in CC after the 00067 reset.
