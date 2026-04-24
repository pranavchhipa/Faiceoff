import {
  LayoutDashboard,
  Package,
  ShieldAlert,
  Hourglass,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

/**
 * Admin split-stage sidebar — grouped by workflow.
 * Only 4 pages actually exist today; keep group headings so the
 * chrome can accommodate future Triage / Manage / System additions.
 */
export const ADMIN_SIDE_NAV: NavItem[] = [
  // Triage
  { label: "Overview", href: "/admin", icon: LayoutDashboard, group: "Triage" },
  { label: "Safety review", href: "/admin/safety", icon: ShieldAlert, group: "Triage" },
  { label: "Stuck generations", href: "/admin/stuck-gens", icon: Hourglass, group: "Triage" },
  // Manage
  { label: "Credit packs", href: "/admin/packs", icon: Package, group: "Manage" },
];
