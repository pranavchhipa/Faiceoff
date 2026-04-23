import {
  LayoutDashboard,
  AlertTriangle,
  ReceiptText,
  RefreshCw,
  Users,
  ScrollText,
  FileText,
  Package,
  ShieldAlert,
  Hourglass,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

export const ADMIN_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Packs", href: "/admin/packs", icon: Package },
  { label: "Safety queue", href: "/admin/safety", icon: ShieldAlert },
  { label: "Stuck gens", href: "/admin/stuck-gens", icon: Hourglass },
  { label: "Disputes", href: "/admin/disputes", icon: AlertTriangle },
  { label: "Ledgers", href: "/admin/ledgers", icon: ReceiptText },
  { label: "Reconcile", href: "/admin/reconcile", icon: RefreshCw },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Contracts", href: "/admin/contracts", icon: FileText },
  { label: "Audit log", href: "/admin/audit-log", icon: ScrollText },
];
