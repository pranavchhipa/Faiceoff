-- ═══════════════════════════════════════════════════════════════════════════
-- Chunk E: Two-layer billing (credits + wallet INR), licenses, payouts
-- Ref spec: docs/superpowers/specs/2026-04-23-pricing-workflow-redesign-design.md
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Architecture:
--   Brand pays for two distinct things:
--     1. CREDITS (integer count) — buys generation slots (1 credit = 1 gen, non-refundable on reject)
--     2. WALLET (paise) — pays creator fees on approval (refundable on reject)
--   Creator earnings flow into escrow_ledger (existing) → on-demand payout via creator_payouts
--   License is per-generation, 12-month auto-renew, certificate PDF stored in R2.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Modify brands: add credits layer, rename wallet fields ────────────────
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_lifetime_purchased integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'credits_balance_paise'
  ) THEN
    ALTER TABLE public.brands RENAME COLUMN credits_balance_paise TO wallet_balance_paise;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'credits_reserved_paise'
  ) THEN
    ALTER TABLE public.brands RENAME COLUMN credits_reserved_paise TO wallet_reserved_paise;
  END IF;
END$$;

COMMENT ON COLUMN public.brands.credits_remaining IS
  'Generation slot count (1 credit = 1 generation). Decremented at gen start, never refunded on reject.';
COMMENT ON COLUMN public.brands.credits_lifetime_purchased IS
  'Cumulative credits bought (excluding bonuses). Marketing/analytics use only.';
COMMENT ON COLUMN public.brands.wallet_balance_paise IS
  'INR wallet (paise) for paying creator fees on generation approval. Refundable on reject. Renamed from credits_balance_paise in 00032.';
COMMENT ON COLUMN public.brands.wallet_reserved_paise IS
  'Wallet paise locked against in-flight generations (released on reject, spent on approve). Renamed from credits_reserved_paise.';

-- ── 2. Modify credit_top_ups: new pack enum + bonus tracking ──────────────────
ALTER TABLE public.credit_top_ups DROP CONSTRAINT IF EXISTS credit_top_ups_pack_check;
ALTER TABLE public.credit_top_ups
  ADD CONSTRAINT credit_top_ups_pack_check
  CHECK (pack IN ('free_signup','spark','flow','pro','studio','enterprise','small','medium','large'));
-- Legacy pack names ('small','medium','large') kept for backfill — dropped in 00034.

ALTER TABLE public.credit_top_ups
  ADD COLUMN IF NOT EXISTS credits_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.credit_top_ups.credits_granted IS
  'Base credits from pack (excluding bonus). For Free Signup = 5, Spark = 10, etc.';
COMMENT ON COLUMN public.credit_top_ups.bonus_credits IS
  'Promotional bonus credits added to pack purchase (Flow +10, Pro +50, Studio +200, Enterprise +800).';

-- ── 3. credit_packs_catalog ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_packs_catalog (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text UNIQUE NOT NULL CHECK (code IN ('free_signup','spark','flow','pro','studio','enterprise')),
  display_name text NOT NULL,
  credits integer NOT NULL CHECK (credits >= 0),
  bonus_credits integer NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  marketing_tagline text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_packs_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads active packs" ON public.credit_packs_catalog;
CREATE POLICY "Anyone reads active packs" ON public.credit_packs_catalog
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins write packs" ON public.credit_packs_catalog;
CREATE POLICY "Admins write packs" ON public.credit_packs_catalog
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP TRIGGER IF EXISTS on_credit_packs_catalog_updated ON public.credit_packs_catalog;
CREATE TRIGGER on_credit_packs_catalog_updated
  BEFORE UPDATE ON public.credit_packs_catalog
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.credit_packs_catalog IS
  'Admin-managed credit pack catalog. Public reads active packs for /pricing and /brand/credits screens.';

-- ── 4. wallet_top_ups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_top_ups (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  bonus_paise integer NOT NULL DEFAULT 0 CHECK (bonus_paise >= 0),
  cf_order_id text UNIQUE,
  cf_payment_id text,
  status text NOT NULL CHECK (status IN ('initiated','processing','success','failed','expired')) DEFAULT 'initiated',
  failure_reason text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wtu_brand_created ON public.wallet_top_ups(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wtu_cf_order ON public.wallet_top_ups(cf_order_id);

ALTER TABLE public.wallet_top_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brands read own wallet topups" ON public.wallet_top_ups;
CREATE POLICY "Brands read own wallet topups" ON public.wallet_top_ups
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read all wallet topups" ON public.wallet_top_ups;
CREATE POLICY "Admins read all wallet topups" ON public.wallet_top_ups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

COMMENT ON TABLE public.wallet_top_ups IS
  'Cashfree Collect order lifecycle for wallet INR top-ups. Webhook-driven status transitions.';

-- ── 5. wallet_transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup','reserve','release_reserve','spend','refund','bonus','adjustment','withdraw')),
  amount_paise integer NOT NULL,
  balance_after_paise integer NOT NULL,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_walltx_brand_created ON public.wallet_transactions(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_walltx_ref ON public.wallet_transactions(reference_type, reference_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brands read own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Brands read own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admins read all wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

COMMENT ON TABLE public.wallet_transactions IS
  'Append-only wallet INR ledger (paise). Mirrors credit_transactions but for the new wallet_balance_paise column. Never UPDATE — reversals as new rows.';

-- ── 6. licenses ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  generation_id uuid NOT NULL UNIQUE REFERENCES public.generations(id),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  scope text NOT NULL CHECK (scope IN ('digital','digital_print','digital_print_packaging')),
  is_category_exclusive boolean NOT NULL DEFAULT false,
  exclusive_category text,
  exclusive_until timestamptz,
  amount_paid_paise integer NOT NULL CHECK (amount_paid_paise >= 0),
  creator_share_paise integer NOT NULL CHECK (creator_share_paise >= 0),
  platform_share_paise integer NOT NULL CHECK (platform_share_paise >= 0),
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

CREATE INDEX IF NOT EXISTS idx_licenses_brand ON public.licenses(brand_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_creator ON public.licenses(creator_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_status_expiry ON public.licenses(status, expires_at);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brands read own licenses" ON public.licenses;
CREATE POLICY "Brands read own licenses" ON public.licenses
  FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Creators read own licenses" ON public.licenses;
CREATE POLICY "Creators read own licenses" ON public.licenses
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Public read for verify" ON public.licenses;
CREATE POLICY "Public read for verify" ON public.licenses
  FOR SELECT USING (true);
-- Column-level restriction enforced at API layer (only id/status/scope/dates exposed publicly).

DROP POLICY IF EXISTS "Admins all licenses" ON public.licenses;
CREATE POLICY "Admins all licenses" ON public.licenses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP TRIGGER IF EXISTS on_licenses_updated ON public.licenses;
CREATE TRIGGER on_licenses_updated
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.licenses IS
  'Per-generation license (12-month default, auto-renew). Not to be confused with license_requests (Chunk C request flow). Cert PDF stored in R2 with QR code.';

-- ── 7. creator_blocked_categories ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_blocked_categories (
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('alcohol','tobacco','gambling','political','religious','adult','gun','crypto','drugs')),
  blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, category)
);

ALTER TABLE public.creator_blocked_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators manage own blocks" ON public.creator_blocked_categories;
CREATE POLICY "Creators manage own blocks" ON public.creator_blocked_categories
  FOR ALL USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Public reads blocks" ON public.creator_blocked_categories;
CREATE POLICY "Public reads blocks" ON public.creator_blocked_categories
  FOR SELECT USING (true);
-- Public read enables compliance check at gen-create time without needing admin context.

COMMENT ON TABLE public.creator_blocked_categories IS
  'Hard-blocked content categories per creator (Layer 1 of compliance check). Brands cannot generate matching content.';

-- ── 8. creator_payouts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_payouts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  gross_amount_paise integer NOT NULL CHECK (gross_amount_paise >= 0),
  tds_amount_paise integer NOT NULL DEFAULT 0 CHECK (tds_amount_paise >= 0),
  processing_fee_paise integer NOT NULL DEFAULT 0 CHECK (processing_fee_paise >= 0),
  net_amount_paise integer NOT NULL CHECK (net_amount_paise >= 0),
  status text NOT NULL CHECK (status IN ('requested','processing','success','failed','reversed')) DEFAULT 'requested',
  cf_transfer_id text UNIQUE,
  bank_account_last4 text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  escrow_ledger_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

CREATE INDEX IF NOT EXISTS idx_payouts_creator ON public.creator_payouts(creator_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.creator_payouts(status);

ALTER TABLE public.creator_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators read own payouts" ON public.creator_payouts;
CREATE POLICY "Creators read own payouts" ON public.creator_payouts
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins all payouts" ON public.creator_payouts;
CREATE POLICY "Admins all payouts" ON public.creator_payouts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

COMMENT ON TABLE public.creator_payouts IS
  'On-demand creator withdrawal requests. TDS 1% deducted at source, ₹25 flat processing fee. Cashfree Payouts integration. Min ₹500.';

-- ── 9. escrow_ledger: add holding window + payout linkage ────────────────────
ALTER TABLE public.escrow_ledger
  ADD COLUMN IF NOT EXISTS holding_until timestamptz,
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.creator_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_el_holding ON public.escrow_ledger(creator_id, holding_until)
  WHERE payout_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_el_payout ON public.escrow_ledger(payout_id) WHERE payout_id IS NOT NULL;

COMMENT ON COLUMN public.escrow_ledger.holding_until IS
  'When this escrow row becomes available for withdrawal (typically created_at + 7 days). NULL for pre-Chunk-E rows.';
COMMENT ON COLUMN public.escrow_ledger.payout_id IS
  'Set when creator includes this row in a withdrawal request. Prevents double-claim.';

-- ── 10. Modify generations: license + cert + download tracking ───────────────
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cert_url text,
  ADD COLUMN IF NOT EXISTS download_count_jsonb jsonb NOT NULL DEFAULT '{"original":0,"pdf":0,"docx":0}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_generations_license_id ON public.generations(license_id) WHERE license_id IS NOT NULL;

COMMENT ON COLUMN public.generations.license_id IS
  'FK to per-generation license (Chunk E). Distinct from license_request_id (Chunk C request flow).';
COMMENT ON COLUMN public.generations.cert_url IS
  'R2 URL of license certificate PDF. Populated on approval. NULL until issued.';
COMMENT ON COLUMN public.generations.download_count_jsonb IS
  'Per-format download counter. Shape: {"original": int, "pdf": int, "docx": int}. Brand-side analytics.';
