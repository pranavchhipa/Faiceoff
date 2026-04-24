import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  IndianRupee,
  Banknote,
  ArrowDownToLine,
  FileSignature,
  ShieldOff,
  User as UserIcon,
  Settings as SettingsIcon,
  Camera,
  Megaphone,
  TrendingUp,
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
  { label: "Approvals", href: "/creator/approvals", icon: Inbox, group: "Primary" },
  { label: "Likeness", href: "/creator/likeness", icon: Camera, group: "Primary" },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee, group: "Primary" },
  { label: "Withdraw", href: "/creator/withdraw", icon: ArrowDownToLine, group: "Primary" },
  // Secondary — only visible in command palette + overflow menu
  { label: "Collaborations", href: "/creator/collaborations", icon: Megaphone, group: "Secondary" },
  { label: "Licenses", href: "/creator/licenses", icon: FileSignature, group: "Secondary" },
  { label: "Payouts", href: "/creator/payouts", icon: Banknote, group: "Secondary" },
  { label: "Analytics", href: "/creator/analytics", icon: TrendingUp, group: "Secondary" },
  { label: "Blocked categories", href: "/creator/blocked-categories", icon: ShieldOff, group: "Secondary" },
  { label: "Settings", href: "/creator/settings", icon: SettingsIcon, group: "Secondary" },
];

export const CREATOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Approve", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Earn", href: "/creator/earnings", icon: IndianRupee },
  { label: "Profile", href: "/creator/settings", icon: UserIcon },
];
