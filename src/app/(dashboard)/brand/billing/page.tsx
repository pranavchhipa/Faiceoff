// ─────────────────────────────────────────────────────────────────────────────
// /brand/billing — DEPRECATED, kept as a redirect.
//
// Wallet and Billing were two separate pages for what is functionally the
// same thing under the single-pool credit model (one INR balance + one
// credit balance, with transactions). They were collapsed into /brand/wallet
// to remove the redundancy. This file remains so old bookmarks + emails
// continue to work — every load redirects to /brand/wallet.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

export default function BrandBillingRedirect() {
  redirect("/brand/wallet");
}
