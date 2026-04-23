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
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

export const CREATOR_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Withdraw", href: "/creator/withdraw", icon: ArrowDownToLine },
  { label: "Payouts", href: "/creator/payouts", icon: Banknote },
  { label: "Licenses", href: "/creator/licenses", icon: FileSignature },
  { label: "Blocked categories", href: "/creator/blocked-categories", icon: ShieldOff },
  { label: "Settings", href: "/creator/settings", icon: SettingsIcon },
];

export const CREATOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Profile", href: "/creator/settings", icon: UserIcon },
];
