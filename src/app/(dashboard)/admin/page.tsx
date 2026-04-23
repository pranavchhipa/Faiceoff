// ─────────────────────────────────────────────────────────────────────────────
// /admin — Admin landing hub
//
// Simple grid of admin tools. Renders inside (dashboard) layout so admins
// can navigate to the operational pages they need (packs, safety, stuck
// generations, etc.).
//
// ROLE_HOME.admin = "/admin", so this is what admin users see right after
// login. Keep it lightweight — no heavy DB queries here, individual pages
// own their own data fetching.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Package,
  Shield,
  AlertTriangle,
  Users,
  ScrollText,
  AlertCircle,
  IdCard,
  LayoutDashboard,
} from "lucide-react";

export const metadata = {
  title: "Admin — Faiceoff",
};

interface AdminTile {
  href: string;
  title: string;
  description: string;
  icon: typeof Package;
  status: "live" | "soon";
}

const TILES: AdminTile[] = [
  {
    href: "/admin/packs",
    title: "Credit packs",
    description: "Manage pack catalog, pricing, GST treatment.",
    icon: Package,
    status: "live",
  },
  {
    href: "/admin/safety",
    title: "Safety review",
    description: "Hive flags, manual moderation queue.",
    icon: Shield,
    status: "live",
  },
  {
    href: "/admin/stuck-gens",
    title: "Stuck generations",
    description: "Pipeline failures and retry tooling.",
    icon: AlertTriangle,
    status: "live",
  },
  {
    href: "/admin/users",
    title: "Users",
    description: "Search users, change roles, suspend.",
    icon: Users,
    status: "soon",
  },
  {
    href: "/admin/kyc-queue",
    title: "KYC queue",
    description: "Review creator KYC submissions.",
    icon: IdCard,
    status: "soon",
  },
  {
    href: "/admin/disputes",
    title: "Disputes",
    description: "Brand/creator dispute resolution.",
    icon: AlertCircle,
    status: "soon",
  },
  {
    href: "/admin/audit",
    title: "Audit log",
    description: "All sensitive actions across the platform.",
    icon: ScrollText,
    status: "soon",
  },
  {
    href: "/admin/dashboard",
    title: "Metrics",
    description: "Platform health, GMV, conversion.",
    icon: LayoutDashboard,
    status: "soon",
  },
];

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="mb-2 text-[11px] font-700 uppercase tracking-widest text-[var(--color-neutral-500)]">
          Admin
        </p>
        <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-700 tracking-tight text-[var(--color-ink)]">
          Operations console
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-neutral-600)]">
          Internal tooling for the Faiceoff team. Pages marked &ldquo;soon&rdquo; are
          stubs waiting on implementation.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          const isLive = tile.status === "live";
          const Wrapper = isLive ? Link : "div";
          const wrapperProps = isLive ? { href: tile.href } : {};

          return (
            <Wrapper
              key={tile.href}
              {...(wrapperProps as { href: string })}
              className={`group block rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 no-underline shadow-[var(--shadow-soft)] transition-all ${
                isLive
                  ? "hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[var(--shadow-card)]"
                  : "opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10">
                  <Icon className="size-5 text-[var(--color-primary)]" />
                </div>
                {!isLive && (
                  <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[10px] font-700 uppercase tracking-wide text-[var(--color-neutral-500)]">
                    Soon
                  </span>
                )}
              </div>
              <h3 className="mb-1 font-[family-name:var(--font-outfit)] text-base font-700 text-[var(--color-ink)]">
                {tile.title}
              </h3>
              <p className="text-[13px] leading-relaxed text-[var(--color-neutral-600)]">
                {tile.description}
              </p>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
