/**
 * Navigation configuration per role.
 *
 * Icons are referenced by name (string) so components can resolve
 * them to any icon library (e.g. lucide-react) at render time.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

/* ── Creator navigation ── */

export const creatorNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "My Likeness", href: "/dashboard/likeness", icon: "User" },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: "Megaphone" },
  { label: "Earnings", href: "/dashboard/earnings", icon: "IndianRupee" },
  { label: "Approvals", href: "/dashboard/approvals", icon: "CheckCircle" },
  { label: "Analytics", href: "/dashboard/analytics", icon: "BarChart3" },
  { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
];

/* ── Brand navigation ── */

export const brandNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Discover", href: "/dashboard/discover", icon: "Search" },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: "Megaphone" },
  { label: "Generate", href: "/dashboard/generate", icon: "Sparkles" },
  { label: "Library", href: "/dashboard/library", icon: "FolderOpen" },
  { label: "Billing", href: "/dashboard/billing", icon: "CreditCard" },
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
