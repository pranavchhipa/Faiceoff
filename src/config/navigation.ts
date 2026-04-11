/**
 * Navigation configuration per role.
 *
 * Icons are referenced by name (string) so components can resolve
 * them to any icon library (e.g. lucide-react) at render time.
 *
 * ⚠️  Keep in sync with CREATOR_NAV / BRAND_NAV in (dashboard)/layout.tsx
 */

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

/* ── Creator navigation ── */

export const creatorNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "My Likeness", href: "/dashboard/likeness", icon: "ScanFace" },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: "Megaphone" },
  { label: "Approvals", href: "/dashboard/approvals", icon: "ClipboardCheck" },
  { label: "Earnings", href: "/dashboard/wallet", icon: "IndianRupee" },
  { label: "Analytics", href: "/dashboard/analytics", icon: "BarChart3" },
  { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
];

/* ── Brand navigation ── */

export const brandNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Discover Creators", href: "/dashboard/creators", icon: "Users" },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: "Megaphone" },
  { label: "Wallet", href: "/dashboard/wallet", icon: "Wallet" },
  { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
];

/* ── Admin navigation ── */

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "LayoutDashboard" },
  { label: "Users", href: "/admin/users", icon: "Users" },
  { label: "Creators", href: "/admin/creators", icon: "User" },
  { label: "Brands", href: "/admin/brands", icon: "Building2" },
  { label: "Campaigns", href: "/admin/campaigns", icon: "Megaphone" },
  { label: "Moderation", href: "/admin/moderation", icon: "Shield" },
  { label: "Payouts", href: "/admin/payouts", icon: "IndianRupee" },
  { label: "Analytics", href: "/admin/analytics", icon: "BarChart3" },
  { label: "Settings", href: "/admin/settings", icon: "Settings" },
];
