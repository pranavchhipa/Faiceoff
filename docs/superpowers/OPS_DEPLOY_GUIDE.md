# Faiceoff — Chunk E Deploy Guide

> Copy-paste ops checklist for shipping Chunk E to production. Everything Claude could automate is already done & committed; this file is what **you** (Pranav) need to run by hand.

**Status as of `8b11f21`:**
- 622/622 tests passing
- `tsc --noEmit` clean
- `next build` exit 0
- All migrations written, all routes implemented, all UI wired

**You need to do five things, in this order:**
1. Push 7 new Supabase migrations
2. Set ~6 new env vars in Vercel
3. Configure Cashfree webhook URLs (Collect + Payouts)
4. Configure Replicate webhook URL
5. Deploy + smoke-test

---

## 1. Push migrations to production Supabase

Seven migrations were added in Chunk E. Push in order — they have FK dependencies on each other.

```bash
# from repo root
cd C:/Users/Pranav/.gemini/antigravity/scratch/Faiceoff

# Push everything that's local but not on the remote
supabase db push --linked
```

If `supabase db push` doesn't work for any reason (e.g. CLI version mismatch), apply manually via the Supabase SQL editor in this exact order:

| # | File |
|---|---|
| 1 | `supabase/migrations/00032_two_layer_billing.sql` |
| 2 | `supabase/migrations/00033_seed_credit_packs.sql` |
| 3 | `supabase/migrations/00034_backfill_legacy_packs.sql` |
| 4 | `supabase/migrations/00035_create_billing_views_and_cron.sql` |
| 5 | `supabase/migrations/00036_payout_procedures.sql` |
| 6 | `supabase/migrations/00037_billing_procedures.sql` |
| 7 | `supabase/migrations/00038_admin_credit_rpcs.sql` |

**After push, verify the views exist:**
```sql
SELECT * FROM v_brand_billing LIMIT 1;
SELECT * FROM v_creator_dashboard LIMIT 1;
```

Both should return rows (or empty result sets — but no error).

**Verify the credit packs seeded:**
```sql
SELECT code, credits, price_paise, bonus_paise FROM credit_packs_catalog ORDER BY price_paise;
```

You should see: `free_signup`, `spark`, `flow`, `pro`, `studio`, `enterprise`, plus legacy `small`/`medium`/`large`.

**Enable pg_cron jobs** (one-time, in Supabase SQL editor):
```sql
SELECT cron.schedule(
  'expire-stale-topups',
  '*/15 * * * *',
  $$SELECT expire_stale_topups()$$
);
```

---

## 2. Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables → Production + Preview**.

### NEW for Chunk E (must be added)

| Name | Value | How to generate |
|---|---|---|
| `CRON_SECRET` | random hex | `openssl rand -hex 32` |
| `REPLICATE_WEBHOOK_SECRET` | random hex | `openssl rand -hex 32` |
| `CASHFREE_WEBHOOK_SECRET` | from Cashfree dashboard | See step 3 below |
| `CASHFREE_NODAL_ACCOUNT_ID` | from Cashfree dashboard | Cashfree → Settings → Nodal Account |
| `KYC_ENCRYPTION_KEY` | random hex | `openssl rand -hex 32` ⚠️ **NEVER rotate** |
| `NEXT_PUBLIC_APP_URL` | `https://faiceoff.com` | Your prod domain (no trailing slash) |

### EXISTING (verify they're set)

| Name | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `CASHFREE_MODE` | `production` |
| `CASHFREE_APP_ID` | Cashfree → Developers → API Keys |
| `CASHFREE_SECRET_KEY` | Cashfree → Developers → API Keys |
| `REPLICATE_API_TOKEN` | replicate.com → Account → API Tokens |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `HIVE_API_KEY` | hivemoderation.com |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare → R2 |
| `R2_CONTRACTS_BUCKET_NAME` | `faiceoff-contracts` (create the bucket too) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash → Redis DB |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | resend.com |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | observability |

### REMOVE (no longer used)

- `INNGEST_EVENT_KEY` ❌
- `INNGEST_SIGNING_KEY` ❌

Inngest was removed in Chunk E. The stub at `src/inngest/client.ts` keeps legacy code paths compiling but doesn't make any network calls.

---

## 3. Cashfree dashboard config

Log in to your Cashfree merchant dashboard ([merchant.cashfree.com](https://merchant.cashfree.com)).

### a. Collect webhook (brand credit top-ups)

**Cashfree → Developers → Webhooks → Payment Gateway → Add webhook URL**

```
https://faiceoff.com/api/cashfree/webhook
```

Events to enable:
- ✅ Payment Success
- ✅ Payment Failed
- ✅ Order Expired

Copy the **webhook secret** that Cashfree shows you and paste it into the Vercel env var `CASHFREE_WEBHOOK_SECRET`.

### b. Payouts webhook (creator settlements)

**Cashfree → Payouts → Webhooks → Add webhook URL**

```
https://faiceoff.com/api/cashfree/webhook
```

Events:
- ✅ Transfer Success
- ✅ Transfer Failed
- ✅ Transfer Reversed

(Same endpoint handles both — the route distinguishes via the event payload.)

### c. Nodal account (production only)

If you're going live with payouts, finish KYC for the **Cashfree Nodal Account** — they'll issue you a Virtual Account ID. Paste that into the Vercel env var `CASHFREE_NODAL_ACCOUNT_ID`.

In test/sandbox, you can use the demo Nodal ID Cashfree provides.

---

## 4. Replicate dashboard config

Replicate webhooks are **set per-prediction** in code, so there's no dashboard step. But you do need:

1. The `REPLICATE_WEBHOOK_SECRET` env var (set in step 2).
2. Make sure your prod domain is reachable from the public internet — the webhook URL is computed from `NEXT_PUBLIC_APP_URL`. (Vercel handles this automatically.)
3. Each generation submission creates a webhook URL like:
   ```
   https://faiceoff.com/api/webhooks/replicate?gen_id=<uuid>&token=<hmac>
   ```
   Token is derived from `REPLICATE_WEBHOOK_SECRET`. If it's wrong/missing, Replicate webhooks 401 and the generation gets stuck — `cron/poll-replicate` will recover them.

---

## 5. Vercel Cron setup

Vercel reads cron schedules from `vercel.json`. Verify it's checked in (it should be):

```bash
cat vercel.json
```

You should see entries for:
- `/api/cron/license-renewals` — daily, expires & renews 12-month licenses
- `/api/cron/poll-replicate` — every 10 min, recovers stuck generations
- `/api/cron/process-rejections` — hourly, refunds rejected generations
- `/api/cron/tds-quarterly-reminder` — quarterly, reminds you to file TDS

All cron endpoints check the `CRON_SECRET` header. Vercel automatically attaches it.

---

## 6. Deploy

```bash
# from repo root
git push origin main

# Vercel auto-deploys on push. Or manually:
vercel --prod
```

Wait ~3 min for the build. Then **smoke test:**

| Check | URL |
|---|---|
| Brand discover loads | https://faiceoff.com/brand/discover |
| Sessions list loads | https://faiceoff.com/brand/sessions |
| Creator dashboard loads | https://faiceoff.com/creator/dashboard |
| Admin packs loads | https://faiceoff.com/admin/packs |
| Public verify works | https://faiceoff.com/verify/<any-license-uuid> |
| Health check | https://faiceoff.com/api/health → `{"status":"ok"}` |

---

## 7. First-time setup checks (production)

1. **Create your admin user** — sign up on the site, then in Supabase SQL editor:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'marketing@rectangled.io';
   ```
2. **Top up a test brand** — use Cashfree sandbox card (`4111 1111 1111 1111`, exp `12/29`, CVV `123`) to verify webhook flow.
3. **Onboard a test creator** — walk through the 9-step flow, set pricing.
4. **Launch a test generation** — verify the GenerationSheet → /brand/sessions/[id] flow works end-to-end.
5. **Approve the generation as the creator** — verify wallet credit happens & escrow row appears.

---

## Rollback plan

If anything breaks after deploy:

```bash
# Find last good commit on Vercel dashboard, then promote it
vercel promote <deployment-url>

# Or revert the bad commit
git revert HEAD
git push origin main
```

For DB rollbacks: each migration is additive and idempotent where possible. The Chunk E migrations don't drop columns or change existing types — safe to leave applied even if you roll back the code.

---

## Open follow-ups (not blocking)

These are noted in `NIGHT_RUN_STATUS.md` but aren't required for ship:

- Brand `/brand/dashboard` page is currently empty — needs a landing tile design.
- Creator dashboard onboarding nudge for users who haven't completed step 9.
- Admin "Stuck gens" page wire-up to the `cron/poll-replicate` retry queue UI.

Ping me whenever you want to tackle any of those.
