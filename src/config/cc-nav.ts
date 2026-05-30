/**
 * Control Centre sidebar nav. Internal-tool aesthetic — terse labels,
 * grouped by domain. Every entry resolves to /<slug>/<segment>.
 */

import {
  Activity,
  Wallet,
  Users,
  Megaphone,
  Shield,
  Cpu,
  Tag,
  Mail,
  Scale,
  TrendingUp,
  Settings,
  FileCheck2,
  Server,
  Lock,
  ScrollText,
  LifeBuoy,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

export interface CCNavItem {
  segment: string; // url after the slug, e.g. "ops"
  label: string;
  icon: LucideIcon;
  group: "OPS" | "CONFIG" | "INSIGHTS" | "OWNER";
}

export const CC_NAV: CCNavItem[] = [
  // OPS — what you look at every day
  { segment: "ops", label: "Operations", icon: Activity, group: "OPS" },
  { segment: "money", label: "Money", icon: Wallet, group: "OPS" },
  { segment: "users", label: "Users", icon: Users, group: "OPS" },
  { segment: "collabs", label: "Collabs", icon: Megaphone, group: "OPS" },
  { segment: "moderation", label: "Moderation", icon: Shield, group: "OPS" },
  { segment: "verifications", label: "Verifications", icon: BadgeCheck, group: "OPS" },
  { segment: "disputes", label: "Disputes", icon: Scale, group: "OPS" },
  { segment: "tickets", label: "Support tickets", icon: LifeBuoy, group: "OPS" },

  // CONFIG — knobs you turn
  { segment: "ai", label: "AI pipeline", icon: Cpu, group: "CONFIG" },
  { segment: "pricing", label: "Pricing", icon: Tag, group: "CONFIG" },
  { segment: "comms", label: "Comms", icon: Mail, group: "CONFIG" },
  { segment: "config", label: "System", icon: Settings, group: "CONFIG" },

  // INSIGHTS — read-only views
  { segment: "health", label: "Health", icon: TrendingUp, group: "INSIGHTS" },
  { segment: "compliance", label: "Compliance", icon: FileCheck2, group: "INSIGHTS" },
  { segment: "infra", label: "Infra", icon: Server, group: "INSIGHTS" },
  { segment: "security", label: "Security", icon: Lock, group: "INSIGHTS" },

  // OWNER — yourself
  { segment: "audit", label: "Audit log", icon: ScrollText, group: "OWNER" },
];

export const GROUP_ORDER: CCNavItem["group"][] = [
  "OPS",
  "CONFIG",
  "INSIGHTS",
  "OWNER",
];
