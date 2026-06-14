/**
 * RETIRED — old manual payouts surface.
 *
 * This page (and its sibling /api/admin/payouts route) queried the DEAD
 * `withdrawal_requests` table and rendered a garbage masked account number.
 * The canonical operator payout surface is now the Control Centre
 * (/<ccSlug>/payouts) which queries `creator_payouts`, decrypts bank
 * details, and supports mark-paid / reject.
 *
 * We keep this route alive only as a redirect so any stale bookmarks or
 * legacy links land somewhere sane:
 *   • Control Centre enabled → redirect to /<ccSlug>/payouts
 *   • otherwise              → redirect to /admin (Overview)
 */

import { redirect } from "next/navigation";
import { getConfiguredSlug } from "@/lib/cc/guard";

export const dynamic = "force-dynamic";

export default function AdminPayoutsPage() {
  const slug = getConfiguredSlug();
  redirect(slug ? `/${slug}/payouts` : "/admin");
}
