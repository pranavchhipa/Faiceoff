/**
 * Legacy /dashboard/wallet — replaced by /brand/wallet (Chunk E).
 *
 * Permanent server-side redirect so any external bookmarks or in-app links
 * land on the new brand wallet experience.
 */

import { redirect, permanentRedirect } from "next/navigation";

export default function LegacyWalletRedirect() {
  permanentRedirect("/brand/wallet");
  // unreachable, but keeps the inferred return type happy
  redirect("/brand/wallet");
}
