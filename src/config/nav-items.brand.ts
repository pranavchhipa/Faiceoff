import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Coins,
  Library,
  FileSignature,
  Settings as SettingsIcon,
  User as UserIcon,
  Send,
  LifeBuoy,
  BadgeCheck,
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
 *  • No separate wallet step — brands buy credits directly via Razorpay
 *    checkout on /brand/credits (also how a paid collab package tops up
 *    the same pool). The older wallet-balance concept was removed.
 */
export const BRAND_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/brand/dashboard", icon: LayoutDashboard, group: "Work" },
  { label: "Discover creators", short: "Discover", href: "/brand/discover", icon: Users, group: "Work" },
  { label: "Requests", href: "/brand/requests", icon: Send, group: "Work" },
  { label: "Collabs", href: "/brand/collabs", icon: Megaphone, group: "Work" },
  { label: "Library", href: "/brand/vault", icon: Library, group: "Work" },
  { label: "Licenses", href: "/brand/licenses", icon: FileSignature, group: "Work" },
  { label: "Credits", href: "/brand/credits", icon: Coins, group: "Money" },
  // Brand verification had no nav entry at all — /brand/verify was only
  // reachable from the dashboard banner, which disappears once dismissed or
  // scrolled past, so a brand who left it half-done had no way back. The
  // creator side has carried "Get Verified" in its nav all along.
  { label: "Get verified", short: "Verify", href: "/brand/verify", icon: BadgeCheck, group: "Account" },
  { label: "Support", href: "/brand/support", icon: LifeBuoy, group: "Account" },
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
