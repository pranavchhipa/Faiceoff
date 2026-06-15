/**
 * Control Centre sidebar nav — SIMPLIFIED for a non-technical operator.
 *
 * EVERYDAY (always visible, plain English): Home, Needs you, People, Money,
 * Collabs — covers 95% of daily work.
 * ADVANCED (collapsed by default): every action queue + the technical config /
 * insight pages, one click away when you need them.
 *
 * Every entry resolves to /<slug>/<segment>.
 */

import {
  Home,
  ListChecks,
  Users,
  Wallet,
  Megaphone,
  BadgeCheck,
  Building2,
  Banknote,
  Scale,
  LifeBuoy,
  Shield,
  Cpu,
  Tag,
  Mail,
  Settings,
  TrendingUp,
  FileCheck2,
  Server,
  Lock,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export interface CCNavItem {
  segment: string; // url after the slug, e.g. "ops"
  label: string;
  icon: LucideIcon;
  group: "EVERYDAY" | "QUEUES" | "ADVANCED";
}

export const CC_NAV: CCNavItem[] = [
  // EVERYDAY — the simple daily view
  { segment: "ops", label: "Home", icon: Home, group: "EVERYDAY" },
  { segment: "inbox", label: "Needs you", icon: ListChecks, group: "EVERYDAY" },
  { segment: "users", label: "People", icon: Users, group: "EVERYDAY" },
  { segment: "money", label: "Money", icon: Wallet, group: "EVERYDAY" },
  { segment: "collabs", label: "Collabs", icon: Megaphone, group: "EVERYDAY" },

  // QUEUES — the daily action queues (visible — this IS the core operator work)
  { segment: "verifications", label: "Creator verifications", icon: BadgeCheck, group: "QUEUES" },
  { segment: "brand-verifications", label: "Brand verifications", icon: Building2, group: "QUEUES" },
  { segment: "payouts", label: "Payouts", icon: Banknote, group: "QUEUES" },
  { segment: "disputes", label: "Disputes", icon: Scale, group: "QUEUES" },
  { segment: "tickets", label: "Support tickets", icon: LifeBuoy, group: "QUEUES" },
  { segment: "moderation", label: "Moderation", icon: Shield, group: "QUEUES" },

  // ADVANCED — technical config + insights only (collapsed by default)
  { segment: "ai", label: "AI pipeline", icon: Cpu, group: "ADVANCED" },
  { segment: "pricing", label: "Pricing", icon: Tag, group: "ADVANCED" },
  { segment: "comms", label: "Comms", icon: Mail, group: "ADVANCED" },
  { segment: "config", label: "System", icon: Settings, group: "ADVANCED" },
  { segment: "health", label: "Health", icon: TrendingUp, group: "ADVANCED" },
  { segment: "compliance", label: "Compliance", icon: FileCheck2, group: "ADVANCED" },
  { segment: "infra", label: "Infra", icon: Server, group: "ADVANCED" },
  { segment: "security", label: "Security", icon: Lock, group: "ADVANCED" },
  { segment: "audit", label: "Audit log", icon: ScrollText, group: "ADVANCED" },
];

export const GROUP_ORDER: CCNavItem["group"][] = ["EVERYDAY", "QUEUES", "ADVANCED"];
