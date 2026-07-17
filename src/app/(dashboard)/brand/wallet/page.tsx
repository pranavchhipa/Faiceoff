/**
 * /brand/wallet — removed. Brands buy credits directly via Razorpay on
 * /brand/credits; there is no separate wallet step. Permanent redirect so
 * old bookmarks/links land on the live funding page instead of 404ing.
 */

import { redirect, permanentRedirect } from "next/navigation";

export default function BrandWalletRedirect() {
  permanentRedirect("/brand/credits");
  // unreachable, but keeps the inferred return type happy
  redirect("/brand/credits");
}
