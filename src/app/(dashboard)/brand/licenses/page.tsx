/**
 * Brand → /brand/licenses
 *
 * Thin client-only shell. The previous SSR fetch always failed (server-to-
 * server fetch loses auth cookies) → header showed "0 licenses" while the
 * client component populated rows underneath. Single client component now
 * owns both header + list state so the count is always live.
 */
import LicensesList from "./licenses-list";

export default function BrandLicensesPage() {
  return <LicensesList />;
}
