import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  Users,
  FileSignature,
  Megaphone,
  Wallet,
  CreditCard,
  Image as ImageIcon,
  Receipt,
  Settings as SettingsIcon,
  User as UserIcon,
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

/** Full desktop side nav — primary items, grouped for Brand icon rail tooltips */
export const BRAND_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/brand/dashboard", icon: LayoutDashboard, group: "Work" },
  { label: "Discover creators", short: "Discover", href: "/brand/discover", icon: Users, group: "Work" },
  { label: "Sessions", href: "/brand/sessions", icon: Megaphone, group: "Work" },
  { label: "Vault", href: "/brand/vault", icon: ImageIcon, group: "Work" },
  { label: "Licenses", href: "/brand/licenses", icon: FileSignature, group: "Work" },
  { label: "Credits", href: "/brand/credits", icon: CreditCard, group: "Money" },
  { label: "Wallet", href: "/brand/wallet", icon: Wallet, group: "Money" },
  { label: "Billing", href: "/brand/billing", icon: Receipt, group: "Money" },
  { label: "Settings", href: "/brand/settings", icon: SettingsIcon, group: "Account" },
];

/** Mobile bottom nav — 5 items (Home, Discover, Sessions [FAB slot], Vault, Profile) */
export const BRAND_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Discover", href: "/brand/discover", icon: Users },
  { label: "Sessions", href: "/brand/sessions", icon: Megaphone },
  { label: "Vault", href: "/brand/vault", icon: ImageIcon },
  { label: "Profile", href: "/brand/settings", icon: UserIcon },
];
