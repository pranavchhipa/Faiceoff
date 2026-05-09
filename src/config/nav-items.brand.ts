import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Wallet,
  Library,
  Settings as SettingsIcon,
  User as UserIcon,
  Send,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Short label for compact rail tooltip (falls back to `label`). */
  short?: string;
  /** Optional group heading — renders group separators in sidebar chrome. */
  group?: string;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
}

/**
 * Full desktop side nav — primary items, grouped for Brand icon rail tooltips.
 *
 * Notes:
 *  • "Vault" was renamed to "Library" — clearer noun for "your licensed
 *    asset collection". URL stays /brand/vault for now (route is unchanged
 *    to avoid breaking inbound links).
 *  • Wallet + Billing were two pages for the same data (single-pool credit
 *    model). Merged into one entry, "Wallet" — that page now shows balance,
 *    top-up, and recent transactions in a single view.
 */
export const BRAND_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/brand/dashboard", icon: LayoutDashboard, group: "Work" },
  { label: "Discover creators", short: "Discover", href: "/brand/discover", icon: Users, group: "Work" },
  { label: "Requests", href: "/brand/requests", icon: Send, group: "Work" },
  { label: "Collabs", href: "/brand/collabs", icon: Megaphone, group: "Work" },
  { label: "Library", href: "/brand/vault", icon: Library, group: "Work" },
  { label: "Wallet", href: "/brand/wallet", icon: Wallet, group: "Money" },
  { label: "Settings", href: "/brand/settings", icon: SettingsIcon, group: "Account" },
];

/** Mobile bottom nav — 5 items (Home, Discover, Collabs, Library, Profile) */
export const BRAND_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Discover", href: "/brand/discover", icon: Users },
  { label: "Requests", href: "/brand/requests", icon: Send },
  { label: "Collabs", href: "/brand/collabs", icon: Megaphone },
  { label: "Profile", href: "/brand/settings", icon: UserIcon },
];
