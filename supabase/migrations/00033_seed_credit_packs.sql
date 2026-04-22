-- ═══════════════════════════════════════════════════════════════════════════
-- Seed credit pack catalog (idempotent upsert)
-- Pricing decided 2026-04-23: Spark ₹30/credit, escalating discounts.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.credit_packs_catalog
  (code, display_name, credits, bonus_credits, price_paise, is_popular, sort_order, marketing_tagline)
VALUES
  ('free_signup',  'Free Signup',  5,    0,      0,       false, 0, 'Sign up bonus, no card required'),
  ('spark',        'Spark',        10,   0,      30000,   false, 1, 'Get started with Faiceoff'),
  ('flow',         'Flow',         50,   10,     120000,  false, 2, 'Save 33% — for regular use'),
  ('pro',          'Pro',          200,  50,     450000,  true,  3, 'MOST POPULAR — save 40%'),
  ('studio',       'Studio',       600,  200,    1200000, false, 4, 'Agency-grade — save 50%'),
  ('enterprise',   'Enterprise',   2000, 800,    5000000, false, 5, 'Talk to us for custom volume')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      credits = EXCLUDED.credits,
      bonus_credits = EXCLUDED.bonus_credits,
      price_paise = EXCLUDED.price_paise,
      is_popular = EXCLUDED.is_popular,
      sort_order = EXCLUDED.sort_order,
      marketing_tagline = EXCLUDED.marketing_tagline,
      updated_at = now();
