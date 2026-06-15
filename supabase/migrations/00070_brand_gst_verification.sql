-- ═══════════════════════════════════════════════════════════════════════════
-- 00070: Brand GST verification (GSTVerify API info-pull + manual operator review)
--
-- Brand enters a GSTIN + solves a captcha → backend pulls official details from
-- the GSTVerify API (legal name, trade name, status, address, constitution).
-- Those pulled fields are stored LOCKED (read-only) on the brand. The brand
-- also uploads its GST registration certificate (private bucket). A Control
-- Centre operator cross-checks the pulled info + certificate and approves /
-- rejects (brands.is_verified). No golden tick for brands — just a
-- Verified/Unverified status in the profile.
--
-- PAN is NOT collected separately — it is the GSTIN's characters 3–12.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Locked, API-pulled display fields on the brand row ──────────────────────
alter table public.brands
  add column if not exists gst_legal_name   text,
  add column if not exists gst_trade_name   text,
  add column if not exists gst_status       text,   -- Active / Cancelled / Suspended …
  add column if not exists gst_address      text,
  add column if not exists gst_constitution text,   -- Private Ltd / Proprietorship …
  add column if not exists gst_verified_at  timestamptz; -- when the API pull succeeded

-- ── Verification request: GST pull data + certificate + review ──────────────
alter table public.brand_verifications
  add column if not exists gst_legal_name      text,
  add column if not exists gst_trade_name      text,
  add column if not exists gst_status          text,
  add column if not exists gst_address         text,
  add column if not exists gst_constitution    text,
  add column if not exists gst_registration_date text,
  add column if not exists gst_taxpayer_type   text,
  add column if not exists gst_api_response    jsonb,   -- raw API response (audit)
  add column if not exists gst_verified_at     timestamptz,
  add column if not exists gst_certificate_path text;    -- path in brand-documents bucket

-- ── Private bucket for brand documents (GST certificate) ────────────────────
-- Server-side access only via short-lived signed URLs (mirrors kyc-documents).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-documents',
  'brand-documents',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
-- RLS handled by the existing storage policies; all access is via the service
-- role (createAdminClient) + signed URLs, like kyc-documents.
