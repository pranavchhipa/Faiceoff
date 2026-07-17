/**
 * Legacy /dashboard/wallet — wallet was removed; brands buy credits
 * directly via Razorpay on /brand/credits.
 *
 * Permanent server-side redirect so any external bookmarks or in-app links
 * land on the live funding page.
 */

import { redirect, permanentRedirect } from "next/navigation";

export default function LegacyWalletRedirect() {
  permanentRedirect("/brand/credits");
  // unreachable, but keeps the inferred return type happy
  redirect("/brand/credits");
}
