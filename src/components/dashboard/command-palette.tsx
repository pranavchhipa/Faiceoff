"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Inbox,
  Wallet,
  ArrowDownToLine,
  Camera,
  ShieldAlert,
  Hourglass,
  Package,
  Settings,
  Moon,
  Sun,
  LogOut,
  IndianRupee,
  ClipboardCheck,
  Image as ImageIcon,
  TrendingUp,
  FileSignature,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { Role } from "@/config/routes";

interface PaletteItem {
  label: string;
  href?: string;
  action?: () => void;
  icon: LucideIcon;
  shortcut?: string;
  keywords?: string;
}

interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

/**
 * Hook: globally listen for ⌘K / Ctrl+K to open the palette.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}

interface CommandPaletteProps {
  role: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ role, open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const runNav = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const runAction = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange],
  );

  // Compose groups by role
  const groups: PaletteGroup[] = [];

  if (role === "creator") {
    groups.push({
      heading: "Jump to",
      items: [
        { label: "Dashboard", href: "/creator/dashboard", icon: LayoutDashboard },
        { label: "My Likeness", href: "/creator/likeness", icon: Camera },
        { label: "Approvals", href: "/creator/approvals", icon: Inbox },
        { label: "Collaborations", href: "/creator/collaborations", icon: Megaphone },
        { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
        { label: "Payouts", href: "/creator/payouts", icon: Wallet },
        { label: "Withdraw", href: "/creator/withdraw", icon: ArrowDownToLine },
        { label: "Analytics", href: "/creator/analytics", icon: TrendingUp },
        { label: "Licenses", href: "/creator/licenses", icon: FileSignature },
        { label: "Blocked categories", href: "/creator/blocked-categories", icon: ShieldAlert },
        { label: "Settings", href: "/creator/settings", icon: Settings },
      ],
    });
  } else if (role === "brand") {
    groups.push({
      heading: "Jump to",
      items: [
        { label: "Dashboard", href: "/brand/dashboard", icon: LayoutDashboard },
        { label: "Discover Creators", href: "/brand/discover", icon: Users },
        { label: "Sessions", href: "/brand/sessions", icon: Megaphone },
        { label: "Vault", href: "/brand/vault", icon: ImageIcon },
        { label: "Licenses", href: "/brand/licenses", icon: FileSignature },
        { label: "Credits", href: "/brand/credits", icon: IndianRupee },
        { label: "Wallet", href: "/brand/wallet", icon: Wallet },
        { label: "Billing", href: "/brand/billing", icon: Package },
        { label: "Settings", href: "/brand/settings", icon: Settings },
      ],
    });
    groups.push({
      heading: "Actions",
      items: [
        {
          label: "New generation brief",
          href: "/brand/sessions",
          icon: Megaphone,
          keywords: "create generate brief new session",
        },
        {
          label: "Top up credits",
          href: "/brand/credits",
          icon: IndianRupee,
          keywords: "recharge add money wallet",
        },
      ],
    });
  } else if (role === "admin") {
    groups.push({
      heading: "Jump to",
      items: [
        { label: "Overview", href: "/admin", icon: LayoutDashboard },
        { label: "Credit packs", href: "/admin/packs", icon: Package },
        { label: "Safety review", href: "/admin/safety", icon: ShieldAlert },
        { label: "Stuck generations", href: "/admin/stuck-gens", icon: Hourglass },
      ],
    });
  }

  // Always-available theme + help group
  groups.push({
    heading: "Preferences",
    items: [
      {
        label: isDark ? "Switch to light theme" : "Switch to dark theme",
        action: () => setTheme(isDark ? "light" : "dark"),
        icon: isDark ? Sun : Moon,
        shortcut: "⇧T",
      },
      {
        label: "Approvals help",
        href: "/help",
        icon: HelpCircle,
        keywords: "help docs faq",
      },
      {
        label: "Sign out",
        action: async () => {
          await fetch("/api/auth/sign-out", { method: "POST" });
          router.push("/");
          router.refresh();
        },
        icon: LogOut,
      },
    ],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] overflow-hidden p-0 gap-0 [&>[data-slot=dialog-close-button]]:hidden">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          filter={(value, search, keywords) => {
            const haystack = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Type a command or search..." autoFocus />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map((group, idx) => (
              <div key={group.heading}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.label}
                        value={item.label}
                        keywords={item.keywords ? item.keywords.split(" ") : undefined}
                        onSelect={() => {
                          if (item.href) runNav(item.href);
                          else if (item.action) runAction(item.action);
                        }}
                        className="cursor-pointer"
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <CommandShortcut>{item.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2 text-[10px] font-mono text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-2">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-0.5">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-2">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-0.5">↵</kbd>
              select
              <kbd className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-0.5">esc</kbd>
              close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
