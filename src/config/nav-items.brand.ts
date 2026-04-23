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
  /** Hide from desktop side nav? (e.g. only on mobile bottom tab) */
  desktopOnly?: boolean;
  mobileOnly?: boolean;
}

/** Full desktop side nav — primary items */
export const BRAND_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Creators", href: "/brand/creators", icon: Users },
  { label: "Sessions", href: "/brand/sessions", icon: Megaphone },
  { label: "Vault", href: "/brand/vault", icon: ImageIcon },
  { label: "Licenses", href: "/brand/licenses", icon: FileSignature },
  { label: "Credits", href: "/brand/credits", icon: CreditCard },
  { label: "Wallet", href: "/brand/wallet", icon: Wallet },
  { label: "Billing", href: "/brand/billing", icon: Receipt },
  { label: "Settings", href: "/brand/settings", icon: SettingsIcon },
];

/** Mobile bottom nav — 5 items (Home, Creators, Sessions, Credits, Profile) */
export const BRAND_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Creators", href: "/brand/creators", icon: Users },
  { label: "Sessions", href: "/brand/sessions", icon: Megaphone },
  { label: "Credits", href: "/brand/credits", icon: CreditCard },
  { label: "Profile", href: "/brand/settings", icon: UserIcon },
];
