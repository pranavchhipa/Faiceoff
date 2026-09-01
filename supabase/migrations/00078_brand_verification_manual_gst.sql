-- ─────────────────────────────────────────────────────────────────────────────
-- 00078: Flag brand verifications that skipped the automated GST pull.
--
-- The GSTIN auto-verification calls a third-party scraper of the GST portal.
-- When that vendor is down it returns ALB 502s, and submit previously REQUIRED
-- a successful pull — so an unverified brand was hard-blocked. Since brand
-- verification gates start-payment, a vendor outage silently froze all new
-- collab revenue.
--
-- Submission now needs only the uploaded GST certificate (which is what the
-- operator actually reads). `manual_gst_review = true` marks the rows where
-- the auto-pull did not happen, so the Control Centre queue can show them
-- distinctly and the operator knows to check the GSTIN on the portal
-- themselves before approving.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brand_verifications
  add column if not exists manual_gst_review boolean not null default false;

comment on column public.brand_verifications.manual_gst_review is
  'True when the brand submitted without a successful automated GST pull (vendor outage or skipped). Operator must verify the GSTIN manually before approving.';
