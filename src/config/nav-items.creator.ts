import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  Megaphone,
  IndianRupee,
  FileStack,
  User as UserIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

export const CREATOR_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Sessions", href: "/creator/sessions", icon: Megaphone },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Listings", href: "/creator/listings", icon: FileStack },
  { label: "Settings", href: "/creator/settings", icon: SettingsIcon },
];

export const CREATOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Profile", href: "/creator/settings", icon: UserIcon },
];
