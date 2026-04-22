# Cashfree Ops Runbook

> **Last updated:** 2026-04-22
> **Audience:** Engineering + Finance + Support
> **Escalation priority order:** 1. Ops engineer on call → 2. Tech lead → 3. Cashfree support

This is the emergency playbook for when Cashfree breaks. When a brand reports a stuck top-up, a creator reports a missing payout, or a monthly filing needs the right numbers, start here.

---

## 1. Environment check (do this first)

Before debugging anything, confirm Cashfree is reachable and we're pointed at the right environment:

- [ ] `curl -I https://api.cashfree.com/pg/orders` — should return 200/401 (not 503)
- [ ] [Cashfree status page](https://status.cashfree.com) — no active incident
- [ ] Our `CASHFREE_MODE` env var matches the expected environment (`test` or `prod`)
- [ ] Webhook endpoint is reachable from the public internet (`curl -I https://<prod-domain>/api/cashfree/webhook` → 405 is fine, 404/503 is not)

If Cashfree is down or the webhook endpoint isn't reachable, pause top-up and withdrawal flows via feature flag (see section 8).

---

## 2. Stuck top-up (brand paid but credits not showing)

### Symptoms
- Brand reports "I paid, where are my credits?"
- Row in `public.credit_top_ups` has `status='processing'` or `status='initiated'` for more than 10 minutes
- No row in `public.credit_transactions` for this brand-id / amount

### Investigation

```sql
-- Get the top-up row
select * from public.credit_top_ups where id = '<top_up_id>';

-- Did the webhook arrive?
select * from public.webhook_events
where source = 'cashfree'
  and payload::jsonb->'data'->>'order_id' = '<cf_order_id>'
order by received_at desc;

-- Does a credit ledger row already exist? (idempotency)
select * from public.credit_transactions
where reference_type = 'credit_top_up'
  and reference_id = '<top_up_id>';
```

### Common causes + fix

| Cause | How to tell | Fix |
|---|---|---|
| Webhook never arrived (Cashfree delivery delay) | No row in `webhook_events` for the order_id | Wait for the 6-hour reconciliation cron, or trigger reconcile manually via Inngest dashboard |
| Webhook arrived but handler failed | `webhook_events.processed_at IS NULL` + `processing_error` populated | Read the error; common case is a transient DB lock — retry via reconcile or manually call `commit_top_up` |
| Payment actually failed at Cashfree | Cashfree dashboard shows order status = FAILED | `update public.credit_top_ups set status='failed' where id='<id>'`; tell brand to retry. No ledger action needed. |
| Webhook signature rejected | No row in `webhook_events` but Cashfree dashboard says PAID | `CASHFREE_WEBHOOK_SECRET` is wrong or rotated — fix secret, then manually call the procedure (below) |
| Brand never redirected back, Cashfree shows PAID | `credit_top_ups.status='initiated'` + Cashfree dashboard says PAID | Reconcile will pick up within 6h; or call `commit_top_up` manually after flipping status |

### Manual reconciliation (emergency)

If Cashfree confirms the payment is SUCCESS but our DB is stuck:

```sql
-- First, flip the top-up row to success so the procedure's status guard passes.
update public.credit_top_ups
   set status = 'success',
       cf_payment_id = '<cf_payment_id_from_dashboard>',
       completed_at = now()
 where id = '<top_up_id>'
   and status <> 'success';

-- Then commit — this inserts the credit_transactions row and bumps brand balance.
select public.commit_top_up('<top_up_id>');
```

`commit_top_up` is idempotent — if a ledger row already exists, it's a no-op. Safe to retry.

---

## 3. Stuck withdrawal (creator asked, bank not credited)

### Symptoms
- Creator contacts support about a missing payout
- Row in `public.withdrawal_requests` with `status='processing'` or `status='deductions_applied'` for more than 30 minutes
- Creator's bank statement has no matching credit

### Investigation

```sql
-- Withdrawal row
select * from public.withdrawal_requests where id = '<wd_id>';

-- Did we get any transfer webhooks?
select * from public.webhook_events
where source = 'cashfree'
  and event_type in ('TRANSFER_SUCCESS', 'TRANSFER_FAILED', 'TRANSFER_REVERSED')
  and payload::jsonb->'data'->>'transfer_id' = '<cf_transfer_id>'
order by received_at desc;

-- Tax ledger entries applied?
select * from public.tcs_ledger where withdrawal_request_id = '<wd_id>';
select * from public.tds_ledger where withdrawal_request_id = '<wd_id>';
select * from public.gst_output_ledger where reference_type = 'withdrawal_request' and reference_id = '<wd_id>';
```

Also check the **Cashfree Payouts dashboard** → search by `transfer_id` = our `withdrawal_requests.cf_transfer_id`.

### Cashfree transfer states

| Cashfree state | What it means | Action |
|---|---|---|
| SUCCESS (with UTR) | Bank credited the creator | If our row is stuck: webhook was missed. Reconcile will catch it within 6h; or manually call `commit_withdrawal_success` (below). |
| PROCESSING | Bank hasn't settled yet. IMPS usually settles in minutes but can get stuck at recipient banks during off-hours (10pm-6am, weekends). | Wait up to 24h before escalating. Do not retry. |
| FAILED / REJECTED | Bank refused the transfer. `reason` field explains — invalid IFSC, account closed, name mismatch, etc. | Manually call `commit_withdrawal_failure` with the reason. Creator must fix bank details in KYC flow and re-request. |
| REVERSED | Transfer was sent but reversed by the beneficiary bank (usually a name-mismatch caught after send). | Same as FAILED — call `commit_withdrawal_failure`. Creator needs to correct bank account. |

### Manual reconciliation

If Cashfree confirms SUCCESS but our DB is stuck:

```sql
select public.commit_withdrawal_success('<wd_id>', '<utr_number_from_cashfree>');
```

If Cashfree confirms FAILED / REVERSED but our DB is stuck:

```sql
select public.commit_withdrawal_failure('<wd_id>', '<reason_from_cashfree>');
```

Both procedures are idempotent. `commit_withdrawal_failure` inserts negative-sign reversal rows on tax ledgers (TCS/TDS/GST) to keep them append-only; `pending_balance` was never decremented pre-success, so nothing needs to be restored on the creator row.

---

## 4. Disputed generation / contract (admin hold)

> **Deferred to Chunk D.** Dispute resolution (admin hold on escrow, creator/brand evidence submission, resolution ledger entries) is not part of Chunk C scope. This section is a placeholder — see the Chunk D spec (`docs/superpowers/specs/2026-04-22-chunk-d-*.md` when written) and its accompanying dispute runbook.

---

## 5. Monthly GST / TDS / TCS filing checklist

Run on the first business day of each month for the prior month. All queries use `accounting_period` which is the first day of the month as a `date`.

### GST (platform as collector)

- [ ] Pull the output GST ledger:

  ```sql
  select type, count(*), sum(tax_paise)
  from public.gst_output_ledger
  where accounting_period = '<YYYY-MM-01>'
  group by type
  order by type;
  ```

- [ ] Sum `tax_paise` grouped by `type`:
  - `output_on_commission` — collected from brand on platform fee (18%)
  - `output_on_creator_service` — collected on creator's service (18%, only if creator has GSTIN)
  - `reversal` — negative rows from failed withdrawals; net these against positives
- [ ] File **GSTR-1** via CA or GSP by the 11th of the next month.
- [ ] Reconcile the totals against Cashfree's monthly settlement report.

### TCS (e-commerce operator, Section 52 CGST)

- [ ] Pull the TCS ledger:

  ```sql
  select type, count(*), sum(tax_paise)
  from public.tcs_ledger
  where accounting_period = '<YYYY-MM-01>'
  group by type;
  ```

- [ ] Sum `tax_paise` (net of reversals).
- [ ] File **GSTR-8** (TCS return) by the 10th of the next month.
- [ ] Issue **Form 27D** to creators quarterly.
- [ ] Remit TCS to CBDT by the due date.

### TDS (Section 194-O Income Tax)

- [ ] Pull the TDS ledger:

  ```sql
  select type, count(*), sum(tax_paise)
  from public.tds_ledger
  where accounting_period = '<YYYY-MM-01>'
  group by type;
  ```

- [ ] File **Form 26Q** (TDS on payments to residents) by the 31st of the next month.
- [ ] Issue **Form 16A** to creators quarterly.
- [ ] Remit TDS to CBDT by the due date.

### Reconciliation with Cashfree settlements

- [ ] Pull the Cashfree settlement report for the month (merchant dashboard → Settlements).
- [ ] Sum platform revenue:

  ```sql
  select type, sum(amount_paise)
  from public.platform_revenue_ledger
  where accounting_period = '<YYYY-MM-01>'
  group by type;
  ```

- [ ] Reconcile: Cashfree settled amount should equal `sum(platform_revenue_ledger) - sum(gst_output_ledger output_on_commission) - fees`. Any gap is a bug — stop and investigate before the next cycle.

---

## 6. Key configuration

### Env vars (Vercel → Settings → Environment Variables)

| Var | Meaning | Source |
|---|---|---|
| `CASHFREE_MODE` | `test` or `prod` | Engineering toggle |
| `CASHFREE_APP_ID` | Merchant identifier | [Cashfree merchant dashboard → API Keys](https://merchant.cashfree.com) |
| `CASHFREE_SECRET_KEY` | Merchant secret | Same as above |
| `CASHFREE_WEBHOOK_SECRET` | Webhook HMAC key | Cashfree merchant dashboard → Webhooks |
| `CASHFREE_NODAL_ACCOUNT_ID` | Our nodal virtual account | Cashfree KAM email |
| `KYC_ENCRYPTION_KEY` | AES-GCM key for PAN / Aadhaar at rest | 32-byte random; generate once with `openssl rand -hex 32`, store in Vercel + 1Password |

### Test credentials

Stored in 1Password vault `Faiceoff/Cashfree/Test`. Never commit to repo.

### Production rollover checklist

Before flipping `CASHFREE_MODE` from `test` to `prod`:

- [ ] Nodal account fully KYC'd via Cashfree
- [ ] Payouts product activated (IMPS mode enabled)
- [ ] KYC product activated (PAN + Aadhaar + penny-drop APIs all returning success on sandbox)
- [ ] Webhook URL set to `https://<prod-domain>/api/cashfree/webhook` in Cashfree merchant dashboard
- [ ] `CASHFREE_WEBHOOK_SECRET` in Vercel matches the secret shown in Cashfree dashboard
- [ ] Full test flow passed 3× in sandbox: top-up → license request → creator accept → image approvals → creator withdrawal → bank receive
- [ ] Production PAN + GST certificate uploaded to Cashfree
- [ ] Finance signoff for first real top-up cap at ₹10,000; raise after 24h of clean operation

---

## 7. Escalation contacts

> **Placeholder values below — replace with actual numbers / contacts before production launch.**

| Scenario | Primary | Fallback |
|---|---|---|
| Cashfree API outage | Cashfree support: `support@cashfree.com` / `<TODO: fill in phone>` | Cashfree KAM (from merchant portal) |
| Creator payout not received (>24h) | Engineering on-call → Cashfree KAM | Finance |
| Brand charged but no credits (>10 min) | Engineering on-call → run reconcile; escalate to Cashfree if dashboard also shows stuck | Cashfree KAM |
| GST / TDS / TCS filing questions | `<TODO: fill in CA contact>` | CFO |
| Security incident (webhook secret leaked, etc.) | Tech lead → rotate secrets | Engineering on-call |

Internal Slack channel: `<TODO: fill in — e.g. #faiceoff-payments>`

---

## 8. Feature flags (emergency disable)

To pause flows during an incident, toggle these env vars in Vercel:

```
# Disable brand top-ups (prevents creation of new Cashfree orders)
NEXT_PUBLIC_CREDITS_TOP_UP_ENABLED=false

# Disable creator withdrawals (prevents creation of new Cashfree transfers)
NEXT_PUBLIC_WITHDRAWALS_ENABLED=false
```

Pages should render a "Top-ups paused — please check back in a few minutes" banner when the flag is off. If flags don't exist in the codebase yet, create them as follow-up PRs — routing requests to the paused state is better than letting them create unrecoverable Cashfree orders during an incident.

Webhook receiver (`/api/cashfree/webhook`) must **never** be flagged off — we always want to record inbound events for reconciliation, even if we're not initiating new outbound flows.

---

## 9. Common errors + fixes

### `CashfreeApiError: 401`
**Cause:** API credentials invalid for the current mode.
**Fix:** Verify `CASHFREE_MODE` matches which creds you set (test vs prod). Test creds on prod base URL return 401.

### `CashfreeApiError: 403 — Account not active`
**Cause:** Cashfree KYC has paused our merchant account — usually due to a missing document or a compliance flag.
**Fix:** Check the Cashfree merchant dashboard for pending document requests. Resolve, then retry.

### `LedgerError: commit_top_up requires status=success, got <status>`
**Cause:** The webhook handler called `commit_top_up` before the row's status was flipped to `success` — usually a webhook fired out of order or the raw webhook processor crashed mid-transaction.
**Fix:** Check `credit_top_ups.status` and the Cashfree dashboard. If Cashfree says PAID, manually flip status to `success` and re-run the procedure (see section 2 manual reconciliation). If Cashfree says FAILED, flip status to `failed` — no ledger action needed.

### `LedgerError: commit_top_up: already committed for <id>, no-op`
Not actually an error — the procedure is idempotent and this is the informational NOTICE when a webhook is re-delivered. Ignore.

### `CashfreeWebhookSignatureError`
**Cause:** Webhook signature mismatch — usually `CASHFREE_WEBHOOK_SECRET` is wrong (rotation happened in one place only).
**Fix:** Rotate the webhook secret in **both** the Cashfree dashboard **and** the Vercel env var, then redeploy. Lost webhooks during the rotation window are reconciled automatically within 6h by the cron.

### `commit_withdrawal_success requires status=processing, got <status>`
**Cause:** Trying to mark a withdrawal successful but its row is still in `deductions_applied` (we never called the Cashfree transfer API) or in `failed` (a prior webhook already transitioned it).
**Fix:** Check row state + Cashfree transfer state. If Cashfree says SUCCESS but ours is `deductions_applied`, the Cashfree API call succeeded but we missed the status flip — set `status='processing'` first, then re-run `commit_withdrawal_success`. If ours is `failed`, do nothing; Cashfree and our state disagree and you need Cashfree support to clarify.

---

## 10. Quick-links

- [Cashfree merchant dashboard](https://merchant.cashfree.com)
- [Cashfree API docs](https://docs.cashfree.com/docs)
- [Cashfree status page](https://status.cashfree.com)
- Supabase SQL editor — filtered views for each ledger table (credit_transactions, escrow_ledger, platform_revenue_ledger, gst_output_ledger, tcs_ledger, tds_ledger, webhook_events, withdrawal_requests)
- [Razorpay migration runbook](./razorpay-migration.md) — pre-Cashfree cutover audit, kept for archaeology
