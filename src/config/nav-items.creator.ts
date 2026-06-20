import {
  LayoutDashboard,
  Inbox,
  IndianRupee,
  ShieldOff,
  User as UserIcon,
  Settings as SettingsIcon,
  Camera,
  Megaphone,
  TrendingUp,
  Tags,
  Share2,
  LifeBuoy,
  BadgeCheck,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

/**
 * Creator editorial nav — rendered as top pill tabs (desktop),
 * NOT a sidebar. Keep to ~5-6 primary items to fit on one row.
 * Overflow items live in the command palette (⌘K).
 */
export const CREATOR_SIDE_NAV: NavItem[] = [
  { label: "Overview", short: "Overview", href: "/creator/dashboard", icon: LayoutDashboard, group: "Primary" },
  { label: "Requests", href: "/creator/requests", icon: Inbox, group: "Primary" },
  { label: "Collabs", href: "/creator/collabs", icon: Megaphone, group: "Primary" },
  { label: "My Packages", href: "/creator/packages", icon: Tags, group: "Primary" },
  { label: "Public Profile", href: "/creator/profile/setup", icon: Share2, group: "Primary" },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee, group: "Primary" },
  { label: "Likeness", href: "/creator/likeness", icon: Camera, group: "Primary" },
  // Secondary — only visible in command palette + overflow menu
  { label: "Get Verified", href: "/creator/verify", icon: BadgeCheck, group: "Secondary" },
  { label: "Analytics", href: "/creator/analytics", icon: TrendingUp, group: "Secondary" },
  { label: "Blocked categories", href: "/creator/blocked-categories", icon: ShieldOff, group: "Secondary" },
  { label: "Support", href: "/creator/support", icon: LifeBuoy, group: "Secondary" },
  { label: "Settings", href: "/creator/settings", icon: SettingsIcon, group: "Secondary" },
];

export const CREATOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Collabs", href: "/creator/collabs", icon: Megaphone },
  { label: "Earn", href: "/creator/earnings", icon: IndianRupee },
  { label: "Profile", href: "/creator/settings", icon: UserIcon },
];
