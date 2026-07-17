// ─────────────────────────────────────────────────────────────────────────────
// /brand/billing — DEPRECATED, kept as a redirect.
//
// Wallet and Billing were two separate pages for the same underlying data.
// The wallet concept has since been removed entirely — brands fund
// exclusively via /brand/credits (direct Razorpay purchase) or a paid
// collab package. This file remains so old bookmarks + emails continue to
// work — every load redirects straight to /brand/credits.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

export default function BrandBillingRedirect() {
  redirect("/brand/credits");
}
